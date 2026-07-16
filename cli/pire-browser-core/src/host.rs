use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::io::{stdin, stdout, Stdout};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use crossbeam_channel::{bounded, Sender};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::ipc::{pipe_name_for_session, run_pipe_server};
use crate::native::{read_native_message, write_native_message};
use crate::protocol::{
    NativeInbound, NativeOutbound, RpcError, RpcRequest, RpcResponse, EXTENSION_ID,
};
use crate::restore_state::{
    read_automatic_restore_state, write_automatic_restore_state, AutomaticRestoreState,
};
use crate::session::{
    now_ms, remove_session, write_session_atomic, ActivePageInfo, SessionInfo, SessionProfileKind,
};
use crate::transfer::{ResultTransferMeta, ScreenshotTransferMeta, TransferStore};

const OUTBOUND_UPLOAD_CHUNK_BASE64_BYTES: usize = 512 * 1024;
const OUTBOUND_UPLOAD_TTL: Duration = Duration::from_secs(60);

#[derive(Clone)]
struct SharedSession {
    inner: Arc<Mutex<SessionInfo>>,
}

impl SharedSession {
    fn new(session: SessionInfo) -> Self {
        Self {
            inner: Arc::new(Mutex::new(session)),
        }
    }

    fn update(&self, update: impl FnOnce(&mut SessionInfo)) -> Result<()> {
        let mut session = self.inner.lock().unwrap();
        update(&mut session);
        write_session_atomic(&session)?;
        Ok(())
    }

    fn snapshot(&self) -> SessionInfo {
        self.inner.lock().unwrap().clone()
    }
}

struct NativeBridge {
    stdout: Mutex<Stdout>,
    pending: Mutex<HashMap<String, Sender<RpcResponse>>>,
    session: SharedSession,
    transfers: Mutex<TransferStore>,
    outbound_uploads: Mutex<OutboundUploadStore>,
    command_gate: Mutex<()>,
    restore_lifecycle: Mutex<Option<RestoreLifecycleConfig>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum RestoreSavePolicy {
    Auto,
    Always,
    Never,
}

#[derive(Debug, Clone)]
struct RestoreLifecycleConfig {
    path: PathBuf,
    save_policy: RestoreSavePolicy,
    interval_ms: u64,
    next_save_at: u64,
    auto_save_allowed: bool,
    check_url: Option<String>,
    check_text: Option<String>,
    check_fn: Option<String>,
}

impl NativeBridge {
    fn send_request(&self, request: RpcRequest) -> RpcResponse {
        let _guard = self.command_gate.lock().unwrap();
        self.send_request_unlocked(request)
    }

    fn send_request_unlocked(&self, request: RpcRequest) -> RpcResponse {
        let (tx, rx) = bounded::<RpcResponse>(1);
        let screenshot_base_dir = request
            .params
            .get("invocationCwd")
            .and_then(|value| value.as_str())
            .map(PathBuf::from);
        self.pending.lock().unwrap().insert(request.id.clone(), tx);
        let mut params = request.params.clone();
        let staged_upload_id = match stage_outbound_upload_params(
            &mut params,
            &mut self.outbound_uploads.lock().unwrap(),
        ) {
            Ok(staged_upload_id) => staged_upload_id,
            Err(err) => {
                self.pending.lock().unwrap().remove(&request.id);
                return RpcResponse::err(
                    request.id,
                    "upload_staging_failed",
                    format!("failed to stage upload payload: {err}"),
                );
            }
        };

        log_host(&native_outbound_request_log(&request.id));
        let write_result = {
            let mut stdout = self.stdout.lock().unwrap();
            write_native_message(
                &mut *stdout,
                &NativeOutbound::Request {
                    id: request.id.clone(),
                    method: request.method.clone(),
                    params,
                },
            )
        };

        if let Err(err) = write_result {
            log_host(&format!("native outbound write failed: {err}"));
            self.pending.lock().unwrap().remove(&request.id);
            if let Some(transfer_id) = staged_upload_id {
                self.outbound_uploads.lock().unwrap().remove(&transfer_id);
            }
            return RpcResponse::err(
                request.id,
                "extension_disconnected",
                format!("failed to write to Firefox extension: {err}"),
            );
        }

        let response = match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(mut response) => {
                log_host(&native_inbound_response_log(&response.id, response.ok));
                if let Some(result) = response.result.as_mut() {
                    if let Err(err) = self.maybe_reassemble_large_result(result) {
                        response.ok = false;
                        response.error = Some(RpcError {
                            code: "large_result_reassembly_failed".into(),
                            message: err.to_string(),
                            data: None,
                        });
                        response.result = None;
                    }
                }
                if let Some(result) = response.result.as_mut() {
                    if let Err(err) =
                        self.maybe_write_screenshots(result, screenshot_base_dir.as_deref())
                    {
                        response.ok = false;
                        response.error = Some(RpcError {
                            code: "screenshot_write_failed".into(),
                            message: err.to_string(),
                            data: None,
                        });
                        response.result = None;
                    }
                }
                response
            }
            Err(_) => {
                log_host(&native_response_timeout_log(&request.id));
                self.pending.lock().unwrap().remove(&request.id);
                RpcResponse::err(
                    request.id,
                    "timeout",
                    "timed out waiting for Firefox extension response",
                )
            }
        };
        if let Some(transfer_id) = staged_upload_id {
            self.outbound_uploads.lock().unwrap().remove(&transfer_id);
        }
        response
    }

    fn maybe_reassemble_large_result(&self, result: &mut Value) -> Result<()> {
        let Some(large_result) = result.get("largeResult").cloned() else {
            return Ok(());
        };
        let meta: ResultTransferMeta = serde_json::from_value(large_result)
            .context("invalid large result transfer metadata from extension")?;
        let bytes = self.transfers.lock().unwrap().complete(&meta)?;
        let value: Value =
            serde_json::from_slice(&bytes).context("large result was not valid JSON")?;
        *result = value;
        Ok(())
    }

    fn maybe_write_screenshots(&self, result: &mut Value, base_dir: Option<&Path>) -> Result<()> {
        let mut transfers = self.transfers.lock().unwrap();
        write_screenshots_in_value(result, &mut transfers, base_dir)
    }

    fn dispatch_inbound(&self, inbound: NativeInbound) {
        match inbound {
            NativeInbound::Hello {
                profile_id,
                extension_id,
                extension_version,
            } => {
                let _ = self.session.update(|session| {
                    session.profile_id = profile_id;
                    session.extension_id = extension_id;
                    session.extension_version = extension_version;
                    session.last_heartbeat_at = now_ms();
                    session.last_focused_at = now_ms();
                });
            }
            NativeInbound::Event { name, data } => {
                let _ = self.session.update(|session| {
                    apply_session_event(session, &name, &data, now_ms());
                });
            }
            NativeInbound::Response {
                id,
                ok,
                result,
                error,
            } => {
                log_host(&native_inbound_response_log(&id, ok));
                let response = RpcResponse {
                    id,
                    ok,
                    result,
                    error,
                };
                let tx = self.pending.lock().unwrap().remove(&response.id);
                if let Some(tx) = tx {
                    let _ = tx.send(response);
                }
            }
            NativeInbound::ScreenshotChunk {
                transfer_id,
                index,
                total,
                byte_length,
                sha256,
                data,
            } => {
                let _ = self.transfers.lock().unwrap().add_chunk(
                    transfer_id,
                    index,
                    total,
                    byte_length,
                    sha256,
                    data,
                );
            }
            NativeInbound::ResultChunk {
                transfer_id,
                index,
                total,
                byte_length,
                sha256,
                data,
            } => {
                let _ = self.transfers.lock().unwrap().add_chunk(
                    transfer_id,
                    index,
                    total,
                    byte_length,
                    sha256,
                    data,
                );
            }
            NativeInbound::UploadChunkRequest {
                request_id,
                transfer_id,
                file_index,
                chunk_index,
            } => {
                let response = self.outbound_uploads.lock().unwrap().chunk_response(
                    request_id,
                    transfer_id,
                    file_index,
                    chunk_index,
                );
                let mut stdout = self.stdout.lock().unwrap();
                if let Err(err) = write_native_message(&mut *stdout, &response) {
                    log_host(&format!("native upload chunk response failed: {err}"));
                }
            }
        }
    }
}

#[derive(Debug, Default)]
struct OutboundUploadStore {
    transfers: HashMap<String, OutboundUploadTransfer>,
}

#[derive(Debug)]
struct OutboundUploadTransfer {
    files: Vec<OutboundUploadFile>,
    started_at: Instant,
}

#[derive(Debug)]
struct OutboundUploadFile {
    bytes_base64: String,
    chunk_count: u32,
}

impl OutboundUploadStore {
    fn insert(&mut self, transfer_id: String, files: Vec<OutboundUploadFile>) {
        self.cleanup_expired();
        self.transfers.insert(
            transfer_id,
            OutboundUploadTransfer {
                files,
                started_at: Instant::now(),
            },
        );
    }

    fn remove(&mut self, transfer_id: &str) {
        self.transfers.remove(transfer_id);
    }

    fn chunk_response(
        &mut self,
        request_id: String,
        transfer_id: String,
        file_index: u32,
        chunk_index: u32,
    ) -> NativeOutbound {
        self.cleanup_expired();
        let Some(transfer) = self.transfers.get(&transfer_id) else {
            return upload_chunk_error(
                request_id,
                transfer_id,
                file_index,
                chunk_index,
                "upload_transfer_not_found",
                "upload transfer is no longer available",
            );
        };
        let Some(file) = transfer.files.get(file_index as usize) else {
            return upload_chunk_error(
                request_id,
                transfer_id,
                file_index,
                chunk_index,
                "upload_file_not_found",
                "upload file index is out of range",
            );
        };
        if chunk_index >= file.chunk_count {
            return upload_chunk_error(
                request_id,
                transfer_id,
                file_index,
                chunk_index,
                "upload_chunk_not_found",
                "upload chunk index is out of range",
            );
        }
        let start = chunk_index as usize * OUTBOUND_UPLOAD_CHUNK_BASE64_BYTES;
        let end = (start + OUTBOUND_UPLOAD_CHUNK_BASE64_BYTES).min(file.bytes_base64.len());
        NativeOutbound::UploadChunkResponse {
            request_id,
            ok: true,
            transfer_id,
            file_index,
            chunk_index,
            total: file.chunk_count,
            data: file.bytes_base64[start..end].to_string(),
            error: None,
        }
    }

    fn cleanup_expired(&mut self) {
        self.transfers
            .retain(|_, transfer| transfer.started_at.elapsed() <= OUTBOUND_UPLOAD_TTL);
    }
}

fn upload_chunk_error(
    request_id: String,
    transfer_id: String,
    file_index: u32,
    chunk_index: u32,
    code: &str,
    message: &str,
) -> NativeOutbound {
    NativeOutbound::UploadChunkResponse {
        request_id,
        ok: false,
        transfer_id,
        file_index,
        chunk_index,
        total: 0,
        data: String::new(),
        error: Some(RpcError {
            code: code.to_string(),
            message: message.to_string(),
            data: None,
        }),
    }
}

fn stage_outbound_upload_params(
    params: &mut Value,
    store: &mut OutboundUploadStore,
) -> Result<Option<String>> {
    let Some(object) = params.as_object_mut() else {
        return Ok(None);
    };
    let Some(upload_files) = object.remove("uploadFiles") else {
        return Ok(None);
    };
    let files = upload_files
        .as_array()
        .ok_or_else(|| anyhow!("uploadFiles must be an array"))?;
    let transfer_id = Uuid::new_v4().to_string();
    let mut staged_files = Vec::with_capacity(files.len());
    let mut metadata_files = Vec::with_capacity(files.len());

    for file in files {
        let file = file
            .as_object()
            .ok_or_else(|| anyhow!("upload file payload must be an object"))?;
        let name = json_string(file, "name")?;
        let mime_type =
            json_string(file, "mimeType").unwrap_or_else(|_| "application/octet-stream".into());
        let size = json_u64(file, "size")?;
        let sha256 = json_string(file, "sha256").unwrap_or_default();
        let bytes_base64 = json_string(file, "bytesBase64")?;
        let chunk_count = upload_chunk_count(bytes_base64.len())?;
        staged_files.push(OutboundUploadFile {
            bytes_base64,
            chunk_count,
        });
        metadata_files.push(json!({
            "name": name,
            "mimeType": mime_type,
            "size": size,
            "sha256": sha256,
            "chunks": chunk_count,
        }));
    }

    object.insert(
        "uploadFilesRef".into(),
        json!({
            "transferId": transfer_id,
            "chunkSize": OUTBOUND_UPLOAD_CHUNK_BASE64_BYTES,
            "files": metadata_files,
        }),
    );
    store.insert(transfer_id.clone(), staged_files);
    Ok(Some(transfer_id))
}

fn json_string(object: &serde_json::Map<String, Value>, key: &str) -> Result<String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| anyhow!("{key} must be a string"))
}

fn json_u64(object: &serde_json::Map<String, Value>, key: &str) -> Result<u64> {
    object
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| anyhow!("{key} must be an unsigned integer"))
}

fn upload_chunk_count(encoded_len: usize) -> Result<u32> {
    let chunks = if encoded_len == 0 {
        0
    } else {
        (encoded_len + OUTBOUND_UPLOAD_CHUNK_BASE64_BYTES - 1) / OUTBOUND_UPLOAD_CHUNK_BASE64_BYTES
    };
    u32::try_from(chunks).context("upload payload requires too many chunks")
}

fn write_screenshots_in_value(
    value: &mut Value,
    transfers: &mut TransferStore,
    base_dir: Option<&Path>,
) -> Result<()> {
    if value.get("screenshot").is_some() {
        write_screenshot_object(value, transfers, base_dir)?;
    }

    match value {
        Value::Array(items) => {
            for item in items {
                write_screenshots_in_value(item, transfers, base_dir)?;
            }
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                write_screenshots_in_value(item, transfers, base_dir)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn write_screenshot_object(
    result: &mut Value,
    transfers: &mut TransferStore,
    base_dir: Option<&Path>,
) -> Result<()> {
    let Some(screenshot) = result.get("screenshot").cloned() else {
        return Ok(());
    };
    let meta: ScreenshotTransferMeta = serde_json::from_value(screenshot)
        .context("invalid screenshot transfer metadata from extension")?;
    let bytes = transfers.complete(&meta)?;
    let requested_path = result
        .get("screenshotPath")
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .ok_or_else(|| anyhow!("extension response omitted screenshotPath"))?;
    let default_screenshot_dir = if result
        .get("screenshotDefaultPath")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        Some(crate::session::data_dir()?.join("screenshots"))
    } else {
        None
    };
    let path =
        resolve_screenshot_path(&requested_path, base_dir, default_screenshot_dir.as_deref())?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(&path, bytes)?;
    result["text"] = json!(screenshot_written_text(result, &path));
    result["screenshotPath"] = json!(path.to_string_lossy().to_string());
    Ok(())
}

fn screenshot_written_text(result: &Value, path: &Path) -> String {
    let mut text = format!("Screenshot written to {}", path.display());
    let Some(existing) = result.get("text").and_then(|value| value.as_str()) else {
        return text;
    };
    let details = existing.lines().skip(1).collect::<Vec<_>>().join("\n");
    if !details.trim().is_empty() {
        text.push('\n');
        text.push_str(&details);
    }
    text
}

fn resolve_screenshot_path(
    path: &Path,
    base_dir: Option<&Path>,
    default_dir: Option<&Path>,
) -> Result<PathBuf> {
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }

    if let Some(default_dir) = default_dir {
        let file_name = path
            .file_name()
            .ok_or_else(|| anyhow!("default screenshot path needs a filename"))?;
        return Ok(default_dir.join(file_name));
    }

    Ok(base_dir
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(path))
        .unwrap_or_else(|| path.to_path_buf()))
}

fn apply_session_event(session: &mut SessionInfo, name: &str, data: &Value, now: u64) {
    session.last_heartbeat_at = now;
    if name == "focused" {
        session.last_focused_at = now;
    }
    if let Some(profile_id) = data.get("profileId").and_then(|v| v.as_str()) {
        session.profile_id = profile_id.to_string();
    }
    if let Some(active_page) = data.get("activePage") {
        session.active_page =
            serde_json::from_value::<Option<ActivePageInfo>>(active_page.clone()).unwrap_or(None);
    }
}

pub fn run_native_host() -> Result<()> {
    let session_id = Uuid::new_v4().to_string();
    let pipe_name = pipe_name_for_session(&session_id)?;
    let now = now_ms();
    let session = SessionInfo {
        session_id: session_id.clone(),
        session_name: None,
        namespace: None,
        profile_name: None,
        profile_kind: None,
        profile_path: None,
        ephemeral_root: None,
        restore_key: None,
        profile_id: "pending".into(),
        pipe_name: pipe_name.clone(),
        extension_id: EXTENSION_ID.into(),
        extension_version: "pending".into(),
        started_at: now,
        last_heartbeat_at: now,
        last_focused_at: now,
        active_page: None,
    };
    write_session_atomic(&session)?;
    let shared_session = SharedSession::new(session);

    let bridge = Arc::new(NativeBridge {
        stdout: Mutex::new(stdout()),
        pending: Mutex::new(HashMap::new()),
        session: shared_session.clone(),
        transfers: Mutex::new(TransferStore::default()),
        outbound_uploads: Mutex::new(OutboundUploadStore::default()),
        command_gate: Mutex::new(()),
        restore_lifecycle: Mutex::new(None),
    });

    {
        let mut stdout = bridge.stdout.lock().unwrap();
        write_native_message(
            &mut *stdout,
            &NativeOutbound::HostStatus {
                session_id: session_id.clone(),
                pipe_name: pipe_name.clone(),
            },
        )?;
    }

    let stop = Arc::new(AtomicBool::new(false));
    {
        let bridge = bridge.clone();
        let stop = stop.clone();
        let pipe_name = pipe_name.clone();
        thread::spawn(move || {
            let _ = run_pipe_server(pipe_name, stop, move |line| {
                handle_pipe_line(&bridge, &line)
            });
        });
    }
    {
        let bridge = bridge.clone();
        let stop = stop.clone();
        thread::spawn(move || run_restore_autosave_loop(bridge, stop));
    }

    let mut stdin = stdin();
    loop {
        match read_native_message::<NativeInbound>(&mut stdin) {
            Ok(Some(message)) => bridge.dispatch_inbound(message),
            Ok(None) => break,
            Err(err) => {
                let _ = shared_session.update(|session| {
                    session.last_heartbeat_at = now_ms();
                });
                eprintln!("pire-browser-host native message error: {err}");
                break;
            }
        }
    }

    stop.store(true, Ordering::SeqCst);
    bridge.transfers.lock().unwrap().clear();
    let final_session = shared_session.snapshot();
    let _ = remove_session(&session_id);
    if let Some(ephemeral_root) = final_session.ephemeral_root {
        let _ = crate::launch::spawn_ephemeral_cleanup_worker(&ephemeral_root);
    }
    Ok(())
}

fn handle_pipe_line(bridge: &NativeBridge, line: &str) -> String {
    log_host(&format!("pipe request received bytes={}", line.len()));
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        handle_pipe_line_inner(bridge, line)
    }));
    match result {
        Ok(response) => response,
        Err(_) => {
            log_host("panic while handling pipe request");
            serde_json::to_string(&RpcResponse::err(
                "invalid",
                "host_panic",
                "native host panicked while handling command",
            ))
            .unwrap_or_else(|_| "{\"id\":\"invalid\",\"ok\":false}".to_string())
        }
    }
}

fn handle_pipe_line_inner(bridge: &NativeBridge, line: &str) -> String {
    let started_at = now_ms();
    let parsed = serde_json::from_str::<RpcRequest>(line);
    let response = match parsed {
        Ok(request) => {
            let session = bridge.session.snapshot();
            log_host(&pipe_request_log(&request, &session));
            match request.method.as_str() {
                "host_status" => RpcResponse::ok(request.id, json!(bridge.session.snapshot())),
                "host_configure_lifecycle" => configure_host_lifecycle(bridge, request),
                "host_configure_restore" => configure_host_restore(bridge, request),
                "host_validate_restore" => validate_host_restore(bridge, request),
                "host_clear_restore_guard" => {
                    if let Some(config) = bridge.restore_lifecycle.lock().unwrap().as_mut() {
                        config.auto_save_allowed = true;
                    }
                    RpcResponse::ok(request.id, json!({ "cleared": true }))
                }
                _ => {
                    let command_args = request
                        .params
                        .get("args")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    let is_close = command_args
                        .first()
                        .and_then(Value::as_str)
                        .is_some_and(|command| matches!(command, "close" | "quit" | "exit"));
                    let is_state_import = command_args.first().and_then(Value::as_str)
                        == Some("state")
                        && command_args.get(1).and_then(Value::as_str) == Some("import");
                    if is_close {
                        let _ = save_restore_state(bridge, true);
                    }
                    let response = bridge.send_request(request);
                    if is_state_import && response.ok {
                        if let Some(config) = bridge.restore_lifecycle.lock().unwrap().as_mut() {
                            config.auto_save_allowed = true;
                        }
                    }
                    response
                }
            }
        }
        Err(err) => RpcResponse::err(
            "invalid",
            "invalid_request",
            format!("failed to parse request JSON: {err}"),
        ),
    };
    log_host(&pipe_response_log(&response, started_at, now_ms()));
    serde_json::to_string(&response).unwrap_or_else(|err| {
        json!({
            "id": "invalid",
            "ok": false,
            "error": { "code": "serialization_failed", "message": err.to_string() }
        })
        .to_string()
    })
}

fn configure_host_lifecycle(bridge: &NativeBridge, request: RpcRequest) -> RpcResponse {
    let result = (|| -> Result<SessionInfo> {
        let session_name = required_string_param(&request.params, "sessionName")?;
        let namespace = required_string_param(&request.params, "namespace")?;
        let profile_name = required_string_param(&request.params, "profileName")?;
        let profile_kind: SessionProfileKind = serde_json::from_value(
            request
                .params
                .get("profileKind")
                .cloned()
                .context("host lifecycle configuration omitted profileKind")?,
        )
        .context("host lifecycle configuration has invalid profileKind")?;
        let profile_path = PathBuf::from(required_string_param(&request.params, "profilePath")?);
        let ephemeral_root =
            PathBuf::from(required_string_param(&request.params, "ephemeralRoot")?);
        bridge.session.update(|session| {
            session.session_name = Some(session_name);
            session.namespace = Some(namespace);
            session.profile_name = Some(profile_name);
            session.profile_kind = Some(profile_kind);
            session.profile_path = Some(profile_path);
            session.ephemeral_root = Some(ephemeral_root);
        })?;
        Ok(bridge.session.snapshot())
    })();
    match result {
        Ok(session) => RpcResponse::ok(request.id, json!(session)),
        Err(err) => RpcResponse::err(
            request.id,
            "invalid_lifecycle_config",
            format!("failed to configure host lifecycle: {err:#}"),
        ),
    }
}

fn configure_host_restore(bridge: &NativeBridge, request: RpcRequest) -> RpcResponse {
    let result = (|| -> Result<Value> {
        let path = PathBuf::from(required_string_param(&request.params, "path")?);
        let restore_key = required_string_param(&request.params, "restoreKey")?;
        if !path.is_absolute() {
            anyhow::bail!("restore state path must be absolute");
        }
        let save_policy: RestoreSavePolicy = serde_json::from_value(
            request
                .params
                .get("savePolicy")
                .cloned()
                .unwrap_or_else(|| json!("auto")),
        )
        .context("restore save policy must be auto, always, or never")?;
        let interval_ms = request
            .params
            .get("intervalMs")
            .and_then(Value::as_u64)
            .unwrap_or(30_000);
        let check_url = optional_string_param(&request.params, "checkUrl");
        let check_text = optional_string_param(&request.params, "checkText");
        let check_fn = optional_string_param(&request.params, "checkFn");

        let mut warning = None;
        let mut auto_save_allowed = true;
        let mut imported = false;
        let state = if path.exists() {
            match read_automatic_restore_state(&path) {
                Ok(read) => {
                    imported = true;
                    Some(read.state)
                }
                Err(err) => {
                    auto_save_allowed = false;
                    warning = Some(format!(
                        "Restore state could not be imported; the browser remains usable and auto-save is disabled to preserve the existing file: {err:#}"
                    ));
                    None
                }
            }
        } else {
            None
        };

        let extension_request = RpcRequest {
            id: Uuid::new_v4().to_string(),
            method: "lifecycle_configure".to_string(),
            params: json!({
                "state": state,
                "checkUrl": check_url,
                "checkText": check_text,
                "checkFn": check_fn,
            }),
        };
        let extension_response = bridge.send_request(extension_request);
        if !extension_response.ok {
            auto_save_allowed = false;
            let message = extension_response
                .error
                .map(|error| format!("{}: {}", error.code, error.message))
                .unwrap_or_else(|| "unknown extension restore error".to_string());
            warning = Some(format!(
                "Restore initialization failed; the browser remains usable and auto-save is disabled: {message}"
            ));
        }

        *bridge.restore_lifecycle.lock().unwrap() = Some(RestoreLifecycleConfig {
            path: path.clone(),
            save_policy,
            interval_ms,
            next_save_at: now_ms().saturating_add(interval_ms),
            auto_save_allowed,
            check_url,
            check_text,
            check_fn,
        });
        bridge.session.update(|session| {
            session.restore_key = Some(restore_key.clone());
        })?;
        Ok(json!({
            "configured": true,
            "path": path,
            "imported": imported,
            "savePolicy": save_policy,
            "intervalMs": interval_ms,
            "autoSaveEnabled": save_policy != RestoreSavePolicy::Never && auto_save_allowed,
            "warning": warning,
        }))
    })();
    match result {
        Ok(value) => RpcResponse::ok(request.id, value),
        Err(err) => RpcResponse::err(
            request.id,
            "invalid_restore_config",
            format!("failed to configure restore lifecycle: {err:#}"),
        ),
    }
}

fn optional_string_param(params: &Value, name: &str) -> Option<String> {
    params
        .get(name)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn validate_host_restore(bridge: &NativeBridge, request: RpcRequest) -> RpcResponse {
    let result = (|| -> Result<Value> {
        let config = bridge.restore_lifecycle.lock().unwrap().clone();
        let Some(config) = config else {
            return Ok(json!({ "checked": false, "reason": "restore_not_configured" }));
        };
        if config.check_url.is_none() && config.check_text.is_none() && config.check_fn.is_none() {
            return Ok(json!({ "checked": false, "reason": "no_validation_checks" }));
        }
        let extension_request = RpcRequest {
            id: Uuid::new_v4().to_string(),
            method: "lifecycle_export".to_string(),
            params: json!({
                "checkUrl": config.check_url,
                "checkText": config.check_text,
                "checkFn": config.check_fn,
            }),
        };
        let response = bridge.send_request(extension_request);
        if !response.ok {
            let message = response
                .error
                .map(|error| format!("{}: {}", error.code, error.message))
                .unwrap_or_else(|| "unknown restore validation error".to_string());
            if restore_validation_guards_auto_save(config.save_policy) {
                if let Some(config) = bridge.restore_lifecycle.lock().unwrap().as_mut() {
                    config.auto_save_allowed = false;
                }
            }
            return Ok(json!({
                "checked": true,
                "passed": false,
                "warning": format!("Restore validation could not run; the browser remains usable and auto-save is disabled: {message}"),
            }));
        }
        let result = response
            .result
            .context("restore validation omitted result")?;
        let validation = result
            .get("validation")
            .cloned()
            .unwrap_or_else(|| json!({ "passed": true, "checks": [] }));
        let passed = validation
            .get("passed")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        if !passed && restore_validation_guards_auto_save(config.save_policy) {
            if let Some(config) = bridge.restore_lifecycle.lock().unwrap().as_mut() {
                config.auto_save_allowed = false;
            }
        }
        Ok(json!({
            "checked": true,
            "passed": passed,
            "validation": validation,
            "warning": (!passed).then_some("Restore validation failed; the browser remains usable, but automatic saving is disabled so the prior state is preserved."),
        }))
    })();
    match result {
        Ok(value) => RpcResponse::ok(request.id, value),
        Err(err) => RpcResponse::err(
            request.id,
            "restore_validation_failed",
            format!("failed to validate restore lifecycle: {err:#}"),
        ),
    }
}

fn run_restore_autosave_loop(bridge: Arc<NativeBridge>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(250));
        let due = bridge
            .restore_lifecycle
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|config| restore_autosave_is_due(config, now_ms()));
        if !due {
            continue;
        }
        let Ok(_guard) = bridge.command_gate.try_lock() else {
            continue;
        };
        let _ = save_restore_state_unlocked(&bridge, false);
    }
}

fn save_restore_state(bridge: &NativeBridge, force: bool) -> Result<Value> {
    let _guard = bridge.command_gate.lock().unwrap();
    save_restore_state_unlocked(bridge, force)
}

fn save_restore_state_unlocked(bridge: &NativeBridge, force: bool) -> Result<Value> {
    let config = {
        let mut lifecycle = bridge.restore_lifecycle.lock().unwrap();
        let Some(config) = lifecycle.as_mut() else {
            return Ok(json!({ "saved": false, "reason": "restore_not_configured" }));
        };
        let now = now_ms();
        if let Some(reason) = restore_save_skip_reason(config, force, now) {
            return Ok(json!({ "saved": false, "reason": reason }));
        }
        config.next_save_at = now.saturating_add(config.interval_ms);
        config.clone()
    };

    let request = RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "lifecycle_export".to_string(),
        params: json!({
            "checkUrl": config.check_url,
            "checkText": config.check_text,
            "checkFn": config.check_fn,
        }),
    };
    let response = bridge.send_request_unlocked(request);
    if !response.ok {
        let message = response
            .error
            .map(|error| format!("{}: {}", error.code, error.message))
            .unwrap_or_else(|| "unknown extension export error".to_string());
        anyhow::bail!("automatic restore export failed: {message}");
    }
    let result = response
        .result
        .context("automatic restore export omitted result")?;
    let validation_passed = result
        .get("validation")
        .and_then(|value| value.get("passed"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    if !validation_passed && restore_validation_guards_auto_save(config.save_policy) {
        if let Some(config) = bridge.restore_lifecycle.lock().unwrap().as_mut() {
            config.auto_save_allowed = false;
        }
        return Ok(json!({
            "saved": false,
            "reason": "restore_validation_failed",
            "validation": result.get("validation"),
        }));
    }
    let state: AutomaticRestoreState = serde_json::from_value(
        result
            .get("state")
            .cloned()
            .context("automatic restore export omitted state")?,
    )
    .context("automatic restore export returned invalid state")?;
    let write = write_automatic_restore_state(&config.path, &state)?;
    Ok(json!({
        "saved": true,
        "path": config.path,
        "bytes": write.bytes,
        "encryption": {
            "encrypted": write.encryption.encrypted,
            "algorithm": write.encryption.algorithm,
        },
        "validation": result.get("validation"),
    }))
}

fn restore_autosave_is_due(config: &RestoreLifecycleConfig, now: u64) -> bool {
    config.interval_ms > 0
        && config.save_policy != RestoreSavePolicy::Never
        && now >= config.next_save_at
}

fn restore_save_skip_reason(
    config: &RestoreLifecycleConfig,
    force: bool,
    now: u64,
) -> Option<&'static str> {
    if config.save_policy == RestoreSavePolicy::Never {
        return Some("save_policy_never");
    }
    if restore_validation_guards_auto_save(config.save_policy) && !config.auto_save_allowed {
        return Some("auto_save_guarded");
    }
    if !force && (config.interval_ms == 0 || now < config.next_save_at) {
        return Some("not_due");
    }
    None
}

fn restore_validation_guards_auto_save(policy: RestoreSavePolicy) -> bool {
    policy == RestoreSavePolicy::Auto
}

fn required_string_param(params: &Value, name: &str) -> Result<String> {
    params
        .get(name)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .with_context(|| format!("host lifecycle configuration omitted {name}"))
}

fn log_host(message: &str) {
    let path = match crate::session::data_dir() {
        Ok(path) => path.join("host.log"),
        Err(_) => return,
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = writeln!(file, "{} {}", now_ms(), message);
        let _ = file.flush();
    }
}

fn pipe_request_log(request: &RpcRequest, session: &SessionInfo) -> String {
    format!(
        "pipe request id={} method={} command_root={} session_id={} profile_id={}",
        request.id,
        request.method,
        command_root_from_request(request),
        session.session_id,
        session.profile_id
    )
}

fn pipe_response_log(response: &RpcResponse, started_at: u64, finished_at: u64) -> String {
    let error_code = response
        .error
        .as_ref()
        .map(|error| error.code.as_str())
        .unwrap_or("");
    format!(
        "pipe response id={} ok={} duration_ms={} error_code={}",
        response.id,
        response.ok,
        finished_at.saturating_sub(started_at),
        error_code
    )
}

fn command_root_from_request(request: &RpcRequest) -> &str {
    request
        .params
        .get("args")
        .and_then(|args| args.as_array())
        .and_then(|args| args.first())
        .and_then(|arg| arg.as_str())
        .unwrap_or("")
}

fn native_outbound_request_log(id: &str) -> String {
    format!("native outbound request {id}")
}

fn native_inbound_response_log(id: &str, ok: bool) -> String {
    format!("native inbound response {id} ok={ok}")
}

fn native_response_timeout_log(id: &str) -> String {
    format!("native response timeout {id}")
}

#[cfg(test)]
mod tests {
    use base64::Engine;
    use sha2::{Digest, Sha256};

    use super::*;

    fn restore_config(policy: RestoreSavePolicy) -> RestoreLifecycleConfig {
        RestoreLifecycleConfig {
            path: PathBuf::from("restore.json"),
            save_policy: policy,
            interval_ms: 30_000,
            next_save_at: 40_000,
            auto_save_allowed: true,
            check_url: None,
            check_text: None,
            check_fn: None,
        }
    }

    #[test]
    fn restore_save_policies_protect_good_state_after_validation_failure() {
        let mut auto = restore_config(RestoreSavePolicy::Auto);
        auto.auto_save_allowed = false;
        assert_eq!(
            restore_save_skip_reason(&auto, true, 50_000),
            Some("auto_save_guarded")
        );

        let mut always = restore_config(RestoreSavePolicy::Always);
        always.auto_save_allowed = false;
        assert_eq!(restore_save_skip_reason(&always, true, 50_000), None);

        let never = restore_config(RestoreSavePolicy::Never);
        assert_eq!(
            restore_save_skip_reason(&never, true, 50_000),
            Some("save_policy_never")
        );
        assert!(restore_validation_guards_auto_save(RestoreSavePolicy::Auto));
        assert!(!restore_validation_guards_auto_save(
            RestoreSavePolicy::Always
        ));
    }

    #[test]
    fn autosave_due_logic_honors_interval_zero_and_command_time() {
        let mut config = restore_config(RestoreSavePolicy::Auto);
        assert!(!restore_autosave_is_due(&config, 39_999));
        assert!(restore_autosave_is_due(&config, 40_000));
        assert_eq!(
            restore_save_skip_reason(&config, false, 39_999),
            Some("not_due")
        );
        assert_eq!(restore_save_skip_reason(&config, false, 40_000), None);

        config.interval_ms = 0;
        assert!(!restore_autosave_is_due(&config, u64::MAX));
        assert_eq!(
            restore_save_skip_reason(&config, false, u64::MAX),
            Some("not_due")
        );
        assert_eq!(restore_save_skip_reason(&config, true, u64::MAX), None);
    }

    #[test]
    fn host_debug_log_messages_include_request_ids() {
        let id = "rpc-123";
        assert!(native_outbound_request_log(id).contains(id));
        assert!(native_inbound_response_log(id, true).contains(id));
        assert!(native_response_timeout_log(id).contains(id));
    }

    #[test]
    fn pipe_debug_log_messages_include_session_command_and_error_metadata() {
        let request = RpcRequest {
            id: "rpc-456".into(),
            method: "command".into(),
            params: json!({ "args": ["open", "https://example.com"] }),
        };
        let session = SessionInfo {
            session_id: "session-1".into(),
            profile_name: None,
            profile_id: "profile-1".into(),
            pipe_name: "pipe".into(),
            extension_id: "ext".into(),
            extension_version: "1".into(),
            started_at: 1,
            last_heartbeat_at: 1,
            last_focused_at: 1,
            active_page: None,
            ..SessionInfo::default()
        };
        let request_log = pipe_request_log(&request, &session);
        assert!(request_log.contains("rpc-456"));
        assert!(request_log.contains("command_root=open"));
        assert!(request_log.contains("session_id=session-1"));
        assert!(request_log.contains("profile_id=profile-1"));

        let response = RpcResponse::err("rpc-456", "timeout", "timed out");
        let response_log = pipe_response_log(&response, 100, 145);
        assert!(response_log.contains("rpc-456"));
        assert!(response_log.contains("duration_ms=45"));
        assert!(response_log.contains("error_code=timeout"));
    }

    #[test]
    fn session_events_update_active_page_metadata() {
        let mut session = SessionInfo {
            session_id: "session-1".into(),
            profile_name: None,
            profile_id: "pending".into(),
            pipe_name: "pipe".into(),
            extension_id: "ext".into(),
            extension_version: "1".into(),
            started_at: 1,
            last_heartbeat_at: 1,
            last_focused_at: 1,
            active_page: None,
            ..SessionInfo::default()
        };

        apply_session_event(
            &mut session,
            "focused",
            &json!({
                "profileId": "profile-1",
                "activePage": {
                    "agentId": "t1",
                    "label": "docs",
                    "title": "Docs",
                    "url": "https://example.com",
                    "tabId": 10,
                    "windowId": 2,
                    "updatedAt": 123
                }
            }),
            200,
        );

        assert_eq!(session.profile_id, "profile-1");
        assert_eq!(session.last_heartbeat_at, 200);
        assert_eq!(session.last_focused_at, 200);
        assert_eq!(session.active_page.as_ref().unwrap().agent_id, "t1");

        apply_session_event(
            &mut session,
            "heartbeat",
            &json!({ "activePage": null }),
            300,
        );
        assert!(session.active_page.is_none());
    }

    #[test]
    fn writes_nested_batch_screenshot_results() {
        let bytes = b"\x89PNG\r\n\x1a\nnested screenshot";
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        let sha = hex::encode(Sha256::digest(bytes));
        let mut transfers = TransferStore::default();
        transfers
            .add_chunk(
                "nested-shot".into(),
                0,
                1,
                bytes.len(),
                sha.clone(),
                encoded,
            )
            .unwrap();
        let path = std::env::temp_dir().join(format!(
            "pire-browser-host-nested-screenshot-{}.png",
            Uuid::new_v4()
        ));
        let mut result = json!({
            "text": "Ran 3 batch command(s)",
            "results": [
                {
                    "command": ["screenshot", path.to_string_lossy()],
                    "success": true,
                    "error": null,
                    "result": {
                        "text": "Screenshot captured",
                        "screenshotPath": path.to_string_lossy(),
                        "screenshot": {
                            "transferId": "nested-shot",
                            "mimeType": "image/png",
                            "byteLength": bytes.len(),
                            "sha256": sha
                        }
                    }
                }
            ]
        });

        write_screenshots_in_value(&mut result, &mut transfers, None).unwrap();

        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert!(result["results"][0]["result"]["text"]
            .as_str()
            .unwrap()
            .contains("Screenshot written to"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn writes_relative_screenshots_under_invocation_cwd() {
        let bytes = b"\x89PNG\r\n\x1a\nrelative screenshot";
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        let sha = hex::encode(Sha256::digest(bytes));
        let mut transfers = TransferStore::default();
        transfers
            .add_chunk(
                "relative-shot".into(),
                0,
                1,
                bytes.len(),
                sha.clone(),
                encoded,
            )
            .unwrap();
        let base_dir = std::env::temp_dir().join(format!(
            "pire-browser-host-relative-screenshot-{}",
            Uuid::new_v4()
        ));
        let relative_path = PathBuf::from("shots").join("relative.png");
        let expected_path = base_dir.join(&relative_path);
        let mut result = json!({
            "text": "Screenshot captured",
            "screenshotPath": relative_path.to_string_lossy(),
            "screenshot": {
                "transferId": "relative-shot",
                "mimeType": "image/png",
                "byteLength": bytes.len(),
                "sha256": sha
            }
        });

        write_screenshots_in_value(&mut result, &mut transfers, Some(&base_dir)).unwrap();

        assert_eq!(fs::read(&expected_path).unwrap(), bytes);
        assert_eq!(
            result["screenshotPath"].as_str().unwrap(),
            expected_path.to_string_lossy()
        );
        assert!(result["text"]
            .as_str()
            .unwrap()
            .contains(&expected_path.to_string_lossy().to_string()));
        let _ = fs::remove_dir_all(base_dir);
    }

    #[test]
    fn screenshot_write_preserves_annotation_legend_text() {
        let path = PathBuf::from("annotated.png");
        let result = json!({
            "text": "Screenshot captured for annotated.png\nAnnotated 1 element(s).\nAnnotation refs:\n  [1] @e1 button \"Submit\"\nUse these @e refs for follow-up click/fill/get commands.",
            "screenshotPath": path.to_string_lossy()
        });

        let text = screenshot_written_text(&result, &PathBuf::from("C:/tmp/annotated.png"));

        assert!(text.starts_with("Screenshot written to C:/tmp/annotated.png"));
        assert!(text.contains("Annotation refs:"));
        assert!(text.contains("[1] @e1 button \"Submit\""));
        assert!(text.contains("Use these @e refs for follow-up click/fill/get commands."));
    }

    #[test]
    fn resolves_generated_default_screenshots_under_data_screenshot_dir() {
        let base_dir = PathBuf::from("/repo/work");
        let default_dir = PathBuf::from("/agent/data/pire-browser/screenshots");
        let path = resolve_screenshot_path(
            &PathBuf::from("pire-browser-screenshot-123.png"),
            Some(&base_dir),
            Some(&default_dir),
        )
        .unwrap();

        assert_eq!(
            path,
            PathBuf::from("/agent/data/pire-browser/screenshots/pire-browser-screenshot-123.png")
        );
    }

    #[test]
    fn generated_default_screenshot_paths_keep_only_the_filename() {
        let default_dir = PathBuf::from("/agent/data/pire-browser/screenshots");
        let path = resolve_screenshot_path(
            &PathBuf::from("nested/ignored.png"),
            None,
            Some(&default_dir),
        )
        .unwrap();

        assert_eq!(
            path,
            PathBuf::from("/agent/data/pire-browser/screenshots/ignored.png")
        );
    }

    #[test]
    fn stages_upload_payloads_out_of_native_outbound_requests() {
        let encoded = "a".repeat(OUTBOUND_UPLOAD_CHUNK_BASE64_BYTES + 16);
        let mut params = json!({
            "args": ["upload", "#file", "large.bin"],
            "uploadFiles": [{
                "name": "large.bin",
                "mimeType": "application/octet-stream",
                "size": 786432u64,
                "sha256": "abc123",
                "bytesBase64": encoded,
            }]
        });
        let mut store = OutboundUploadStore::default();

        let transfer_id = stage_outbound_upload_params(&mut params, &mut store)
            .unwrap()
            .unwrap();

        assert!(params.get("uploadFiles").is_none());
        let upload_ref = params.get("uploadFilesRef").unwrap();
        assert_eq!(
            upload_ref.get("transferId").and_then(Value::as_str),
            Some(transfer_id.as_str())
        );
        assert_eq!(
            upload_ref
                .get("files")
                .and_then(Value::as_array)
                .and_then(|files| files.first())
                .and_then(|file| file.get("chunks"))
                .and_then(Value::as_u64),
            Some(2)
        );

        match store.chunk_response("req-1".into(), transfer_id.clone(), 0, 0) {
            NativeOutbound::UploadChunkResponse {
                ok, data, total, ..
            } => {
                assert!(ok);
                assert_eq!(total, 2);
                assert_eq!(data.len(), OUTBOUND_UPLOAD_CHUNK_BASE64_BYTES);
            }
            other => panic!("unexpected response: {other:?}"),
        }
        match store.chunk_response("req-2".into(), transfer_id, 0, 1) {
            NativeOutbound::UploadChunkResponse {
                ok, data, total, ..
            } => {
                assert!(ok);
                assert_eq!(total, 2);
                assert_eq!(data.len(), 16);
            }
            other => panic!("unexpected response: {other:?}"),
        }
    }

    #[test]
    fn upload_chunk_response_reports_missing_transfer() {
        let mut store = OutboundUploadStore::default();

        match store.chunk_response("req-1".into(), "missing".into(), 0, 0) {
            NativeOutbound::UploadChunkResponse {
                ok,
                error: Some(error),
                ..
            } => {
                assert!(!ok);
                assert_eq!(error.code, "upload_transfer_not_found");
            }
            other => panic!("unexpected response: {other:?}"),
        }
    }
}
