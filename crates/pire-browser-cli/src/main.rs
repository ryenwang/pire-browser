use anyhow::{bail, Context, Result};
use pire_browser_core::cli::{
    build_command_request, format_cli_result, parse_cli_args, LocalCommand,
};
use pire_browser_core::install_status::{
    collect_install_status, install_status_json, install_status_text,
};
use pire_browser_core::ipc::send_pipe_request;
use pire_browser_core::launch::{launch_firefox, launch_result_text, LaunchOptions};
use pire_browser_core::protocol::{RpcRequest, RpcResponse};
use pire_browser_core::session::{
    cleanup_stale_sessions, list_sessions, now_ms, select_session, session_status_text,
};
use pire_browser_core::setup::{setup_result_text, setup_windows};
use serde_json::json;
use uuid::Uuid;

fn main() {
    if let Err(err) = run() {
        eprintln!("{err:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match parse_cli_args(&args)? {
        LocalCommand::Setup {
            windows,
            firefox_path,
        } => {
            if !windows {
                bail!("setup currently supports `pire-browser setup --windows` only");
            }
            let result = setup_windows(firefox_path)?;
            println!("{}", setup_result_text(&result));
        }
        LocalCommand::Status => {
            cleanup_stale_sessions(now_ms())?;
            let sessions = list_sessions()?;
            println!("{}", session_status_text(&sessions));
        }
        LocalCommand::Launch {
            profile,
            url,
            firefox_path,
        } => {
            let result = launch_firefox(LaunchOptions {
                profile,
                url,
                firefox_path,
            })?;
            println!("{}", launch_result_text(&result));
        }
        LocalCommand::InstallStatus { json } => {
            let report = collect_install_status()?;
            if json {
                println!("{}", install_status_json(&report)?);
            } else {
                println!("{}", install_status_text(&report));
            }
        }
        LocalCommand::Remote {
            session,
            json,
            args,
        } => {
            let request = build_command_request(args);
            let response = send_to_session(session.as_deref(), &request)?;
            if !response.ok {
                let err = response
                    .error
                    .map(|err| format!("{}: {}", err.code, err.message))
                    .unwrap_or_else(|| "unknown extension error".into());
                bail!("{err}");
            }
            let result = response.result.unwrap_or_else(|| json!({ "text": "ok" }));
            println!("{}", format_cli_result(&result, json)?);
        }
    }
    Ok(())
}

fn send_to_session(session_id: Option<&str>, request: &RpcRequest) -> Result<RpcResponse> {
    let session = select_session(session_id)?;
    let line = serde_json::to_string(request)?;
    let response = send_pipe_request(&session.pipe_name, &line)
        .with_context(|| format!("failed talking to session {}", session.session_id))?;
    Ok(serde_json::from_str(&response)?)
}

#[allow(dead_code)]
fn host_status_request() -> RpcRequest {
    RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "host_status".into(),
        params: json!({}),
    }
}
