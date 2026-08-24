use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};

use crate::{create_clean_job_dir, validate_job_id};

const CODEX_EVENT: &str = "perlerdrawing://codex-event";
const MAX_EVENT_BYTES: usize = 1_048_576;
const MAX_EVENT_COUNT: usize = 10_000;
const MAX_PLAN_BYTES: u64 = 16_384;
const MAX_INPUT_BYTES: u64 = 64 * 1024 * 1024;
const MIN_TIMEOUT_SECONDS: u64 = 30;
const MAX_TIMEOUT_SECONDS: u64 = 900;
const REQUIRED_FLAGS: [&str; 8] = [
    "--image",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--sandbox",
    "--cd",
    "--output-last-message",
];

#[derive(Default)]
pub struct CodexState {
    jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CodexFailure {
    code: String,
    message: String,
}

impl CodexFailure {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCliStatus {
    available: bool,
    compatible: bool,
    version: Option<String>,
    missing_flags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
struct CodexProgressEvent {
    job_id: String,
    stage: String,
    progress: f64,
    event_count: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CodexImagePlan {
    background_mode: String,
    background_tolerance: f64,
    wavelet_strength: f64,
    alpha_threshold: f64,
    color_count: u64,
    symmetry: String,
    rationale: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPlanEnvelope {
    plan: CodexImagePlan,
    cli_version: String,
    final_message: String,
}

fn command_text(output: std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    } else {
        stdout
    }
}

fn resolve_codex_executable() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let names: &[&str] = if cfg!(target_os = "windows") {
        &["codex.exe"]
    } else {
        &["codex"]
    };
    std::env::split_paths(&path)
        .flat_map(|directory| names.iter().map(move |name| directory.join(name)))
        .find(|candidate| candidate.is_file())
        .and_then(|candidate| candidate.canonicalize().ok())
}

fn detect_cli_at(executable: Option<&Path>) -> CodexCliStatus {
    let Some(executable) = executable else {
        return CodexCliStatus {
            available: false,
            compatible: false,
            version: None,
            missing_flags: REQUIRED_FLAGS
                .iter()
                .map(|flag| (*flag).to_string())
                .collect(),
        };
    };
    let version_output = match Command::new(executable)
        .arg("--version")
        .stdin(Stdio::null())
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => {
            return CodexCliStatus {
                available: false,
                compatible: false,
                version: None,
                missing_flags: REQUIRED_FLAGS
                    .iter()
                    .map(|flag| (*flag).to_string())
                    .collect(),
            };
        }
    };
    let version = command_text(version_output);
    let help_output = match Command::new(executable)
        .args(["exec", "--help"])
        .stdin(Stdio::null())
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => {
            return CodexCliStatus {
                available: true,
                compatible: false,
                version: Some(version),
                missing_flags: REQUIRED_FLAGS
                    .iter()
                    .map(|flag| (*flag).to_string())
                    .collect(),
            };
        }
    };
    let help = format!(
        "{}\n{}",
        String::from_utf8_lossy(&help_output.stdout),
        String::from_utf8_lossy(&help_output.stderr)
    );
    let missing_flags = REQUIRED_FLAGS
        .iter()
        .filter(|flag| !help.contains(**flag))
        .map(|flag| (*flag).to_string())
        .collect::<Vec<_>>();
    CodexCliStatus {
        available: true,
        compatible: missing_flags.is_empty(),
        version: Some(version),
        missing_flags,
    }
}

fn detect_cli() -> CodexCliStatus {
    let executable = resolve_codex_executable();
    detect_cli_at(executable.as_deref())
}

#[tauri::command]
pub fn detect_codex_cli() -> CodexCliStatus {
    detect_cli()
}

fn write_json(path: &Path, value: &Value, maximum: usize) -> Result<(), CodexFailure> {
    let encoded = serde_json::to_vec_pretty(value)
        .map_err(|error| CodexFailure::new("codex_context_invalid", error.to_string()))?;
    if encoded.len() > maximum {
        return Err(CodexFailure::new(
            "codex_context_too_large",
            "The isolated Codex context exceeds its size limit.",
        ));
    }
    fs::write(path, encoded)
        .map_err(|error| CodexFailure::new("codex_context_write_failed", error.to_string()))
}

fn initialize_repository(repository: &Path) -> Result<(), CodexFailure> {
    let status = Command::new("git")
        .args(["init", "--quiet"])
        .current_dir(repository)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| CodexFailure::new("git_unavailable", error.to_string()))?;
    if status.success() {
        Ok(())
    } else {
        Err(CodexFailure::new(
            "git_initialization_failed",
            "The isolated Codex Git repository could not be initialized.",
        ))
    }
}

fn source_extension(input: &Path) -> Result<&str, CodexFailure> {
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| CodexFailure::new("invalid_image", "The source image has no extension."))?;
    match extension.as_str() {
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        "webp" => Ok("webp"),
        _ => Err(CodexFailure::new(
            "invalid_image",
            "Codex planning accepts PNG, JPEG, and WebP images only.",
        )),
    }
}

fn plan_schema() -> Value {
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": false,
        "required": [
            "background_mode",
            "background_tolerance",
            "wavelet_strength",
            "alpha_threshold",
            "color_count",
            "symmetry",
            "rationale"
        ],
        "properties": {
            "background_mode": { "enum": ["auto", "preserve", "none"] },
            "background_tolerance": { "type": "number", "minimum": 4, "maximum": 60 },
            "wavelet_strength": { "type": "number", "minimum": 0, "maximum": 1 },
            "alpha_threshold": { "type": "number", "minimum": 0.05, "maximum": 0.95 },
            "color_count": { "type": "integer", "minimum": 2, "maximum": 64 },
            "symmetry": { "enum": ["none", "vertical", "horizontal", "central"] },
            "rationale": { "type": "string", "minLength": 1, "maxLength": 500 }
        }
    })
}

fn task_prompt() -> &'static str {
    "Analyze the attached source image for conversion into a fuse-bead pattern. Read AGENTS.md, context/request.json, context/palette.json, and context/plan-schema.json. Do not alter input/ or context/. Do not use network tools or install software. Select only bounded preprocessing parameters that preserve the subject's silhouette, negative spaces, thin structural features, and important semantic colors. Write exactly one JSON object matching context/plan-schema.json to output/plan.json. Do not create any other task output; the CLI itself may write output/last-message.txt. The application will distrust and validate this plan, then run its own local background removal, wavelet simplification, clustering, premultiplied-alpha rasterization, and MARD quantization."
}

fn validate_plan(plan: CodexImagePlan) -> Result<CodexImagePlan, CodexFailure> {
    if !matches!(plan.background_mode.as_str(), "auto" | "preserve" | "none")
        || !(4.0..=60.0).contains(&plan.background_tolerance)
        || !(0.0..=1.0).contains(&plan.wavelet_strength)
        || !(0.05..=0.95).contains(&plan.alpha_threshold)
        || !(2..=64).contains(&plan.color_count)
        || !matches!(
            plan.symmetry.as_str(),
            "none" | "vertical" | "horizontal" | "central"
        )
    {
        return Err(CodexFailure::new(
            "codex_plan_invalid",
            "Codex returned preprocessing parameters outside the allowed bounds.",
        ));
    }
    let rationale = plan.rationale.trim();
    if rationale.is_empty() || rationale.chars().count() > 500 {
        return Err(CodexFailure::new(
            "codex_plan_invalid",
            "Codex returned an invalid plan rationale.",
        ));
    }
    Ok(CodexImagePlan {
        rationale: rationale.to_string(),
        ..plan
    })
}

fn read_plan(repository: &Path) -> Result<CodexImagePlan, CodexFailure> {
    let output_root = repository.join("output");
    let path = output_root.join("plan.json");
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| CodexFailure::new("codex_plan_missing", error.to_string()))?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err(CodexFailure::new(
            "codex_plan_invalid",
            "Codex plan output must be a regular file.",
        ));
    }
    if metadata.len() > MAX_PLAN_BYTES {
        return Err(CodexFailure::new(
            "codex_plan_invalid",
            "Codex plan output exceeds the 16 KB limit.",
        ));
    }
    let canonical_output = output_root
        .canonicalize()
        .map_err(|error| CodexFailure::new("codex_plan_invalid", error.to_string()))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| CodexFailure::new("codex_plan_invalid", error.to_string()))?;
    if !canonical_path.starts_with(&canonical_output) {
        return Err(CodexFailure::new(
            "codex_plan_invalid",
            "Codex plan output escaped the isolated output directory.",
        ));
    }
    let bytes = fs::read(canonical_path)
        .map_err(|error| CodexFailure::new("codex_plan_invalid", error.to_string()))?;
    let plan = serde_json::from_slice::<CodexImagePlan>(&bytes)
        .map_err(|error| CodexFailure::new("codex_plan_invalid", error.to_string()))?;
    validate_plan(plan)
}

fn event_stage(line: &str) -> Result<String, CodexFailure> {
    if line.len() > MAX_EVENT_BYTES {
        return Err(CodexFailure::new(
            "invalid_codex_output",
            "A Codex JSONL event exceeded the 1 MB limit.",
        ));
    }
    let value = serde_json::from_str::<Value>(line)
        .map_err(|error| CodexFailure::new("invalid_codex_output", error.to_string()))?;
    let event_type = value.get("type").and_then(Value::as_str).ok_or_else(|| {
        CodexFailure::new("invalid_codex_output", "A Codex event has no string type.")
    })?;
    if event_type.len() > 80
        || !event_type
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, b'.' | b'_' | b'-'))
    {
        return Err(CodexFailure::new(
            "invalid_codex_output",
            "A Codex event type contains unsupported characters.",
        ));
    }
    Ok(event_type.to_string())
}

fn read_stderr(mut stderr: impl Read, destination: Arc<Mutex<String>>) {
    let mut bytes = Vec::new();
    let _ = stderr.by_ref().take(8_192).read_to_end(&mut bytes);
    if let Ok(mut text) = destination.lock() {
        *text = String::from_utf8_lossy(&bytes).trim().to_string();
    }
}

#[allow(clippy::too_many_arguments)]
fn run_codex(
    app: AppHandle,
    jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    job_id: String,
    repository: PathBuf,
    image: PathBuf,
    timeout: Duration,
    cli_version: String,
    codex_executable: PathBuf,
) -> Result<CodexPlanEnvelope, CodexFailure> {
    let final_message_path = repository.join("output/last-message.txt");
    let mut command = Command::new(codex_executable);
    command
        .arg("exec")
        .arg("--image")
        .arg(&image)
        .arg("--json")
        .arg("--ephemeral")
        .arg("--ignore-user-config")
        .arg("--ignore-rules")
        .arg("--sandbox")
        .arg("workspace-write")
        .arg("--color")
        .arg("never")
        .arg("--cd")
        .arg(&repository)
        .arg("--output-last-message")
        .arg(&final_message_path)
        .arg(task_prompt())
        .current_dir(&repository)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| CodexFailure::new("codex_start_failed", error.to_string()))?;
    let stdout = child.stdout.take().ok_or_else(|| {
        CodexFailure::new(
            "codex_start_failed",
            "The Codex stdout pipe is unavailable.",
        )
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        CodexFailure::new(
            "codex_start_failed",
            "The Codex stderr pipe is unavailable.",
        )
    })?;
    let child = Arc::new(Mutex::new(child));
    jobs.lock()
        .map_err(|_| CodexFailure::new("job_state_failed", "The Codex registry is poisoned."))?
        .insert(job_id.clone(), Arc::clone(&child));

    let (sender, receiver) = mpsc::channel::<Result<String, String>>();
    let reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let message = line.map_err(|error| error.to_string());
            if sender.send(message).is_err() {
                break;
            }
        }
    });
    let stderr_text = Arc::new(Mutex::new(String::new()));
    let stderr_destination = Arc::clone(&stderr_text);
    let stderr_reader = thread::spawn(move || read_stderr(stderr, stderr_destination));

    let started = Instant::now();
    let mut event_count = 0usize;
    let mut failure: Option<CodexFailure> = None;
    let mut process_status = None;
    let mut output_closed = false;
    let status = loop {
        if started.elapsed() > timeout {
            if let Ok(mut process) = child.lock() {
                let _ = process.kill();
            }
            failure = Some(CodexFailure::new(
                "codex_timeout",
                format!(
                    "Codex exceeded the {} second time limit.",
                    timeout.as_secs()
                ),
            ));
        }

        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(Ok(line)) if failure.is_none() => {
                event_count += 1;
                if event_count > MAX_EVENT_COUNT {
                    failure = Some(CodexFailure::new(
                        "invalid_codex_output",
                        "Codex emitted more than 10000 JSONL events.",
                    ));
                    if let Ok(mut process) = child.lock() {
                        let _ = process.kill();
                    }
                } else {
                    match event_stage(&line) {
                        Ok(stage) => {
                            let progress = if stage == "turn.completed" {
                                0.98
                            } else {
                                (0.08 + event_count as f64 * 0.025).min(0.92)
                            };
                            let _ = app.emit(
                                CODEX_EVENT,
                                CodexProgressEvent {
                                    job_id: job_id.clone(),
                                    stage,
                                    progress,
                                    event_count,
                                },
                            );
                        }
                        Err(error) => {
                            failure = Some(error);
                            if let Ok(mut process) = child.lock() {
                                let _ = process.kill();
                            }
                        }
                    }
                }
            }
            Ok(Err(error)) if failure.is_none() => {
                failure = Some(CodexFailure::new("codex_read_failed", error));
                if let Ok(mut process) = child.lock() {
                    let _ = process.kill();
                }
            }
            Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => output_closed = true,
        }

        if process_status.is_none() {
            process_status = child
                .lock()
                .map_err(|_| {
                    CodexFailure::new("job_state_failed", "The Codex child lock is poisoned.")
                })?
                .try_wait()
                .map_err(|error| CodexFailure::new("codex_wait_failed", error.to_string()))?;
        }
        if output_closed && process_status.is_some() {
            let status = process_status.expect("checked as present");
            break status;
        }
    };

    let _ = reader.join();
    let _ = stderr_reader.join();
    if let Ok(mut registry) = jobs.lock() {
        registry.remove(&job_id);
    }
    if let Some(error) = failure {
        return Err(error);
    }
    if !status.success() {
        let detail = stderr_text
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default();
        return Err(CodexFailure::new(
            "codex_failed",
            if detail.is_empty() {
                format!("Codex exited with status {status}.")
            } else {
                format!("Codex exited with status {status}: {detail}")
            },
        ));
    }
    let plan = read_plan(&repository)?;
    let final_message = fs::read_to_string(final_message_path)
        .unwrap_or_default()
        .chars()
        .take(1_000)
        .collect::<String>();
    Ok(CodexPlanEnvelope {
        plan,
        cli_version,
        final_message,
    })
}

#[tauri::command]
pub async fn run_codex_image_plan(
    app: AppHandle,
    state: State<'_, CodexState>,
    job_id: String,
    input_path: String,
    settings: Value,
    palette: Value,
    timeout_seconds: u64,
) -> Result<CodexPlanEnvelope, CodexFailure> {
    validate_job_id(&job_id).map_err(|error| CodexFailure::new(&error.code, error.message))?;
    let timeout_seconds = timeout_seconds.clamp(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
    let codex_executable = resolve_codex_executable();
    let cli = detect_cli_at(codex_executable.as_deref());
    if !cli.available {
        return Err(CodexFailure::new(
            "codex_unavailable",
            "Codex CLI is not installed or not available on PATH.",
        ));
    }
    if !cli.compatible {
        return Err(CodexFailure::new(
            "codex_incompatible",
            format!(
                "This Codex CLI is missing required flags: {}.",
                cli.missing_flags.join(", ")
            ),
        ));
    }
    let cli_version = cli.version.unwrap_or_else(|| "codex".to_string());
    let codex_executable = codex_executable.ok_or_else(|| {
        CodexFailure::new(
            "codex_unavailable",
            "Codex CLI is not installed or not available on PATH.",
        )
    })?;
    let input = PathBuf::from(&input_path);
    if !input.is_file() {
        return Err(CodexFailure::new(
            "input_unavailable",
            "The selected image is no longer available.",
        ));
    }
    let input_size = input
        .metadata()
        .map_err(|error| CodexFailure::new("input_unavailable", error.to_string()))?
        .len();
    if input_size > MAX_INPUT_BYTES {
        return Err(CodexFailure::new(
            "image_too_large",
            "The Codex task image exceeds the 64 MB limit.",
        ));
    }
    let extension = source_extension(&input)?;
    let job_directory = create_clean_job_dir(&app, &job_id)
        .map_err(|error| CodexFailure::new(&error.code, error.message))?;
    let repository = job_directory.join("repository");
    let input_directory = repository.join("input");
    let context_directory = repository.join("context");
    let output_directory = repository.join("output");
    for directory in [
        &repository,
        &input_directory,
        &context_directory,
        &output_directory,
    ] {
        fs::create_dir(directory)
            .map_err(|error| CodexFailure::new("codex_context_write_failed", error.to_string()))?;
    }
    let image = input_directory.join(format!("source.{extension}"));
    fs::copy(&input, &image)
        .map_err(|error| CodexFailure::new("codex_context_write_failed", error.to_string()))?;
    fs::write(
        repository.join("AGENTS.md"),
        include_str!("../../../AGENTS.md"),
    )
    .map_err(|error| CodexFailure::new("codex_context_write_failed", error.to_string()))?;
    write_json(&context_directory.join("request.json"), &settings, 65_536)?;
    write_json(&context_directory.join("palette.json"), &palette, 524_288)?;
    write_json(
        &context_directory.join("plan-schema.json"),
        &plan_schema(),
        65_536,
    )?;
    initialize_repository(&repository)?;

    let jobs = Arc::clone(&state.jobs);
    let app_handle = app.clone();
    let task_job_id = job_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_codex(
            app_handle,
            jobs,
            task_job_id,
            repository,
            image,
            Duration::from_secs(timeout_seconds),
            cli_version,
            codex_executable,
        )
    })
    .await
    .map_err(|error| CodexFailure::new("task_join_failed", error.to_string()))?
}

#[tauri::command]
pub fn cancel_codex_job(
    state: State<'_, CodexState>,
    job_id: String,
) -> Result<bool, CodexFailure> {
    validate_job_id(&job_id).map_err(|error| CodexFailure::new(&error.code, error.message))?;
    let child = state
        .jobs
        .lock()
        .map_err(|_| CodexFailure::new("job_state_failed", "The Codex registry is poisoned."))?
        .get(&job_id)
        .cloned();
    let Some(child) = child else {
        return Ok(false);
    };
    child
        .lock()
        .map_err(|_| CodexFailure::new("job_state_failed", "The Codex child lock is poisoned."))?
        .kill()
        .map_err(|error| CodexFailure::new("cancel_failed", error.to_string()))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::{event_stage, validate_plan, CodexImagePlan};

    fn valid_plan() -> CodexImagePlan {
        CodexImagePlan {
            background_mode: "auto".to_string(),
            background_tolerance: 18.0,
            wavelet_strength: 0.55,
            alpha_threshold: 0.28,
            color_count: 24,
            symmetry: "none".to_string(),
            rationale: "Keep the silhouette and simplify low-energy texture.".to_string(),
        }
    }

    #[test]
    fn validates_a_bounded_codex_plan() {
        assert!(validate_plan(valid_plan()).is_ok());
    }

    #[test]
    fn rejects_out_of_range_codex_parameters() {
        let mut plan = valid_plan();
        plan.color_count = 100;
        assert_eq!(
            validate_plan(plan)
                .expect_err("out-of-range color count must fail")
                .code,
            "codex_plan_invalid"
        );
    }

    #[test]
    fn accepts_only_typed_jsonl_events() {
        assert_eq!(
            event_stage(r#"{"type":"item.completed","item":{"type":"message"}}"#)
                .expect("valid event"),
            "item.completed"
        );
        assert!(event_stage("plain text").is_err());
        assert!(event_stage(r#"{"message":"missing type"}"#).is_err());
    }
}
