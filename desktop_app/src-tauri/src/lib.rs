mod codex;

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, State};

const SIDECAR_EVENT: &str = "perlerdrawing://sidecar-event";

#[cfg(target_os = "linux")]
fn linux_webkit_dmabuf_default(current_value: Option<&std::ffi::OsStr>) -> Option<&'static str> {
    current_value.is_none().then_some("1")
}

#[cfg(target_os = "linux")]
fn configure_linux_webkit_environment() {
    let current_value = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER");
    if let Some(value) = linux_webkit_dmabuf_default(current_value.as_deref()) {
        // WebKitGTK's DMA-BUF renderer can terminate the web process on some
        // Wayland/NVIDIA configurations. Keep native Wayland and use its
        // shared-memory renderer unless the user explicitly chose otherwise.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", value);
    }
}

#[derive(Default)]
struct SidecarState {
    jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

#[derive(Debug, Clone, Serialize)]
struct SidecarFailure {
    code: String,
    message: String,
}

impl SidecarFailure {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Clone, Serialize)]
struct SidecarEvent {
    job_id: String,
    event: Value,
}

pub(crate) fn validate_job_id(job_id: &str) -> Result<(), SidecarFailure> {
    if job_id.is_empty()
        || job_id.len() > 80
        || !job_id
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, b'-' | b'_'))
    {
        return Err(SidecarFailure::new(
            "invalid_job_id",
            "The job identifier contains unsupported characters.",
        ));
    }
    Ok(())
}

fn jobs_root(app: &AppHandle) -> Result<PathBuf, SidecarFailure> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("jobs"))
        .map_err(|error| SidecarFailure::new("cache_unavailable", error.to_string()))
}

pub(crate) fn create_clean_job_dir(
    app: &AppHandle,
    job_id: &str,
) -> Result<PathBuf, SidecarFailure> {
    validate_job_id(job_id)?;
    let root = jobs_root(app)?;
    fs::create_dir_all(&root)
        .map_err(|error| SidecarFailure::new("cache_unavailable", error.to_string()))?;
    let directory = root.join(job_id);
    if directory.exists() {
        fs::remove_dir_all(&directory)
            .map_err(|error| SidecarFailure::new("cache_cleanup_failed", error.to_string()))?;
    }
    fs::create_dir(&directory)
        .map_err(|error| SidecarFailure::new("cache_unavailable", error.to_string()))?;
    Ok(directory)
}

fn sidecar_script(app: &AppHandle) -> Result<PathBuf, SidecarFailure> {
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../python/sidecar.py");
    if cfg!(debug_assertions) && development.is_file() {
        return Ok(development);
    }
    let resource = app
        .path()
        .resource_dir()
        .map_err(|error| SidecarFailure::new("sidecar_missing", error.to_string()))?
        .join("python/sidecar.py");
    if resource.is_file() {
        Ok(resource)
    } else {
        Err(SidecarFailure::new(
            "sidecar_missing",
            "The bundled image sidecar could not be found.",
        ))
    }
}

fn sidecar_executable(app: &AppHandle) -> Result<PathBuf, SidecarFailure> {
    let file_name = if cfg!(target_os = "windows") {
        "perlerdrawing-sidecar.exe"
    } else {
        "perlerdrawing-sidecar"
    };
    let current_executable = std::env::current_exe()
        .map_err(|error| SidecarFailure::new("sidecar_missing", error.to_string()))?;
    let installed = current_executable
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(file_name);
    if installed.is_file() {
        return Ok(installed);
    }
    let resource = app
        .path()
        .resource_dir()
        .map_err(|error| SidecarFailure::new("sidecar_missing", error.to_string()))?
        .join(file_name);
    if resource.is_file() {
        return Ok(resource);
    }
    Err(SidecarFailure::new(
        "sidecar_missing",
        "The bundled image sidecar executable could not be found.",
    ))
}

fn sidecar_command(app: &AppHandle, request_path: &Path) -> Result<Command, SidecarFailure> {
    if cfg!(debug_assertions) {
        let script = sidecar_script(app)?;
        let python_dir = script.parent().ok_or_else(|| {
            SidecarFailure::new("sidecar_missing", "The sidecar path has no parent.")
        })?;
        let mut command = Command::new("python3");
        command
            .arg(&script)
            .arg("--request-file")
            .arg(request_path)
            .current_dir(python_dir);
        return Ok(command);
    }
    let executable = sidecar_executable(app)?;
    let mut command = Command::new(&executable);
    command
        .arg("--request-file")
        .arg(request_path)
        .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")));
    Ok(command)
}

fn run_sidecar(
    app: AppHandle,
    jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    job_id: String,
    request: Value,
) -> Result<Value, SidecarFailure> {
    let request_path = jobs_root(&app)?.join(&job_id).join("request.jsonl");
    let request_line = serde_json::to_vec(&request)
        .map_err(|error| SidecarFailure::new("invalid_request", error.to_string()))?;
    fs::write(&request_path, [&request_line[..], b"\n"].concat())
        .map_err(|error| SidecarFailure::new("sidecar_write_failed", error.to_string()))?;
    let mut command = sidecar_command(&app, &request_path)?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|error| SidecarFailure::new("sidecar_start_failed", error.to_string()))?;
    let stdout = child.stdout.take().ok_or_else(|| {
        SidecarFailure::new(
            "sidecar_start_failed",
            "The sidecar stdout pipe is unavailable.",
        )
    })?;
    let child = Arc::new(Mutex::new(child));
    jobs.lock()
        .map_err(|_| SidecarFailure::new("job_state_failed", "The job registry is poisoned."))?
        .insert(job_id.clone(), Arc::clone(&child));

    let mut result: Option<Value> = None;
    let mut failure: Option<SidecarFailure> = None;
    for line in BufReader::new(stdout).lines() {
        let line = match line {
            Ok(value) => value,
            Err(error) => {
                failure = Some(SidecarFailure::new(
                    "sidecar_read_failed",
                    error.to_string(),
                ));
                break;
            }
        };
        let event: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(error) => {
                failure = Some(SidecarFailure::new(
                    "invalid_sidecar_output",
                    error.to_string(),
                ));
                break;
            }
        };
        let event_type = event.get("type").and_then(Value::as_str);
        if event_type == Some("progress") {
            let _ = app.emit(
                SIDECAR_EVENT,
                SidecarEvent {
                    job_id: job_id.clone(),
                    event: event.clone(),
                },
            );
        } else if event_type == Some("result") {
            result = event.get("result").cloned();
        } else if event_type == Some("error") {
            failure = Some(SidecarFailure::new(
                event
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("processing_failed"),
                event
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("The image processor failed."),
            ));
        }
    }
    let status = child
        .lock()
        .map_err(|_| {
            SidecarFailure::new("job_state_failed", "The child process lock is poisoned.")
        })?
        .wait()
        .map_err(|error| SidecarFailure::new("sidecar_wait_failed", error.to_string()))?;
    if let Ok(mut registry) = jobs.lock() {
        registry.remove(&job_id);
    }
    if let Some(error) = failure {
        return Err(error);
    }
    if !status.success() {
        return Err(SidecarFailure::new(
            "sidecar_failed",
            format!("The image processor exited with status {status}."),
        ));
    }
    result.ok_or_else(|| {
        SidecarFailure::new("result_missing", "The image processor returned no result.")
    })
}

#[tauri::command]
async fn run_image_job(
    app: AppHandle,
    state: State<'_, SidecarState>,
    job_id: String,
    input_path: String,
    settings: Value,
    palette: Value,
) -> Result<Value, SidecarFailure> {
    validate_job_id(&job_id)?;
    let input = PathBuf::from(&input_path);
    if !input.is_file() {
        return Err(SidecarFailure::new(
            "input_unavailable",
            "The selected image is no longer available.",
        ));
    }
    let output_dir = create_clean_job_dir(&app, &job_id)?;
    let request = json!({
        "protocol_version": 1,
        "job_id": job_id,
        "operation": "convert_image",
        "payload": {
            "input_path": input,
            "output_dir": output_dir,
            "settings": settings,
            "palette": palette,
        },
    });
    let jobs = Arc::clone(&state.jobs);
    let app_handle = app.clone();
    let task_job_id = job_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_sidecar(app_handle, jobs, task_job_id, request)
    })
    .await
    .map_err(|error| SidecarFailure::new("task_join_failed", error.to_string()))?
}

#[tauri::command]
async fn run_export_job(
    app: AppHandle,
    state: State<'_, SidecarState>,
    job_id: String,
    archive_path: String,
    snapshot: Value,
) -> Result<Value, SidecarFailure> {
    validate_job_id(&job_id)?;
    if !archive_path.to_ascii_lowercase().ends_with(".tar.gz") {
        return Err(SidecarFailure::new(
            "invalid_archive_path",
            "Complete exports must use the .tar.gz extension.",
        ));
    }
    let master_path = if let Some(source_job_id) = snapshot
        .pointer("/processing/imageJobId")
        .and_then(Value::as_str)
    {
        validate_job_id(source_job_id)?;
        let path = jobs_root(&app)?.join(source_job_id).join("master.png");
        if !path.is_file() {
            return Err(SidecarFailure::new(
                "master_unavailable",
                "The high-resolution master is no longer available for export.",
            ));
        }
        Some(path)
    } else {
        None
    };
    let output_dir = create_clean_job_dir(&app, &job_id)?;
    let snapshot_path = output_dir.join("snapshot.json");
    fs::write(
        &snapshot_path,
        serde_json::to_vec(&snapshot)
            .map_err(|error| SidecarFailure::new("invalid_snapshot", error.to_string()))?,
    )
    .map_err(|error| SidecarFailure::new("snapshot_write_failed", error.to_string()))?;
    let working_dir = output_dir.join("delivery");
    fs::create_dir(&working_dir)
        .map_err(|error| SidecarFailure::new("cache_unavailable", error.to_string()))?;
    let request = json!({
        "protocol_version": 1,
        "job_id": job_id,
        "operation": "export_package",
        "payload": {
            "snapshot_path": snapshot_path,
            "archive_path": PathBuf::from(archive_path),
            "working_dir": working_dir,
            "master_path": master_path,
        },
    });
    let jobs = Arc::clone(&state.jobs);
    let app_handle = app.clone();
    let task_job_id = job_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_sidecar(app_handle, jobs, task_job_id, request)
    })
    .await
    .map_err(|error| SidecarFailure::new("task_join_failed", error.to_string()))?
}

#[tauri::command]
async fn run_pdf_export_job(
    app: AppHandle,
    state: State<'_, SidecarState>,
    job_id: String,
    pdf_path: String,
    snapshot: Value,
) -> Result<Value, SidecarFailure> {
    validate_job_id(&job_id)?;
    if !pdf_path.to_ascii_lowercase().ends_with(".pdf") {
        return Err(SidecarFailure::new(
            "invalid_pdf_path",
            "Board print exports must use the .pdf extension.",
        ));
    }
    let output_dir = create_clean_job_dir(&app, &job_id)?;
    let snapshot_path = output_dir.join("snapshot.json");
    fs::write(
        &snapshot_path,
        serde_json::to_vec(&snapshot)
            .map_err(|error| SidecarFailure::new("invalid_snapshot", error.to_string()))?,
    )
    .map_err(|error| SidecarFailure::new("snapshot_write_failed", error.to_string()))?;
    let request = json!({
        "protocol_version": 1,
        "job_id": job_id,
        "operation": "export_board_pdf",
        "payload": {
            "snapshot_path": snapshot_path,
            "pdf_path": PathBuf::from(pdf_path),
        },
    });
    let jobs = Arc::clone(&state.jobs);
    let app_handle = app.clone();
    let task_job_id = job_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_sidecar(app_handle, jobs, task_job_id, request)
    })
    .await
    .map_err(|error| SidecarFailure::new("task_join_failed", error.to_string()))?
}

#[tauri::command]
fn cancel_sidecar_job(
    state: State<'_, SidecarState>,
    job_id: String,
) -> Result<bool, SidecarFailure> {
    validate_job_id(&job_id)?;
    let child = state
        .jobs
        .lock()
        .map_err(|_| SidecarFailure::new("job_state_failed", "The job registry is poisoned."))?
        .get(&job_id)
        .cloned();
    let Some(child) = child else {
        return Ok(false);
    };
    child
        .lock()
        .map_err(|_| {
            SidecarFailure::new("job_state_failed", "The child process lock is poisoned.")
        })?
        .kill()
        .map_err(|error| SidecarFailure::new("cancel_failed", error.to_string()))?;
    Ok(true)
}

#[tauri::command]
fn read_job_asset(
    app: AppHandle,
    job_id: String,
    file_name: String,
) -> Result<Vec<u8>, SidecarFailure> {
    validate_job_id(&job_id)?;
    if !matches!(file_name.as_str(), "master.png" | "pattern.png") {
        return Err(SidecarFailure::new(
            "asset_not_allowed",
            "Only generated preview assets can be read.",
        ));
    }
    let path = jobs_root(&app)?.join(job_id).join(file_name);
    fs::read(path).map_err(|error| SidecarFailure::new("asset_unavailable", error.to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_environment();

    tauri::Builder::default()
        .manage(SidecarState::default())
        .manage(codex::CodexState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            run_image_job,
            run_export_job,
            run_pdf_export_job,
            cancel_sidecar_job,
            read_job_asset,
            codex::detect_codex_cli,
            codex::run_codex_image_plan,
            codex::cancel_codex_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running PerlerDrawing Desktop");
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::linux_webkit_dmabuf_default;
    use std::ffi::OsStr;

    #[test]
    fn disables_webkit_dmabuf_by_default() {
        assert_eq!(linux_webkit_dmabuf_default(None), Some("1"));
    }

    #[test]
    fn preserves_an_explicit_webkit_dmabuf_setting() {
        assert_eq!(linux_webkit_dmabuf_default(Some(OsStr::new("0"))), None);
        assert_eq!(linux_webkit_dmabuf_default(Some(OsStr::new("1"))), None);
    }
}
