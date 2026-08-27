use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const APP_USER_STATE_SCHEMA_VERSION: u32 = 1;
const PATTERN_PROJECT_SCHEMA_VERSION: u32 = 1;
const PATTERN_PROJECT_KIND: &str = "perlerdrawing.pattern";
const PROJECT_PREVIEW_SCHEMA_VERSION: u32 = 1;
const PROJECT_PREVIEW_MAX_DIMENSION: u32 = 48;
const USER_STATE_FILE_NAME: &str = "user-state.json";
const MAX_RECENT_PROJECTS: usize = 12;
const USER_STATE_BYTE_LIMIT: u64 = 1024 * 1024;
const PROJECT_METADATA_BYTE_LIMIT: u64 = 4 * 1024 * 1024;
const PROJECT_CSV_BYTE_LIMIT: u64 = 8 * 1024 * 1024;
const MAX_JAVASCRIPT_TIMESTAMP: u64 = 8_640_000_000_000_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StorageFailure {
    code: String,
    message: String,
}

impl StorageFailure {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    fn io(code: &str, error: std::io::Error) -> Self {
        Self::new(code, error.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecentProject {
    metadata_path: String,
    csv_path: String,
    display_name: String,
    last_opened_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    preview: Option<ProjectPreview>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectPreview {
    schema_version: u32,
    columns: u32,
    rows: u32,
    colors: Vec<String>,
    cells: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUserState {
    schema_version: u32,
    #[serde(default)]
    recent_projects: Vec<RecentProject>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_project_directory: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_saved_project_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_export_directory: Option<String>,
    #[serde(default)]
    extensions: Map<String, Value>,
}

impl Default for AppUserState {
    fn default() -> Self {
        Self {
            schema_version: APP_USER_STATE_SCHEMA_VERSION,
            recent_projects: Vec::new(),
            last_project_directory: None,
            last_saved_project_path: None,
            last_export_directory: None,
            extensions: Map::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectCsvReference {
    file_name: String,
    encoding: String,
    delimiter: String,
    include_coordinates: bool,
    byte_length: u64,
    checksum: String,
}

#[derive(Debug, Deserialize)]
struct ProjectArtifactHeader {
    name: String,
    version: String,
}

#[derive(Debug, Deserialize)]
struct ProjectDocumentHeader {
    artifact: ProjectArtifactHeader,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectMetadataHeader {
    kind: String,
    schema_version: u32,
    csv: ProjectCsvReference,
    document: ProjectDocumentHeader,
    #[serde(default)]
    preview: Option<ProjectPreview>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveProjectResponse {
    project: RecentProject,
    user_state: AppUserState,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadProjectResponse {
    project: RecentProject,
    metadata_contents: String,
    csv_contents: String,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn user_state_path(app: &AppHandle) -> Result<PathBuf, StorageFailure> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(USER_STATE_FILE_NAME))
        .map_err(|error| StorageFailure::new("app_config_unavailable", error.to_string()))
}

fn unique_sibling_path(target: &Path, label: &str) -> Result<PathBuf, StorageFailure> {
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| StorageFailure::new("invalid_path", "The file name is not valid UTF-8."))?;
    Ok(target.with_file_name(format!(
        ".{file_name}.{}.{}.{label}",
        std::process::id(),
        now_millis()
    )))
}

fn atomic_write(target: &Path, contents: &[u8]) -> Result<(), StorageFailure> {
    let parent = target.parent().ok_or_else(|| {
        StorageFailure::new("invalid_path", "The selected path has no parent directory.")
    })?;
    fs::create_dir_all(parent)
        .map_err(|error| StorageFailure::io("directory_create_failed", error))?;
    let temporary = unique_sibling_path(target, "tmp")?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| StorageFailure::io("temporary_write_failed", error))?;
    if let Err(error) = file.write_all(contents).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&temporary);
        return Err(StorageFailure::io("file_write_failed", error));
    }
    drop(file);

    match fs::rename(&temporary, target) {
        Ok(()) => Ok(()),
        Err(_first_error) if target.is_file() => {
            let backup = unique_sibling_path(target, "backup")?;
            fs::rename(target, &backup)
                .map_err(|error| StorageFailure::io("file_replace_failed", error))?;
            if let Err(error) = fs::rename(&temporary, target) {
                let _ = fs::rename(&backup, target);
                let _ = fs::remove_file(&temporary);
                return Err(StorageFailure::io("file_replace_failed", error));
            }
            let _ = fs::remove_file(backup);
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            Err(StorageFailure::io("file_replace_failed", error))
        }
    }
}

fn read_limited_text(path: &Path, limit: u64, code: &str) -> Result<String, StorageFailure> {
    let size = fs::metadata(path)
        .map_err(|error| StorageFailure::io(code, error))?
        .len();
    if size > limit {
        return Err(StorageFailure::new(
            "file_too_large",
            format!("{} exceeds the {} byte limit.", path.display(), limit),
        ));
    }
    fs::read_to_string(path).map_err(|error| StorageFailure::io(code, error))
}

fn backup_invalid_user_state(path: &Path) -> Result<(), StorageFailure> {
    let backup = path.with_file_name(format!("user-state.invalid-{}.json", now_millis()));
    fs::rename(path, backup).map_err(|error| StorageFailure::io("user_state_backup_failed", error))
}

fn read_user_state(path: &Path) -> Result<AppUserState, StorageFailure> {
    if !path.exists() {
        return Ok(AppUserState::default());
    }
    let contents = match read_limited_text(path, USER_STATE_BYTE_LIMIT, "user_state_read_failed") {
        Ok(contents) => contents,
        Err(error) if error.code == "file_too_large" => {
            backup_invalid_user_state(path)?;
            return Ok(AppUserState::default());
        }
        Err(error) => return Err(error),
    };
    let state: AppUserState = match serde_json::from_str(&contents) {
        Ok(state) => state,
        Err(_) => {
            backup_invalid_user_state(path)?;
            return Ok(AppUserState::default());
        }
    };
    if state.schema_version != APP_USER_STATE_SCHEMA_VERSION {
        return Err(StorageFailure::new(
            "unsupported_user_state",
            format!(
                "Unsupported user-state schema version {}.",
                state.schema_version
            ),
        ));
    }
    Ok(state)
}

fn write_user_state(path: &Path, state: &AppUserState) -> Result<(), StorageFailure> {
    let contents = serde_json::to_vec_pretty(state)
        .map_err(|error| StorageFailure::new("user_state_encode_failed", error.to_string()))?;
    if contents.len() as u64 > USER_STATE_BYTE_LIMIT {
        return Err(StorageFailure::new(
            "user_state_too_large",
            "The application user state exceeds its size limit.",
        ));
    }
    atomic_write(path, &[contents.as_slice(), b"\n"].concat())
}

fn normalize_metadata_path(path: &Path) -> Result<PathBuf, StorageFailure> {
    if !path.is_absolute() {
        return Err(StorageFailure::new(
            "invalid_path",
            "Project paths must be absolute.",
        ));
    }
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| StorageFailure::new("invalid_path", "The file name is not valid UTF-8."))?;
    if file_name.to_ascii_lowercase().ends_with(".perler.json") {
        return Ok(path.to_path_buf());
    }
    Ok(path.with_extension("perler.json"))
}

fn require_metadata_path(path: &Path) -> Result<PathBuf, StorageFailure> {
    let normalized = normalize_metadata_path(path)?;
    if normalized != path {
        return Err(StorageFailure::new(
            "invalid_project_path",
            "PerlerDrawing projects must use the .perler.json extension.",
        ));
    }
    Ok(normalized)
}

fn validate_csv_file_name(file_name: &str) -> Result<(), StorageFailure> {
    if file_name.is_empty()
        || file_name == "."
        || file_name == ".."
        || file_name.contains('/')
        || file_name.contains('\\')
        || !file_name.to_ascii_lowercase().ends_with(".csv")
    {
        return Err(StorageFailure::new(
            "invalid_csv_reference",
            "Project metadata must reference a sibling .csv file.",
        ));
    }
    Ok(())
}

fn validate_project_preview(preview: &ProjectPreview) -> Result<(), StorageFailure> {
    if preview.schema_version != PROJECT_PREVIEW_SCHEMA_VERSION
        || preview.columns == 0
        || preview.rows == 0
        || preview.columns > PROJECT_PREVIEW_MAX_DIMENSION
        || preview.rows > PROJECT_PREVIEW_MAX_DIMENSION
    {
        return Err(StorageFailure::new(
            "invalid_project_preview",
            "Project preview dimensions or schema are invalid.",
        ));
    }
    let cell_count = usize::try_from(preview.columns * preview.rows).map_err(|_| {
        StorageFailure::new(
            "invalid_project_preview",
            "Project preview dimensions overflow.",
        )
    })?;
    if preview.colors.len() > cell_count
        || preview.colors.iter().any(|color| {
            color.len() != 7
                || !color.starts_with('#')
                || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
        })
        || preview.cells.len() != cell_count * 4
        || !preview.cells.as_bytes().iter().all(u8::is_ascii_hexdigit)
    {
        return Err(StorageFailure::new(
            "invalid_project_preview",
            "Project preview colors or cells are invalid.",
        ));
    }
    for chunk in preview.cells.as_bytes().chunks_exact(4) {
        let token = std::str::from_utf8(chunk).map_err(|_| {
            StorageFailure::new("invalid_project_preview", "Project preview is not ASCII.")
        })?;
        let index = u16::from_str_radix(token, 16).map_err(|_| {
            StorageFailure::new(
                "invalid_project_preview",
                "Project preview contains an invalid cell.",
            )
        })?;
        if index != u16::MAX && usize::from(index) >= preview.colors.len() {
            return Err(StorageFailure::new(
                "invalid_project_preview",
                "Project preview contains an invalid color index.",
            ));
        }
    }
    Ok(())
}

fn checksum_utf8(contents: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in contents.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn validate_project_csv(
    reference: &ProjectCsvReference,
    contents: &str,
) -> Result<(), StorageFailure> {
    if reference.encoding != "utf-8-bom"
        || reference.delimiter != "comma"
        || !reference.include_coordinates
        || !contents.starts_with('\u{feff}')
    {
        return Err(StorageFailure::new(
            "invalid_project_csv",
            "Project CSV settings are unsupported.",
        ));
    }
    if reference.byte_length != contents.len() as u64
        || reference.checksum != checksum_utf8(contents)
    {
        return Err(StorageFailure::new(
            "project_csv_mismatch",
            "Project CSV does not match its metadata checksum.",
        ));
    }
    Ok(())
}

fn paired_csv_path(metadata_path: &Path) -> Result<PathBuf, StorageFailure> {
    let file_name = metadata_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| StorageFailure::new("invalid_path", "The file name is not valid UTF-8."))?;
    let suffix = ".perler.json";
    let base_name = file_name
        .get(..file_name.len().saturating_sub(suffix.len()))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            StorageFailure::new(
                "invalid_project_path",
                "The project file name is incomplete.",
            )
        })?;
    Ok(metadata_path.with_file_name(format!("{base_name}.csv")))
}

fn parse_project_header(contents: &str) -> Result<ProjectMetadataHeader, StorageFailure> {
    let header: ProjectMetadataHeader = serde_json::from_str(contents)
        .map_err(|error| StorageFailure::new("invalid_project_metadata", error.to_string()))?;
    if header.kind != PATTERN_PROJECT_KIND {
        return Err(StorageFailure::new(
            "invalid_project_kind",
            "The selected JSON file is not a PerlerDrawing project.",
        ));
    }
    if header.schema_version != PATTERN_PROJECT_SCHEMA_VERSION {
        return Err(StorageFailure::new(
            "unsupported_project",
            format!(
                "Unsupported project schema version {}.",
                header.schema_version
            ),
        ));
    }
    validate_csv_file_name(&header.csv.file_name)?;
    if header.csv.checksum.len() != 16
        || !header
            .csv
            .checksum
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err(StorageFailure::new(
            "invalid_project_metadata",
            "Project CSV checksum is invalid.",
        ));
    }
    if let Some(preview) = &header.preview {
        validate_project_preview(preview)?;
    }
    if header.document.artifact.name.trim().is_empty()
        || header.document.artifact.version.trim().is_empty()
    {
        return Err(StorageFailure::new(
            "invalid_project_metadata",
            "Project artifact identity is incomplete.",
        ));
    }
    Ok(header)
}

fn project_descriptor(
    metadata_path: &Path,
    header: &ProjectMetadataHeader,
) -> Result<RecentProject, StorageFailure> {
    let csv_path = paired_csv_path(metadata_path)?;
    if csv_path.file_name().and_then(|value| value.to_str()) != Some(header.csv.file_name.as_str())
    {
        return Err(StorageFailure::new(
            "invalid_csv_reference",
            "Project metadata must reference the same-name sibling CSV file.",
        ));
    }
    Ok(RecentProject {
        metadata_path: metadata_path.to_string_lossy().into_owned(),
        csv_path: csv_path.to_string_lossy().into_owned(),
        display_name: format!(
            "{} {}",
            header.document.artifact.name, header.document.artifact.version
        ),
        last_opened_at: now_millis(),
        preview: header.preview.clone(),
    })
}

fn same_path(left: &str, right: &str) -> bool {
    if cfg!(target_os = "windows") {
        left.eq_ignore_ascii_case(right)
    } else {
        left == right
    }
}

fn touch_recent(state: &mut AppUserState, project: RecentProject) {
    state
        .recent_projects
        .retain(|entry| !same_path(&entry.metadata_path, &project.metadata_path));
    state.recent_projects.insert(0, project);
    state.recent_projects.truncate(MAX_RECENT_PROJECTS);
}

fn read_project_from_path(
    metadata_path: &Path,
) -> Result<(RecentProject, String, String), StorageFailure> {
    let metadata_path = require_metadata_path(metadata_path)?;
    let metadata_contents = read_limited_text(
        &metadata_path,
        PROJECT_METADATA_BYTE_LIMIT,
        "project_metadata_read_failed",
    )?;
    let header = parse_project_header(&metadata_contents)?;
    let project = project_descriptor(&metadata_path, &header)?;
    let csv_contents = read_limited_text(
        Path::new(&project.csv_path),
        PROJECT_CSV_BYTE_LIMIT,
        "project_csv_read_failed",
    )?;
    validate_project_csv(&header.csv, &csv_contents)?;
    Ok((project, metadata_contents, csv_contents))
}

#[tauri::command]
pub(crate) fn load_app_user_state(app: AppHandle) -> Result<AppUserState, StorageFailure> {
    let path = user_state_path(&app)?;
    let mut state = read_user_state(&path)?;
    let previous_state = state.clone();
    for project in &mut state.recent_projects {
        if project
            .preview
            .as_ref()
            .is_some_and(|preview| validate_project_preview(preview).is_err())
        {
            project.preview = None;
        }
    }
    state.recent_projects.retain(|project| {
        let metadata_path = Path::new(&project.metadata_path);
        let csv_path = Path::new(&project.csv_path);
        metadata_path.is_absolute()
            && csv_path.is_absolute()
            && metadata_path.is_file()
            && csv_path.is_file()
            && !project.display_name.trim().is_empty()
            && project.last_opened_at <= MAX_JAVASCRIPT_TIMESTAMP
    });
    state
        .recent_projects
        .sort_by(|left, right| right.last_opened_at.cmp(&left.last_opened_at));
    state.recent_projects.truncate(MAX_RECENT_PROJECTS);
    if state.last_saved_project_path.as_ref().is_some_and(|value| {
        let path = Path::new(value);
        !path.is_absolute() || !path.is_file()
    }) {
        state.last_saved_project_path = None;
    }
    if state.last_project_directory.as_ref().is_some_and(|value| {
        let path = Path::new(value);
        !path.is_absolute() || !path.is_dir()
    }) {
        state.last_project_directory = None;
    }
    if state.last_export_directory.as_ref().is_some_and(|value| {
        let path = Path::new(value);
        !path.is_absolute() || !path.is_dir()
    }) {
        state.last_export_directory = None;
    }
    if previous_state != state {
        write_user_state(&path, &state)?;
    }
    Ok(state)
}

#[tauri::command]
pub(crate) fn save_pattern_project(
    app: AppHandle,
    metadata_path: String,
    csv_contents: String,
    metadata_contents: String,
) -> Result<SaveProjectResponse, StorageFailure> {
    if metadata_contents.len() as u64 > PROJECT_METADATA_BYTE_LIMIT
        || csv_contents.len() as u64 > PROJECT_CSV_BYTE_LIMIT
    {
        return Err(StorageFailure::new(
            "file_too_large",
            "The project exceeds its save size limit.",
        ));
    }
    let metadata_path = normalize_metadata_path(Path::new(&metadata_path))?;
    let header = parse_project_header(&metadata_contents)?;
    validate_project_csv(&header.csv, &csv_contents)?;
    let project = project_descriptor(&metadata_path, &header)?;
    let expected_csv_path = paired_csv_path(&metadata_path)?;

    atomic_write(&expected_csv_path, csv_contents.as_bytes())?;
    atomic_write(&metadata_path, metadata_contents.as_bytes())?;

    let state_path = user_state_path(&app)?;
    let mut state = read_user_state(&state_path)?;
    touch_recent(&mut state, project.clone());
    state.last_project_directory = metadata_path
        .parent()
        .map(|path| path.to_string_lossy().into_owned());
    state.last_saved_project_path = Some(metadata_path.to_string_lossy().into_owned());
    write_user_state(&state_path, &state)?;
    Ok(SaveProjectResponse {
        project,
        user_state: state,
    })
}

#[tauri::command]
pub(crate) fn read_pattern_project(
    metadata_path: String,
) -> Result<ReadProjectResponse, StorageFailure> {
    let (project, metadata_contents, csv_contents) =
        read_project_from_path(Path::new(&metadata_path))?;
    Ok(ReadProjectResponse {
        project,
        metadata_contents,
        csv_contents,
    })
}

#[tauri::command]
pub(crate) fn record_recent_project(
    app: AppHandle,
    metadata_path: String,
    preview: Option<ProjectPreview>,
) -> Result<AppUserState, StorageFailure> {
    if let Some(preview) = &preview {
        validate_project_preview(preview)?;
    }
    let (mut project, _, _) = read_project_from_path(Path::new(&metadata_path))?;
    if preview.is_some() {
        project.preview = preview;
    }
    let state_path = user_state_path(&app)?;
    let mut state = read_user_state(&state_path)?;
    touch_recent(&mut state, project.clone());
    state.last_project_directory = Path::new(&project.metadata_path)
        .parent()
        .map(|path| path.to_string_lossy().into_owned());
    write_user_state(&state_path, &state)?;
    Ok(state)
}

#[tauri::command]
pub(crate) fn record_export_path(
    app: AppHandle,
    export_path: String,
) -> Result<AppUserState, StorageFailure> {
    let export_path = Path::new(&export_path);
    if !export_path.is_absolute() {
        return Err(StorageFailure::new(
            "invalid_path",
            "Export paths must be absolute.",
        ));
    }
    let directory = export_path
        .parent()
        .filter(|path| path.is_dir())
        .ok_or_else(|| {
            StorageFailure::new(
                "invalid_export_directory",
                "The selected export directory is unavailable.",
            )
        })?;
    let state_path = user_state_path(&app)?;
    let mut state = read_user_state(&state_path)?;
    state.last_export_directory = Some(directory.to_string_lossy().into_owned());
    write_user_state(&state_path, &state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::{
        checksum_utf8, normalize_metadata_path, parse_project_header, touch_recent,
        validate_project_csv, validate_project_preview, AppUserState, ProjectCsvReference,
        ProjectPreview, RecentProject, MAX_RECENT_PROJECTS,
    };
    use std::path::Path;

    fn recent(index: usize, path: &str) -> RecentProject {
        RecentProject {
            metadata_path: path.to_string(),
            csv_path: format!("/tmp/pattern-{index}.csv"),
            display_name: format!("pattern_{index} v1"),
            last_opened_at: index as u64,
            preview: None,
        }
    }

    #[test]
    fn normalizes_project_metadata_extensions() {
        assert_eq!(
            normalize_metadata_path(Path::new("/tmp/flower.json")).unwrap(),
            Path::new("/tmp/flower.perler.json")
        );
        assert_eq!(
            normalize_metadata_path(Path::new("/tmp/flower.perler.json")).unwrap(),
            Path::new("/tmp/flower.perler.json")
        );
        assert!(normalize_metadata_path(Path::new("flower.json")).is_err());
    }

    #[test]
    fn rejects_csv_references_outside_the_project_directory() {
        let metadata = r#"{
            "kind":"perlerdrawing.pattern",
            "schemaVersion":1,
            "csv":{
                "fileName":"../flower.csv",
                "encoding":"utf-8-bom",
                "delimiter":"comma",
                "includeCoordinates":true,
                "byteLength":0,
                "checksum":"0000000000000000"
            },
            "document":{"artifact":{"name":"flower","version":"v1"}}
        }"#;
        assert!(parse_project_header(metadata).is_err());
    }

    #[test]
    fn keeps_recent_projects_deduplicated_and_bounded() {
        let mut state = AppUserState::default();
        for index in 0..(MAX_RECENT_PROJECTS + 3) {
            touch_recent(
                &mut state,
                recent(index, &format!("/tmp/pattern-{index}.perler.json")),
            );
        }
        let newest_path = state.recent_projects[0].metadata_path.clone();
        touch_recent(&mut state, recent(99, &newest_path));

        assert_eq!(state.recent_projects.len(), MAX_RECENT_PROJECTS);
        assert_eq!(state.recent_projects[0].display_name, "pattern_99 v1");
        assert_eq!(
            state
                .recent_projects
                .iter()
                .filter(|entry| entry.metadata_path == newest_path)
                .count(),
            1
        );
    }

    #[test]
    fn verifies_project_csv_bytes_against_metadata() {
        let contents = "\u{feff}row/col,1\r\n1,A1\r\n";
        let reference = ProjectCsvReference {
            file_name: "flower.csv".to_string(),
            encoding: "utf-8-bom".to_string(),
            delimiter: "comma".to_string(),
            include_coordinates: true,
            byte_length: contents.len() as u64,
            checksum: checksum_utf8(contents),
        };

        assert!(validate_project_csv(&reference, contents).is_ok());
        assert!(validate_project_csv(&reference, &contents.replace("A1", "A2")).is_err());
    }

    #[test]
    fn rejects_project_previews_with_unknown_color_indices() {
        let preview = ProjectPreview {
            schema_version: 1,
            columns: 1,
            rows: 1,
            colors: Vec::new(),
            cells: "0000".to_string(),
        };

        assert!(validate_project_preview(&preview).is_err());
    }
}
