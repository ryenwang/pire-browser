use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::io::{stdin, stdout, Stdout};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use crossbeam_channel::{bounded, Sender};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::ipc::{pipe_name_for_session, run_pipe_server};
use crate::native::{read_native_message, write_native_message};
use crate::protocol::{
    NativeInbound, NativeOutbound, RpcError, RpcRequest, RpcResponse, EXTENSION_ID,
};
use crate::session::{now_ms, remove_session, write_session_atomic, SessionInfo};
use crate::transfer::{ResultTransferMeta, ScreenshotTransferMeta, TransferStore};

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
}

impl NativeBridge {
    fn send_request(&self, request: RpcRequest) -> RpcResponse {
        let (tx, rx) = bounded::<RpcResponse>(1);
        self.pending.lock().unwrap().insert(request.id.clone(), tx);

        log_host(&native_outbound_request_log(&request.id));
        let write_result = {
            let mut stdout = self.stdout.lock().unwrap();
            write_native_message(
                &mut *stdout,
                &NativeOutbound::Request {
                    id: request.id.clone(),
                    method: request.method.clone(),
                    params: request.params.clone(),
                },
            )
        };

        if let Err(err) = write_result {
            log_host(&format!("native outbound write failed: {err}"));
            self.pending.lock().unwrap().remove(&request.id);
            return RpcResponse::err(
                request.id,
                "extension_disconnected",
                format!("failed to write to Firefox extension: {err}"),
            );
        }

        match rx.recv_timeout(Duration::from_secs(30)) {
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
                    if let Err(err) = self.maybe_write_screenshot(result) {
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
        }
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

    fn maybe_write_screenshot(&self, result: &mut Value) -> Result<()> {
        let Some(screenshot) = result.get("screenshot").cloned() else {
            return Ok(());
        };
        let meta: ScreenshotTransferMeta = serde_json::from_value(screenshot)
            .context("invalid screenshot transfer metadata from extension")?;
        let bytes = self.transfers.lock().unwrap().complete(&meta)?;
        let path = result
            .get("screenshotPath")
            .and_then(|v| v.as_str())
            .map(PathBuf::from)
            .ok_or_else(|| anyhow!("extension response omitted screenshotPath"))?;
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)?;
            }
        }
        fs::write(&path, bytes)?;
        result["text"] = json!(format!("Screenshot written to {}", path.display()));
        Ok(())
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
                    let now = now_ms();
                    session.last_heartbeat_at = now;
                    if name == "focused" {
                        session.last_focused_at = now;
                    }
                    if let Some(profile_id) = data.get("profileId").and_then(|v| v.as_str()) {
                        session.profile_id = profile_id.to_string();
                    }
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
        }
    }
}

pub fn run_native_host() -> Result<()> {
    let session_id = Uuid::new_v4().to_string();
    let pipe_name = pipe_name_for_session(&session_id)?;
    let now = now_ms();
    let session = SessionInfo {
        session_id: session_id.clone(),
        profile_id: "pending".into(),
        pipe_name: pipe_name.clone(),
        extension_id: EXTENSION_ID.into(),
        extension_version: "pending".into(),
        started_at: now,
        last_heartbeat_at: now,
        last_focused_at: now,
    };
    write_session_atomic(&session)?;
    let shared_session = SharedSession::new(session);

    let bridge = Arc::new(NativeBridge {
        stdout: Mutex::new(stdout()),
        pending: Mutex::new(HashMap::new()),
        session: shared_session.clone(),
        transfers: Mutex::new(TransferStore::default()),
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
    let _ = remove_session(&session_id);
    Ok(())
}

fn handle_pipe_line(bridge: &NativeBridge, line: &str) -> String {
    log_host(&format!("pipe request: {line}"));
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
            if request.method == "host_status" {
                RpcResponse::ok(request.id, json!(bridge.session.snapshot()))
            } else {
                bridge.send_request(request)
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
    use super::*;

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
            profile_id: "profile-1".into(),
            pipe_name: "pipe".into(),
            extension_id: "ext".into(),
            extension_version: "1".into(),
            started_at: 1,
            last_heartbeat_at: 1,
            last_focused_at: 1,
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
}
