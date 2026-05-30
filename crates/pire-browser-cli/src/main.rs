use anyhow::{bail, Context, Result};
use pire_browser_core::action_policy::{
    action_policy_diagnostic_from_args, action_policy_text,
    decision_from_request_context as action_decision_from_request_context, ensure_action_allowed,
    evaluate_action, policy_command_sequences, request_context as action_policy_request_context,
    resolve_action_policy, ActionPolicyArgs, ActionPolicyDecision,
};
use pire_browser_core::auth_handoff::{auth_handoff_text, collect_default_auth_handoff};
use pire_browser_core::cli::{
    build_command_request, format_cli_result, help_text, parse_cli_args, GlobalFlagWarning,
    LocalCommand, SessionTarget,
};
use pire_browser_core::confirmation_policy::{
    confirmation_policy_diagnostic_from_args, confirmation_policy_text,
    consume_pending_confirmation, decision_from_context as confirmation_decision_from_context,
    deny_pending_confirmation, new_confirmation_id,
    request_context as confirmation_policy_request_context, request_context_with_approval,
    request_context_with_approval_id, resolve_confirmation_policy, sweep_expired_confirmations,
    write_pending_confirmation, ConfirmationPolicyArgs, ConfirmationPolicyDecision,
    PendingConfirmation, PendingConfirmationTarget, CONFIRMATION_REQUIRED_EXIT_CODE,
    CONFIRMATION_TTL_MS, INTERACTIVE_CONFIRMATION_APPROVAL_ID,
};
use pire_browser_core::domain_policy::{
    decision_from_request_context as domain_decision_from_request_context,
    domain_policy_diagnostic_from_args, domain_policy_text, ensure_url_allowed,
    request_context as domain_policy_request_context, resolve_domain_policy, DomainPolicyArgs,
    DomainPolicyDecision, DomainPolicyWarning,
};
use pire_browser_core::install_status::{
    collect_install_status, install_status_json, install_status_text,
};
use pire_browser_core::ipc::send_pipe_request;
use pire_browser_core::launch::{
    annotate_session_profile_names, launch_firefox, launch_result_text,
    live_session_for_profile_name, validate_profile_name, LaunchOptions,
};
use pire_browser_core::protocol::{RpcRequest, RpcResponse};
use pire_browser_core::redaction::{redact_json_value, redact_text};
use pire_browser_core::session::{
    cleanup_stale_sessions, cleanup_stale_sessions_with_report, list_sessions, now_ms,
    remove_session, select_session, session_attach_text, session_attach_value,
    session_cleanup_text, session_cleanup_value, session_status_text, session_status_value,
};
use pire_browser_core::setup::{setup_result_text, setup_windows};
use pire_browser_core::state_file::{
    display_url_without_query_or_fragment, read_state_file_with_metadata,
    state_from_extension_export, sweep_expired_state_receipts, validate_state_inspection_receipt,
    write_state_file, write_state_inspection_receipt, ActiveOriginStateFile,
    StateInspectionReceipt,
};
use pire_browser_core::state_policy::{
    collect_state_policy, resolve_state_load_policy, state_policy_text, StateLoadPolicyDecision,
    StateLoadPolicyFlag, StatePolicyWarning,
};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::io::{self, IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use uuid::Uuid;

const UNSUPPORTED_ROOTS_JSON: &str =
    include_str!("../../../docs/agent-browser-unsupported-roots.json");
const CLI_VERSION: &str = env!("CARGO_PKG_VERSION");

struct PolicyArgsBundle {
    domain_policy: DomainPolicyArgs,
    action_policy: ActionPolicyArgs,
    confirmation_policy: ConfirmationPolicyArgs,
}

struct ConfirmationGate<'a> {
    confirmation_decision: &'a ConfirmationPolicyDecision,
    target: PendingConfirmationTarget,
    domain_decision: &'a DomainPolicyDecision,
    action_decision: &'a ActionPolicyDecision,
    json_output: bool,
    ignored_global_flags: &'a [GlobalFlagWarning],
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{}", redact_text(&format!("{err:#}")));
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match parse_cli_args(&args)? {
        LocalCommand::Help { topic } => {
            if let Some(text) = help_text(topic.as_deref()) {
                println!("{text}");
            } else {
                let topic = topic.unwrap_or_else(|| "(missing)".to_string());
                eprintln!(
                    "unsupported_command: No help topic for `{}`. Try `pire-browser help`.",
                    redact_text(&topic)
                );
                std::process::exit(exit_code_for_error("unsupported_command"));
            }
        }
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
        LocalCommand::Status {
            json,
            domain_policy,
            action_policy,
            confirmation_policy,
        } => {
            cleanup_stale_sessions(now_ms())?;
            let mut sessions = list_sessions()?;
            annotate_session_profile_names(&mut sessions)?;
            let auth_handoff = collect_default_auth_handoff()?;
            let action_policy = action_policy_diagnostic_from_args(&action_policy);
            let domain_policy = domain_policy_diagnostic_from_args(&domain_policy);
            let confirmation_policy =
                confirmation_policy_diagnostic_from_args(&confirmation_policy);
            let state_policy = collect_state_policy();
            if json {
                let mut value = session_status_value(&sessions);
                if let Some(object) = value.as_object_mut() {
                    object.insert(
                        "authHandoff".to_string(),
                        serde_json::to_value(auth_handoff)?,
                    );
                    object.insert(
                        "domainPolicy".to_string(),
                        serde_json::to_value(domain_policy)?,
                    );
                    object.insert(
                        "actionPolicy".to_string(),
                        serde_json::to_value(action_policy)?,
                    );
                    object.insert(
                        "confirmationPolicy".to_string(),
                        serde_json::to_value(confirmation_policy)?,
                    );
                    object.insert(
                        "statePolicy".to_string(),
                        serde_json::to_value(state_policy)?,
                    );
                }
                println!("{}", format_cli_result(&value, true)?);
            } else {
                println!("{}", session_status_text(&sessions));
                println!("{}", auth_handoff_text(&auth_handoff));
                println!("{}", action_policy_text(&action_policy));
                println!("{}", confirmation_policy_text(&confirmation_policy));
                println!("{}", domain_policy_text(&domain_policy));
                println!("{}", state_policy_text(&state_policy));
            }
        }
        LocalCommand::SessionList { json } => {
            cleanup_stale_sessions(now_ms())?;
            let mut sessions = list_sessions()?;
            annotate_session_profile_names(&mut sessions)?;
            if json {
                println!(
                    "{}",
                    format_cli_result(&session_status_value(&sessions), true)?
                );
            } else {
                println!("{}", session_status_text(&sessions));
            }
        }
        LocalCommand::SessionAttach { session, json } => {
            let session = match select_session(Some(&session)) {
                Ok(session) => session,
                Err(err) => {
                    exit_with_anyhow_error(err, json, &[])?;
                    unreachable!();
                }
            };
            let mut sessions = vec![session];
            annotate_session_profile_names(&mut sessions)?;
            let session = sessions.remove(0);
            if json {
                println!(
                    "{}",
                    format_cli_result(&session_attach_value(&session), true)?
                );
            } else {
                println!("{}", session_attach_text(&session));
            }
        }
        LocalCommand::SessionCleanup { json } => {
            let mut report = cleanup_stale_sessions_with_report(now_ms())?;
            annotate_session_profile_names(&mut report.live_sessions)?;
            if json {
                println!(
                    "{}",
                    format_cli_result(&session_cleanup_value(&report), true)?
                );
            } else {
                println!("{}", session_cleanup_text(&report));
            }
        }
        LocalCommand::StateSave {
            target,
            json,
            ignored_global_flags,
            domain_policy,
            action_policy,
            confirmation_policy,
            path,
        } => {
            handle_state_save(
                target,
                json,
                ignored_global_flags,
                PolicyArgsBundle {
                    domain_policy,
                    action_policy,
                    confirmation_policy,
                },
                PathBuf::from(path),
            )?;
        }
        LocalCommand::StateLoad {
            target,
            json,
            ignored_global_flags,
            domain_policy,
            action_policy,
            confirmation_policy,
            path,
            policy_flag,
        } => {
            handle_state_load(
                target,
                json,
                ignored_global_flags,
                PolicyArgsBundle {
                    domain_policy,
                    action_policy,
                    confirmation_policy,
                },
                PathBuf::from(path),
                policy_flag,
            )?;
        }
        LocalCommand::StateInspect {
            json,
            ignored_global_flags,
            path,
            record,
        } => {
            handle_state_inspect(json, ignored_global_flags, PathBuf::from(path), record)?;
        }
        LocalCommand::Launch {
            profile,
            url,
            firefox_path,
            domain_policy,
            action_policy,
            confirmation_policy,
        } => {
            let domain_decision = resolve_domain_policy_or_exit(&domain_policy, false, &[])?;
            if let Some(url) = &url {
                ensure_url_allowed(&domain_decision, url)?;
            }
            let action_decision = resolve_action_policy_or_exit(&action_policy, false, &[])?;
            if url.is_some() {
                ensure_action_allowed(&action_decision, &launch_args_for_action_policy(&url))?;
            }
            let confirmation_decision =
                resolve_confirmation_policy_or_exit(&confirmation_policy, false, &[])?;
            if url.is_some() {
                require_confirmation_or_exit(
                    &launch_args_for_confirmation(&profile, &url, &firefox_path),
                    ConfirmationGate {
                        confirmation_decision: &confirmation_decision,
                        target: PendingConfirmationTarget::Default,
                        domain_decision: &domain_decision,
                        action_decision: &action_decision,
                        json_output: false,
                        ignored_global_flags: &[],
                    },
                )?;
            }
            let result = launch_firefox(LaunchOptions {
                profile,
                url,
                firefox_path,
            })?;
            let mut text = launch_result_text(&result);
            for warning in &domain_decision.warnings {
                text.push_str(&format!(
                    "\nWarning [{}]: {}",
                    warning.code, warning.message
                ));
            }
            println!("{text}");
        }
        LocalCommand::InstallStatus {
            json,
            domain_policy,
            action_policy,
            confirmation_policy,
        } => {
            let mut report = collect_install_status()?;
            report.domain_policy = domain_policy_diagnostic_from_args(&domain_policy);
            report.action_policy = action_policy_diagnostic_from_args(&action_policy);
            report.confirmation_policy =
                confirmation_policy_diagnostic_from_args(&confirmation_policy);
            if json {
                let value: serde_json::Value =
                    serde_json::from_str(&install_status_json(&report)?)?;
                println!("{}", format_cli_result(&value, true)?);
            } else {
                println!("{}", install_status_text(&report));
            }
        }
        LocalCommand::DoctorFix { json } => {
            let message =
                "`doctor --fix` is not implemented yet; run `pire-browser setup --windows` or rebuild the extension manually based on doctor output.";
            let result = not_available_result("doctor --fix", message, json, &[])?;
            println!("{result}");
            std::process::exit(exit_code_for_error("NotAvailableError"));
        }
        LocalCommand::Confirm { id, json } => {
            handle_confirm(id, json)?;
        }
        LocalCommand::Deny { id, json } => {
            handle_deny(id, json)?;
        }
        LocalCommand::Remote {
            target,
            json,
            ignored_global_flags,
            domain_policy,
            action_policy,
            confirmation_policy,
            args,
        } => {
            if let Some(result) = local_not_available_result(&args, json, &ignored_global_flags)? {
                println!("{result}");
                std::process::exit(exit_code_for_error("NotAvailableError"));
            }
            if let Some(result) =
                local_unsupported_command_result(&args, json, &ignored_global_flags)?
            {
                if json {
                    println!("{result}");
                } else {
                    eprintln!("{result}");
                }
                std::process::exit(exit_code_for_error("unsupported_command"));
            }
            let domain_decision =
                resolve_domain_policy_or_exit(&domain_policy, json, &ignored_global_flags)?;
            if let Some(url) = navigation_url_for_remote_args(&args) {
                if let Err(err) = ensure_url_allowed(&domain_decision, &url) {
                    exit_with_anyhow_error_with_domain_policy(
                        err,
                        json,
                        &ignored_global_flags,
                        &domain_decision.warnings,
                    )?;
                    unreachable!();
                }
            }
            let action_decision =
                resolve_action_policy_or_exit(&action_policy, json, &ignored_global_flags)?;
            if let Err(err) = ensure_policy_sequences_allowed(&action_decision, &args) {
                exit_with_anyhow_error(err, json, &ignored_global_flags)?;
                unreachable!();
            }
            let confirmation_decision = resolve_confirmation_policy_or_exit(
                &confirmation_policy,
                json,
                &ignored_global_flags,
            )?;
            let interactively_approved = match require_confirmation_for_sequences_or_exit(
                &args,
                ConfirmationGate {
                    confirmation_decision: &confirmation_decision,
                    target: pending_target_from_session_target(&target),
                    domain_decision: &domain_decision,
                    action_decision: &action_decision,
                    json_output: json,
                    ignored_global_flags: &ignored_global_flags,
                },
            ) {
                Ok(interactively_approved) => interactively_approved,
                Err(err) => {
                    exit_with_anyhow_error(err, json, &ignored_global_flags)?;
                    unreachable!();
                }
            };
            let request = build_command_request_with_policies(
                args.clone(),
                &domain_decision,
                &action_decision,
                &confirmation_decision,
                interactively_approved,
            )?;
            let dispatch_result = match target {
                SessionTarget::Id(session_id) => send_to_session(Some(&session_id), &request),
                SessionTarget::Name(profile_name) => {
                    send_to_named_session(&profile_name, &args, &request, &domain_decision)
                }
                SessionTarget::Default => match send_to_session(None, &request) {
                    Ok(result) => Ok(result),
                    Err(err) if should_auto_launch_remote(None, &args, &err) => {
                        cleanup_stale_sessions(now_ms())?;
                        if let Some(url) = launch_url_for_remote_args(&args) {
                            if let Err(err) = ensure_url_allowed(&domain_decision, &url) {
                                exit_with_anyhow_error_with_domain_policy(
                                    err,
                                    json,
                                    &ignored_global_flags,
                                    &domain_decision.warnings,
                                )?;
                                unreachable!();
                            }
                        }
                        let _result = match launch_firefox(LaunchOptions {
                            profile: "Default".to_string(),
                            url: launch_url_for_remote_args(&args),
                            firefox_path: None,
                        }) {
                            Ok(result) => result,
                            Err(err) => {
                                exit_with_anyhow_error_with_domain_policy(
                                    err,
                                    json,
                                    &ignored_global_flags,
                                    &domain_decision.warnings,
                                )?;
                                unreachable!();
                            }
                        };
                        match send_to_session(None, &request) {
                            Ok(result) => Ok(result),
                            Err(err) => {
                                exit_with_anyhow_error_with_domain_policy(
                                    err,
                                    json,
                                    &ignored_global_flags,
                                    &domain_decision.warnings,
                                )?;
                                unreachable!();
                            }
                        }
                    }
                    Err(err) => {
                        exit_with_anyhow_error_with_domain_policy(
                            err,
                            json,
                            &ignored_global_flags,
                            &domain_decision.warnings,
                        )?;
                        unreachable!();
                    }
                },
            };
            let (response, response_session_id) = match dispatch_result {
                Ok(result) => result,
                Err(err) => {
                    exit_with_anyhow_error_with_domain_policy(
                        err,
                        json,
                        &ignored_global_flags,
                        &domain_decision.warnings,
                    )?;
                    unreachable!();
                }
            };
            if !response.ok {
                let error = response
                    .error
                    .unwrap_or(pire_browser_core::protocol::RpcError {
                        code: "unknown_error".into(),
                        message: "unknown extension error".into(),
                        data: None,
                    });
                if json {
                    let exit_code = exit_code_for_error(&error.code);
                    print_json_error_with_domain_policy(
                        &error,
                        &ignored_global_flags,
                        &domain_decision.warnings,
                    )?;
                    std::process::exit(exit_code);
                }
                let mut err = plain_error_message(&error);
                for warning in &domain_decision.warnings {
                    err.push_str(&format!(
                        "\nWarning [{}]: {}",
                        warning.code, warning.message
                    ));
                }
                eprintln!("{err}");
                std::process::exit(exit_code_for_error(&error.code));
            }
            let mut result = response.result.unwrap_or_else(|| json!({ "text": "ok" }));
            append_domain_policy_warnings(&mut result, &domain_decision.warnings, !json)?;
            append_ignored_global_flag_warnings(&mut result, &ignored_global_flags);
            println!("{}", format_cli_result(&result, json)?);
            if is_controlled_close_command(&args) {
                let _ = remove_session(&response_session_id);
                let _ = io::stdout().flush();
                thread::sleep(Duration::from_millis(1000));
            }
        }
    }
    Ok(())
}

fn exit_with_anyhow_error(
    err: anyhow::Error,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<()> {
    exit_with_anyhow_error_with_policy(err, json_output, ignored_global_flags, &[])
}

fn exit_with_anyhow_error_with_policy(
    err: anyhow::Error,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
    policy_warnings: &[StatePolicyWarning],
) -> Result<()> {
    let warning_values = warning_values(policy_warnings, &[])?;
    exit_with_anyhow_error_with_warning_values(
        err,
        json_output,
        ignored_global_flags,
        &warning_values,
    )
}

fn exit_with_anyhow_error_with_domain_policy(
    err: anyhow::Error,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
    policy_warnings: &[DomainPolicyWarning],
) -> Result<()> {
    let warning_values = warning_values(&[], policy_warnings)?;
    exit_with_anyhow_error_with_warning_values(
        err,
        json_output,
        ignored_global_flags,
        &warning_values,
    )
}

fn exit_with_anyhow_error_with_warning_values(
    err: anyhow::Error,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
    warning_values: &[Value],
) -> Result<()> {
    if json_output {
        let error = rpc_error_from_anyhow(&err);
        print_json_error_with_warning_values(&error, ignored_global_flags, warning_values)?;
        std::process::exit(exit_code_for_error(&error.code));
    }
    if !warning_values.is_empty() {
        let mut message = format!("{err:#}");
        for warning in warning_values {
            message.push_str(&format!(
                "\nWarning [{}]: {}",
                warning
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("POLICY_WARNING"),
                warning.get("message").and_then(Value::as_str).unwrap_or("")
            ));
        }
        return Err(anyhow::anyhow!(message));
    }
    Err(err)
}

fn handle_state_save(
    target: SessionTarget,
    json_output: bool,
    ignored_global_flags: Vec<GlobalFlagWarning>,
    policies: PolicyArgsBundle,
    path: PathBuf,
) -> Result<()> {
    let domain_decision =
        resolve_domain_policy_or_exit(&policies.domain_policy, json_output, &ignored_global_flags)?;
    let action_decision =
        resolve_action_policy_or_exit(&policies.action_policy, json_output, &ignored_global_flags)?;
    if let Err(err) = ensure_action_allowed(
        &action_decision,
        &[
            "state".to_string(),
            "save".to_string(),
            path.display().to_string(),
        ],
    ) {
        exit_with_anyhow_error(err, json_output, &ignored_global_flags)?;
        unreachable!();
    }
    let confirmation_decision = resolve_confirmation_policy_or_exit(
        &policies.confirmation_policy,
        json_output,
        &ignored_global_flags,
    )?;
    require_confirmation_or_exit(
        &[
            "state".to_string(),
            "save".to_string(),
            path.display().to_string(),
        ],
        ConfirmationGate {
            confirmation_decision: &confirmation_decision,
            target: pending_target_from_session_target(&target),
            domain_decision: &domain_decision,
            action_decision: &action_decision,
            json_output,
            ignored_global_flags: &ignored_global_flags,
        },
    )?;
    let request = build_command_request_with_domain_policy(
        vec!["state".to_string(), "export".to_string()],
        &domain_decision,
    )?;
    let (response, session_id) = match send_state_save_request(&target, &request) {
        Ok(result) => result,
        Err(err) => {
            exit_with_anyhow_error_with_domain_policy(
                err,
                json_output,
                &ignored_global_flags,
                &domain_decision.warnings,
            )?;
            unreachable!();
        }
    };
    let export = response_result_or_exit_with_domain_policy(
        response,
        json_output,
        &ignored_global_flags,
        &domain_decision.warnings,
    )?;
    let profile_name = match profile_name_for_state_source(&target, &session_id) {
        Ok(profile_name) => profile_name,
        Err(err) => {
            exit_with_anyhow_error_with_domain_policy(
                err,
                json_output,
                &ignored_global_flags,
                &domain_decision.warnings,
            )?;
            unreachable!();
        }
    };
    let state = match state_from_extension_export(export, session_id, profile_name) {
        Ok(state) => state,
        Err(err) => {
            exit_with_anyhow_error_with_domain_policy(
                err,
                json_output,
                &ignored_global_flags,
                &domain_decision.warnings,
            )?;
            unreachable!();
        }
    };
    let bytes_written = match write_state_file(&path, &state) {
        Ok(bytes_written) => bytes_written,
        Err(err) => {
            exit_with_anyhow_error_with_domain_policy(
                err,
                json_output,
                &ignored_global_flags,
                &domain_decision.warnings,
            )?;
            unreachable!();
        }
    };
    let mut value = state_save_value(&state, &path, bytes_written);
    append_state_save_path_warning(&mut value, &path);
    append_domain_policy_warnings(&mut value, &domain_decision.warnings, !json_output)?;
    append_ignored_global_flag_warnings(&mut value, &ignored_global_flags);
    println!("{}", format_cli_result(&value, json_output)?);
    Ok(())
}

fn handle_state_load(
    target: SessionTarget,
    json_output: bool,
    ignored_global_flags: Vec<GlobalFlagWarning>,
    policies: PolicyArgsBundle,
    path: PathBuf,
    policy_flag: StateLoadPolicyFlag,
) -> Result<()> {
    let policy_decision = match resolve_state_load_policy(policy_flag) {
        Ok(decision) => decision,
        Err(err) => {
            exit_with_anyhow_error(err, json_output, &ignored_global_flags)?;
            unreachable!();
        }
    };
    let domain_decision =
        resolve_domain_policy_or_exit(&policies.domain_policy, json_output, &ignored_global_flags)?;
    let action_decision =
        resolve_action_policy_or_exit(&policies.action_policy, json_output, &ignored_global_flags)?;
    let combined_policy_warnings =
        warning_values(&policy_decision.warnings, &domain_decision.warnings)?;
    let read = match read_state_file_with_metadata(&path) {
        Ok(read) => read,
        Err(err) => {
            exit_with_anyhow_error_with_warning_values(
                err,
                json_output,
                &ignored_global_flags,
                &combined_policy_warnings,
            )?;
            unreachable!();
        }
    };
    if let Err(err) = ensure_url_allowed(&domain_decision, &read.state.source.origin) {
        exit_with_anyhow_error_with_domain_policy(
            err,
            json_output,
            &ignored_global_flags,
            &domain_decision.warnings,
        )?;
        unreachable!();
    }
    if let Err(err) = ensure_action_allowed(
        &action_decision,
        &[
            "state".to_string(),
            "load".to_string(),
            path.display().to_string(),
        ],
    ) {
        exit_with_anyhow_error_with_warning_values(
            err,
            json_output,
            &ignored_global_flags,
            &combined_policy_warnings,
        )?;
        unreachable!();
    }
    let confirmation_decision = resolve_confirmation_policy_or_exit(
        &policies.confirmation_policy,
        json_output,
        &ignored_global_flags,
    )?;
    require_confirmation_or_exit(
        &[
            "state".to_string(),
            "load".to_string(),
            path.display().to_string(),
        ],
        ConfirmationGate {
            confirmation_decision: &confirmation_decision,
            target: pending_target_from_session_target(&target),
            domain_decision: &domain_decision,
            action_decision: &action_decision,
            json_output,
            ignored_global_flags: &ignored_global_flags,
        },
    )?;
    let tool_version_mismatch = if policy_decision.require_inspected {
        if let Err(err) = sweep_expired_state_receipts(now_ms()) {
            exit_with_anyhow_error_with_warning_values(
                err,
                json_output,
                &ignored_global_flags,
                &combined_policy_warnings,
            )?;
            unreachable!();
        }
        match validate_state_inspection_receipt(&read, now_ms(), CLI_VERSION) {
            Ok(validation) => validation.tool_version_mismatch,
            Err(err) => {
                exit_with_anyhow_error_with_warning_values(
                    err,
                    json_output,
                    &ignored_global_flags,
                    &combined_policy_warnings,
                )?;
                unreachable!();
            }
        }
    } else {
        None
    };
    let state = read.state.clone();
    let payload = serde_json::to_string(&state)?;
    let request = build_command_request_with_domain_policy(
        vec!["state".to_string(), "import".to_string(), payload],
        &domain_decision,
    )?;
    let (response, _session_id) = match send_state_load_request(&target, &state, &request) {
        Ok(result) => result,
        Err(err) => {
            exit_with_anyhow_error_with_warning_values(
                err,
                json_output,
                &ignored_global_flags,
                &combined_policy_warnings,
            )?;
            unreachable!();
        }
    };
    let import_result = response_result_or_exit_with_warning_values(
        response,
        json_output,
        &ignored_global_flags,
        &combined_policy_warnings,
    )?;
    let mut value = state_load_value(&state, &path, &import_result);
    append_state_policy_diagnostic(&mut value, &policy_decision)?;
    append_state_policy_warnings(&mut value, &policy_decision.warnings, !json_output)?;
    append_domain_policy_warnings(&mut value, &domain_decision.warnings, !json_output)?;
    if let Some(receipt_version) = tool_version_mismatch {
        append_warning_value(
            &mut value,
            json!({
                "code": "STATE_INSPECTION_TOOL_VERSION_CHANGED",
                "feature": "state load",
                "message": format!("State inspection receipt was recorded by pire-browser {receipt_version}; continuing because the state file identity still matches."),
            }),
        );
    }
    append_ignored_global_flag_warnings(&mut value, &ignored_global_flags);
    println!("{}", format_cli_result(&value, json_output)?);
    Ok(())
}

fn handle_state_inspect(
    json_output: bool,
    ignored_global_flags: Vec<GlobalFlagWarning>,
    path: PathBuf,
    record: bool,
) -> Result<()> {
    let read = match read_state_file_with_metadata(&path) {
        Ok(read) => read,
        Err(err) => {
            exit_with_anyhow_error(err, json_output, &ignored_global_flags)?;
            unreachable!();
        }
    };
    let mut value = state_inspect_value(&read.state, &path, read.bytes, !json_output);
    if record {
        if let Err(err) = sweep_expired_state_receipts(now_ms()) {
            exit_with_anyhow_error(err, json_output, &ignored_global_flags)?;
            unreachable!();
        }
        let (receipt, receipt_path) =
            match write_state_inspection_receipt(&read, now_ms(), CLI_VERSION) {
                Ok(result) => result,
                Err(err) => {
                    exit_with_anyhow_error(err, json_output, &ignored_global_flags)?;
                    unreachable!();
                }
            };
        append_state_receipt_info(&mut value, &receipt, &receipt_path);
    }
    append_ignored_global_flag_warnings(&mut value, &ignored_global_flags);
    println!("{}", format_cli_result(&value, json_output)?);
    Ok(())
}

fn handle_confirm(id: String, json_output: bool) -> Result<()> {
    let now = now_ms();
    let _ = sweep_expired_confirmations(now);
    let record = match consume_pending_confirmation(&id, now) {
        Ok(record) => record,
        Err(err) => {
            exit_with_anyhow_error(err, json_output, &[])?;
            unreachable!();
        }
    };
    execute_confirmed_record(record, json_output)
}

fn handle_deny(id: String, json_output: bool) -> Result<()> {
    let now = now_ms();
    let _ = sweep_expired_confirmations(now);
    let record = match deny_pending_confirmation(&id, now) {
        Ok(record) => record,
        Err(err) => {
            exit_with_anyhow_error(err, json_output, &[])?;
            unreachable!();
        }
    };
    let value = json!({
        "text": format!("Denied confirmation {} for action category `{}`", record.id, record.category),
        "confirmationId": record.id,
        "category": record.category,
        "denied": true
    });
    println!("{}", format_cli_result(&value, json_output)?);
    Ok(())
}

fn execute_confirmed_record(record: PendingConfirmation, json_output: bool) -> Result<()> {
    let domain_decision = domain_decision_from_request_context(record.domain_policy.as_ref())?;
    let action_decision = action_decision_from_request_context(record.action_policy.as_ref())?;
    let _confirmation_decision =
        confirmation_decision_from_context(record.confirmation_policy.as_ref());
    ensure_policy_sequences_allowed(&action_decision, &record.args)?;
    if let Some(url) = navigation_url_for_remote_args(&record.args) {
        ensure_url_allowed(&domain_decision, &url)?;
    }
    let target = session_target_from_pending(&record.target);
    match record.args.first().map(String::as_str) {
        Some("launch") => execute_confirmed_launch(&record, &domain_decision, &action_decision),
        Some("state") if record.args.get(1).map(String::as_str) == Some("save") => {
            let path = confirmed_state_path(&record)?;
            execute_confirmed_state_save(
                target,
                json_output,
                domain_decision,
                action_decision,
                path,
            )
        }
        Some("state") if record.args.get(1).map(String::as_str) == Some("load") => {
            let path = confirmed_state_path(&record)?;
            execute_confirmed_state_load(
                target,
                json_output,
                domain_decision,
                action_decision,
                path,
            )
        }
        _ => execute_confirmed_remote(
            record,
            target,
            domain_decision,
            action_decision,
            json_output,
        ),
    }
}

fn confirmed_state_path(record: &PendingConfirmation) -> Result<PathBuf> {
    let Some(path) = record.args.get(2) else {
        bail!("invalid_args: pending confirmation record is missing state path");
    };
    Ok(PathBuf::from(path))
}

fn execute_confirmed_launch(
    record: &PendingConfirmation,
    domain_decision: &DomainPolicyDecision,
    action_decision: &ActionPolicyDecision,
) -> Result<()> {
    ensure_action_allowed(action_decision, &record.args)?;
    let mut profile = "Default".to_string();
    let mut url = None;
    let mut firefox_path = None;
    let mut i = 1;
    while i < record.args.len() {
        match record.args[i].as_str() {
            "--profile" => {
                i += 1;
                profile = record
                    .args
                    .get(i)
                    .cloned()
                    .context("invalid_args: --profile requires a value")?;
            }
            "--url" => {
                i += 1;
                let value = record
                    .args
                    .get(i)
                    .cloned()
                    .context("invalid_args: --url requires a value")?;
                ensure_url_allowed(domain_decision, &value)?;
                url = Some(value);
            }
            "--firefox-path" => {
                i += 1;
                firefox_path = Some(
                    record
                        .args
                        .get(i)
                        .cloned()
                        .context("invalid_args: --firefox-path requires a value")?,
                );
            }
            other => bail!("unsupported launch option in confirmation record: {other}"),
        }
        i += 1;
    }
    let result = launch_firefox(LaunchOptions {
        profile,
        url,
        firefox_path,
    })?;
    println!("{}", launch_result_text(&result));
    Ok(())
}

fn execute_confirmed_remote(
    record: PendingConfirmation,
    target: SessionTarget,
    domain_decision: DomainPolicyDecision,
    action_decision: ActionPolicyDecision,
    json_output: bool,
) -> Result<()> {
    let request = build_command_request_with_captured_policies(
        record.args.clone(),
        record.domain_policy.clone(),
        record.action_policy.clone(),
        request_context_with_approval(&record),
    )?;
    let dispatch_result = match target {
        SessionTarget::Id(session_id) => send_to_session(Some(&session_id), &request),
        SessionTarget::Name(profile_name) => {
            send_to_named_session(&profile_name, &record.args, &request, &domain_decision)
        }
        SessionTarget::Default => match send_to_session(None, &request) {
            Ok(result) => Ok(result),
            Err(err) if should_auto_launch_remote(None, &record.args, &err) => {
                cleanup_stale_sessions(now_ms())?;
                let _result = launch_firefox(LaunchOptions {
                    profile: "Default".to_string(),
                    url: launch_url_for_remote_args(&record.args),
                    firefox_path: None,
                })?;
                send_to_session(None, &request)
            }
            Err(err) => Err(err),
        },
    };
    let (response, response_session_id) = dispatch_result?;
    let result = response_result_or_exit_with_domain_policy(
        response,
        json_output,
        &[],
        &domain_decision.warnings,
    )?;
    let mut result = result;
    append_domain_policy_warnings(&mut result, &domain_decision.warnings, !json_output)?;
    println!("{}", format_cli_result(&result, json_output)?);
    if is_controlled_close_command(&record.args) {
        let _ = remove_session(&response_session_id);
        let _ = io::stdout().flush();
        thread::sleep(Duration::from_millis(1000));
    }
    let _ = action_decision;
    Ok(())
}

fn execute_confirmed_state_save(
    target: SessionTarget,
    json_output: bool,
    domain_decision: DomainPolicyDecision,
    _action_decision: ActionPolicyDecision,
    path: PathBuf,
) -> Result<()> {
    let request = build_command_request_with_domain_policy(
        vec!["state".to_string(), "export".to_string()],
        &domain_decision,
    )?;
    let (response, session_id) = send_state_save_request(&target, &request)?;
    let export = response_result_or_exit_with_domain_policy(
        response,
        json_output,
        &[],
        &domain_decision.warnings,
    )?;
    let profile_name = profile_name_for_state_source(&target, &session_id)?;
    let state = state_from_extension_export(export, session_id, profile_name)?;
    let bytes_written = write_state_file(&path, &state)?;
    let mut value = state_save_value(&state, &path, bytes_written);
    append_state_save_path_warning(&mut value, &path);
    append_domain_policy_warnings(&mut value, &domain_decision.warnings, !json_output)?;
    println!("{}", format_cli_result(&value, json_output)?);
    Ok(())
}

fn execute_confirmed_state_load(
    target: SessionTarget,
    json_output: bool,
    domain_decision: DomainPolicyDecision,
    _action_decision: ActionPolicyDecision,
    path: PathBuf,
) -> Result<()> {
    let read = read_state_file_with_metadata(&path)?;
    ensure_url_allowed(&domain_decision, &read.state.source.origin)?;
    let state = read.state.clone();
    let payload = serde_json::to_string(&state)?;
    let request = build_command_request_with_domain_policy(
        vec!["state".to_string(), "import".to_string(), payload],
        &domain_decision,
    )?;
    let (response, _session_id) = send_state_load_request(&target, &state, &request)?;
    let import_result = response_result_or_exit_with_domain_policy(
        response,
        json_output,
        &[],
        &domain_decision.warnings,
    )?;
    let mut value = state_load_value(&state, &path, &import_result);
    append_domain_policy_warnings(&mut value, &domain_decision.warnings, !json_output)?;
    println!("{}", format_cli_result(&value, json_output)?);
    Ok(())
}

fn send_state_save_request(
    target: &SessionTarget,
    request: &RpcRequest,
) -> Result<(RpcResponse, String)> {
    match target {
        SessionTarget::Id(session_id) => send_to_session(Some(session_id), request),
        SessionTarget::Name(profile_name) => {
            validate_profile_name(profile_name)?;
            cleanup_stale_sessions(now_ms())?;
            let Some(session) = live_session_for_profile_name(profile_name)? else {
                bail!(
                    "session_not_found: state save requires a live pire-browser session for profile name `{profile_name}`. Run `pire-browser --session-name {profile_name} open <url>` first."
                );
            };
            send_to_session(Some(&session.session_id), request)
        }
        SessionTarget::Default => send_to_session(None, request),
    }
}

fn send_state_load_request(
    target: &SessionTarget,
    state: &ActiveOriginStateFile,
    request: &RpcRequest,
) -> Result<(RpcResponse, String)> {
    match target {
        SessionTarget::Id(session_id) => send_to_session(Some(session_id), request),
        SessionTarget::Name(profile_name) => {
            validate_profile_name(profile_name)?;
            cleanup_stale_sessions(now_ms())?;
            if let Some(session) = live_session_for_profile_name(profile_name)? {
                return send_to_session(Some(&session.session_id), request);
            }
            let session_id = launch_state_target(
                profile_name,
                &display_url_without_query_or_fragment(&state.source.url),
            )?;
            send_to_session(Some(&session_id), request)
        }
        SessionTarget::Default => match send_to_session(None, request) {
            Ok(result) => Ok(result),
            Err(err) if is_auto_launchable_session_error(&err) => {
                cleanup_stale_sessions(now_ms())?;
                let session_id = launch_state_target(
                    "Default",
                    &display_url_without_query_or_fragment(&state.source.url),
                )?;
                send_to_session(Some(&session_id), request)
            }
            Err(err) => Err(err),
        },
    }
}

fn launch_state_target(profile: &str, url: &str) -> Result<String> {
    let result = launch_firefox(LaunchOptions {
        profile: profile.to_string(),
        url: Some(url.to_string()),
        firefox_path: None,
    })?;
    let session_id = result.session.session_id;
    let open_request = build_command_request(vec!["open".to_string(), url.to_string()]);
    let (open_response, _) = send_to_session(Some(&session_id), &open_request)?;
    if !open_response.ok {
        let error = open_response
            .error
            .map(|err| format!("{}: {}", err.code, err.message))
            .unwrap_or_else(|| "unknown open failure".to_string());
        bail!("browser_launch_failed: failed to open saved state URL before load: {error}");
    }
    Ok(session_id)
}

fn response_result_or_exit_with_domain_policy(
    response: RpcResponse,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
    policy_warnings: &[DomainPolicyWarning],
) -> Result<Value> {
    if !response.ok {
        let error = response
            .error
            .unwrap_or(pire_browser_core::protocol::RpcError {
                code: "unknown_error".into(),
                message: "unknown extension error".into(),
                data: None,
            });
        if json_output {
            let exit_code = exit_code_for_error(&error.code);
            print_json_error_with_domain_policy(&error, ignored_global_flags, policy_warnings)?;
            std::process::exit(exit_code);
        }
        let mut err = plain_error_message(&error);
        for warning in policy_warnings {
            err.push_str(&format!(
                "\nWarning [{}]: {}",
                warning.code, warning.message
            ));
        }
        eprintln!("{err}");
        std::process::exit(exit_code_for_error(&error.code));
    }
    Ok(response.result.unwrap_or_else(|| json!({ "text": "ok" })))
}

fn response_result_or_exit_with_warning_values(
    response: RpcResponse,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
    warning_values: &[Value],
) -> Result<Value> {
    if !response.ok {
        let error = response
            .error
            .unwrap_or(pire_browser_core::protocol::RpcError {
                code: "unknown_error".into(),
                message: "unknown extension error".into(),
                data: None,
            });
        if json_output {
            let exit_code = exit_code_for_error(&error.code);
            print_json_error_with_warning_values(&error, ignored_global_flags, warning_values)?;
            std::process::exit(exit_code);
        }
        let mut err = plain_error_message(&error);
        for warning in warning_values {
            err.push_str(&format!(
                "\nWarning [{}]: {}",
                warning
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("POLICY_WARNING"),
                warning.get("message").and_then(Value::as_str).unwrap_or("")
            ));
        }
        eprintln!("{err}");
        std::process::exit(exit_code_for_error(&error.code));
    }
    Ok(response.result.unwrap_or_else(|| json!({ "text": "ok" })))
}

fn profile_name_for_state_source(
    target: &SessionTarget,
    session_id: &str,
) -> Result<Option<String>> {
    if let SessionTarget::Name(profile_name) = target {
        return Ok(Some(profile_name.clone()));
    }
    let mut sessions = list_sessions()?;
    annotate_session_profile_names(&mut sessions)?;
    Ok(sessions
        .into_iter()
        .find(|session| session.session_id == session_id)
        .and_then(|session| session.profile_name))
}

fn resolve_domain_policy_or_exit(
    args: &DomainPolicyArgs,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<DomainPolicyDecision> {
    match resolve_domain_policy(args) {
        Ok(decision) => Ok(decision),
        Err(err) => {
            exit_with_anyhow_error(err, json_output, ignored_global_flags)?;
            unreachable!();
        }
    }
}

fn resolve_action_policy_or_exit(
    args: &ActionPolicyArgs,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<ActionPolicyDecision> {
    match resolve_action_policy(args) {
        Ok(decision) => Ok(decision),
        Err(err) => {
            exit_with_anyhow_error(err, json_output, ignored_global_flags)?;
            unreachable!();
        }
    }
}

fn resolve_confirmation_policy_or_exit(
    args: &ConfirmationPolicyArgs,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<ConfirmationPolicyDecision> {
    match resolve_confirmation_policy(args) {
        Ok(decision) => Ok(decision),
        Err(err) => {
            exit_with_anyhow_error(err, json_output, ignored_global_flags)?;
            unreachable!();
        }
    }
}

fn build_command_request_with_domain_policy(
    args: Vec<String>,
    decision: &DomainPolicyDecision,
) -> Result<RpcRequest> {
    let mut request = build_command_request(args);
    if let Some(context) = domain_policy_request_context(decision) {
        if let Some(object) = request.params.as_object_mut() {
            object.insert("domainPolicy".to_string(), serde_json::to_value(context)?);
        }
    }
    Ok(request)
}

fn build_command_request_with_policies(
    args: Vec<String>,
    domain_decision: &DomainPolicyDecision,
    action_decision: &ActionPolicyDecision,
    confirmation_decision: &ConfirmationPolicyDecision,
    interactively_approved: bool,
) -> Result<RpcRequest> {
    let mut request = build_command_request_with_domain_policy(args, domain_decision)?;
    if let Some(context) = action_policy_request_context(action_decision) {
        if let Some(object) = request.params.as_object_mut() {
            object.insert("actionPolicy".to_string(), serde_json::to_value(context)?);
        }
    }
    let confirmation_context = if interactively_approved {
        request_context_with_approval_id(
            confirmation_decision,
            INTERACTIVE_CONFIRMATION_APPROVAL_ID,
        )
    } else {
        confirmation_policy_request_context(confirmation_decision)
    };
    if let Some(context) = confirmation_context {
        if let Some(object) = request.params.as_object_mut() {
            object.insert(
                "confirmationPolicy".to_string(),
                serde_json::to_value(context)?,
            );
        }
    }
    Ok(request)
}

fn build_command_request_with_captured_policies(
    args: Vec<String>,
    domain_context: Option<pire_browser_core::domain_policy::DomainPolicyRequestContext>,
    action_context: Option<pire_browser_core::action_policy::ActionPolicyRequestContext>,
    confirmation_context: Option<
        pire_browser_core::confirmation_policy::ConfirmationPolicyRequestContext,
    >,
) -> Result<RpcRequest> {
    let mut request = build_command_request(args);
    if let Some(object) = request.params.as_object_mut() {
        if let Some(context) = domain_context {
            object.insert("domainPolicy".to_string(), serde_json::to_value(context)?);
        }
        if let Some(context) = action_context {
            object.insert("actionPolicy".to_string(), serde_json::to_value(context)?);
        }
        if let Some(context) = confirmation_context {
            object.insert(
                "confirmationPolicy".to_string(),
                serde_json::to_value(context)?,
            );
        }
    }
    Ok(request)
}

fn ensure_policy_sequences_allowed(
    action_decision: &ActionPolicyDecision,
    args: &[String],
) -> Result<()> {
    for sequence in policy_command_sequences(args)? {
        ensure_action_allowed(action_decision, &sequence)?;
    }
    Ok(())
}

fn require_confirmation_for_sequences_or_exit(
    args: &[String],
    gate: ConfirmationGate<'_>,
) -> Result<bool> {
    for sequence in policy_command_sequences(args)? {
        let evaluation = evaluate_action(gate.action_decision, &sequence);
        if let Some(category) = evaluation.category.as_deref() {
            if gate.confirmation_decision.requires(category) {
                return require_confirmation_for_category_or_exit(category, args, gate);
            }
        }
    }
    Ok(false)
}

fn require_confirmation_or_exit(args: &[String], gate: ConfirmationGate<'_>) -> Result<bool> {
    let evaluation = evaluate_action(gate.action_decision, args);
    let Some(category) = evaluation.category.as_deref() else {
        return Ok(false);
    };
    if !gate.confirmation_decision.requires(category) {
        return Ok(false);
    }
    require_confirmation_for_category_or_exit(category, args, gate)
}

fn require_confirmation_for_category_or_exit(
    category: &str,
    args: &[String],
    gate: ConfirmationGate<'_>,
) -> Result<bool> {
    if gate.confirmation_decision.interactive {
        if io::stdin().is_terminal() {
            eprint!("Confirm action category `{category}`? [y/N] ");
            let _ = io::stderr().flush();
            let mut input = String::new();
            io::stdin().read_line(&mut input)?;
            if matches!(input.trim().to_ascii_lowercase().as_str(), "y" | "yes") {
                return Ok(true);
            }
        }
        bail!("ConfirmationDenied: action category `{category}` was not approved");
    }

    let now = now_ms();
    let _ = sweep_expired_confirmations(now);
    let id = new_confirmation_id();
    let record = PendingConfirmation {
        schema_version: 1,
        kind: "action-confirmation".to_string(),
        id: id.clone(),
        created_at: now,
        expires_at: now + CONFIRMATION_TTL_MS,
        category: category.to_string(),
        command_root: args.first().cloned().unwrap_or_default(),
        target: gate.target,
        args: args.to_vec(),
        domain_policy: domain_policy_request_context(gate.domain_decision),
        action_policy: action_policy_request_context(gate.action_decision),
        confirmation_policy: confirmation_policy_request_context(gate.confirmation_decision),
    };
    write_pending_confirmation(&record)?;
    print_confirmation_required(&record, gate.json_output, gate.ignored_global_flags)?;
    std::process::exit(CONFIRMATION_REQUIRED_EXIT_CODE);
}

fn print_confirmation_required(
    record: &PendingConfirmation,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<()> {
    let approve_command = format!("pire-browser confirm {}", record.id);
    let deny_command = format!("pire-browser deny {}", record.id);
    if json_output {
        let warnings = ignored_global_flag_warnings(ignored_global_flags);
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "success": false,
                "error": {
                    "code": "ConfirmationRequired",
                    "message": format!("Action category `{}` requires confirmation", record.category),
                    "data": {
                        "phase": "policy",
                        "confirmationId": record.id,
                        "category": record.category,
                        "expiresAt": record.expires_at,
                        "approveCommand": approve_command,
                        "denyCommand": deny_command
                    }
                },
                "warnings": warnings
            }))?
        );
    } else {
        println!(
            "ConfirmationRequired: action category `{}` requires approval\nconfirmationId: {}\nexpiresAt: {}\napprove: {}\ndeny: {}",
            record.category, record.id, record.expires_at, approve_command, deny_command
        );
    }
    Ok(())
}

fn pending_target_from_session_target(target: &SessionTarget) -> PendingConfirmationTarget {
    match target {
        SessionTarget::Default => PendingConfirmationTarget::Default,
        SessionTarget::Id(value) => PendingConfirmationTarget::SessionId {
            value: value.clone(),
        },
        SessionTarget::Name(value) => PendingConfirmationTarget::SessionName {
            value: value.clone(),
        },
    }
}

fn session_target_from_pending(target: &PendingConfirmationTarget) -> SessionTarget {
    match target {
        PendingConfirmationTarget::Default => SessionTarget::Default,
        PendingConfirmationTarget::SessionId { value } => SessionTarget::Id(value.clone()),
        PendingConfirmationTarget::SessionName { value } => SessionTarget::Name(value.clone()),
    }
}

fn launch_args_for_action_policy(url: &Option<String>) -> Vec<String> {
    let mut args = vec!["launch".to_string()];
    if let Some(url) = url {
        args.push("--url".to_string());
        args.push(url.clone());
    }
    args
}

fn launch_args_for_confirmation(
    profile: &str,
    url: &Option<String>,
    firefox_path: &Option<String>,
) -> Vec<String> {
    let mut args = vec![
        "launch".to_string(),
        "--profile".to_string(),
        profile.to_string(),
    ];
    if let Some(url) = url {
        args.push("--url".to_string());
        args.push(url.clone());
    }
    if let Some(firefox_path) = firefox_path {
        args.push("--firefox-path".to_string());
        args.push(firefox_path.clone());
    }
    args
}

fn state_save_value(state: &ActiveOriginStateFile, path: &Path, bytes_written: u64) -> Value {
    let display_url = display_url_without_query_or_fragment(&state.source.url);
    json!({
        "text": format!(
            "Saved active-origin state for {} ({}) to {} ({} cookie(s), {} localStorage key(s), {} sessionStorage key(s))",
            state.source.origin,
            display_url,
            path.display(),
            state.cookie_count(),
            state.local_storage_key_count(),
            state.session_storage_key_count()
        ),
        "path": path.display().to_string(),
        "origin": state.source.origin,
        "displayUrl": display_url,
        "cookies": state.cookie_count(),
        "localStorageKeys": state.local_storage_key_count(),
        "sessionStorageKeys": state.session_storage_key_count(),
        "bytesWritten": bytes_written
    })
}

fn state_load_value(state: &ActiveOriginStateFile, path: &Path, import_result: &Value) -> Value {
    let display_url = display_url_without_query_or_fragment(&state.source.url);
    let cookies_set = import_result
        .get("cookiesSet")
        .and_then(Value::as_u64)
        .unwrap_or(state.cookie_count() as u64);
    let reloaded = import_result
        .get("reloaded")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut value = json!({
        "text": format!(
            "Loaded active-origin state for {} ({}) from {} ({} cookie(s), {} localStorage key(s), {} sessionStorage key(s); reloaded={})",
            state.source.origin,
            display_url,
            path.display(),
            cookies_set,
            state.local_storage_key_count(),
            state.session_storage_key_count(),
            reloaded
        ),
        "path": path.display().to_string(),
        "origin": state.source.origin,
        "displayUrl": display_url,
        "cookiesSet": cookies_set,
        "localStorageKeys": state.local_storage_key_count(),
        "sessionStorageKeys": state.session_storage_key_count(),
        "reloaded": reloaded
    });
    if let Some(warnings) = import_result.get("warnings") {
        value["warnings"] = warnings.clone();
    }
    value
}

fn state_inspect_value(
    state: &ActiveOriginStateFile,
    path: &Path,
    bytes: u64,
    include_text: bool,
) -> Value {
    let display_url = display_url_without_query_or_fragment(&state.source.url);
    let mut source = json!({
        "origin": state.source.origin,
        "displayUrl": display_url,
    });
    if let Some(session_id) = &state.source.session_id {
        source["sessionId"] = json!(session_id);
    }
    if let Some(profile_name) = &state.source.profile_name {
        source["profileName"] = json!(profile_name);
    }

    let mut value = json!({
        "path": path.display().to_string(),
        "schemaVersion": state.schema_version,
        "kind": state.kind,
        "createdAt": state.created_at,
        "source": source,
        "counts": {
            "cookies": state.cookie_count(),
            "localStorageKeys": state.local_storage_key_count(),
            "sessionStorageKeys": state.session_storage_key_count(),
        },
        "bytes": bytes,
    });

    if include_text {
        value["text"] = json!(state_inspect_text(state, path, bytes, &display_url));
    }

    value
}

fn append_state_receipt_info(
    value: &mut Value,
    receipt: &StateInspectionReceipt,
    receipt_path: &Path,
) {
    if let Some(text) = value
        .get("text")
        .and_then(Value::as_str)
        .map(ToString::to_string)
    {
        let updated = format!(
            "{text}\nReceipt: recorded at {} until {}",
            receipt_path.display(),
            receipt.expires_at
        );
        value["text"] = json!(updated);
    }
    value["receipt"] = json!({
        "recorded": true,
        "path": receipt_path.display().to_string(),
        "expiresAt": receipt.expires_at,
    });
}

fn state_inspect_text(
    state: &ActiveOriginStateFile,
    path: &Path,
    bytes: u64,
    display_url: &str,
) -> String {
    let mut lines = vec![
        format!("State file: {}", path.display()),
        format!("Schema: {} {}", state.schema_version, state.kind),
        format!("Created: {}", state.created_at),
        format!("Origin: {}", state.source.origin),
        format!("URL: {display_url}"),
    ];
    if let Some(profile_name) = &state.source.profile_name {
        lines.push(format!("Profile: {profile_name}"));
    }
    if let Some(session_id) = &state.source.session_id {
        lines.push(format!("Session: {session_id}"));
    }
    lines.extend([
        format!("Size: {bytes} bytes"),
        format!(
            "Counts: {} cookie(s), {} localStorage key(s), {} sessionStorage key(s)",
            state.cookie_count(),
            state.local_storage_key_count(),
            state.session_storage_key_count()
        ),
        "Values: not shown by metadata-only inspect".to_string(),
    ]);
    lines.join("\n")
}

fn append_state_save_path_warning(result: &mut Value, path: &Path) {
    if state_path_is_in_recommended_dir(path) {
        return;
    }
    append_warning_value(
        result,
        json!({
            "code": "STATE_FILE_OUTSIDE_RECOMMENDED_DIR",
            "feature": "state save",
            "message": "State files contain cookies and Web Storage secrets. Prefer `.pire-state/<origin>-<purpose>.json`, which is gitignored by this project.",
        }),
    );
}

fn print_json_error_with_domain_policy(
    error: &pire_browser_core::protocol::RpcError,
    ignored_global_flags: &[GlobalFlagWarning],
    policy_warnings: &[DomainPolicyWarning],
) -> Result<()> {
    let policy_warnings = warning_values(&[], policy_warnings)?;
    print_json_error_with_warning_values(error, ignored_global_flags, &policy_warnings)
}

fn print_json_error_with_warning_values(
    error: &pire_browser_core::protocol::RpcError,
    ignored_global_flags: &[GlobalFlagWarning],
    warning_values: &[Value],
) -> Result<()> {
    let mut warnings = ignored_global_flag_warnings(ignored_global_flags);
    warnings.extend(warning_values.iter().cloned());
    let mut data = error.data.clone().unwrap_or(Value::Null);
    redact_json_value(&mut data);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "success": false,
            "error": {
                "code": error.code,
                "message": redact_text(&error.message),
                "data": data
            },
            "warnings": warnings
        }))?
    );
    Ok(())
}

fn rpc_error_from_anyhow(err: &anyhow::Error) -> pire_browser_core::protocol::RpcError {
    let message = format!("{err:#}");
    let (code, phase) = if message.contains("timed out waiting for pire-browser extension session")
        || message.contains("timed out waiting for Firefox extension response")
    {
        ("timeout", "connect")
    } else if message.contains("extension_disconnected")
        || message.contains("no live Firefox extension session found")
    {
        ("extension_disconnected", "session")
    } else if message.contains("session_not_found") {
        ("session_not_found", "session")
    } else if message.contains("invalid_args:") {
        ("invalid_args", "parse")
    } else if message.contains("DomainPolicyError:") {
        ("DomainPolicyError", "policy")
    } else if message.contains("ActionPolicyError:") {
        ("ActionPolicyError", "policy")
    } else if message.contains("ConfirmationRequired:") {
        ("ConfirmationRequired", "policy")
    } else if message.contains("ConfirmationDenied:") {
        ("ConfirmationDenied", "policy")
    } else if message.contains("ConfirmationExpired:") {
        ("ConfirmationExpired", "policy")
    } else if message.contains("confirmation_not_found:") {
        ("confirmation_not_found", "policy")
    } else if message.contains("web-ext exited before pire-browser connected")
        || message.contains("failed to start web-ext")
        || message.contains("could not discover Firefox")
    {
        ("browser_launch_failed", "launch")
    } else if message.contains("multiple_sessions") {
        ("multiple_sessions", "session")
    } else {
        ("command_failed", "runtime")
    };
    pire_browser_core::protocol::RpcError {
        code: code.to_string(),
        message: redact_text(&message),
        data: Some(json!({ "phase": phase })),
    }
}

fn local_not_available_result(
    args: &[String],
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<Option<String>> {
    let Some(command) = args.first().map(String::as_str) else {
        return Ok(None);
    };
    if !is_documented_not_available_command(command)? {
        return Ok(None);
    }
    let message = format!(
        "This documented agent-browser command is parsed by pire-browser but is not implemented on the Firefox WebExtension backend yet: {command}"
    );
    Ok(Some(not_available_result(
        command,
        &message,
        json_output,
        ignored_global_flags,
    )?))
}

fn not_available_result(
    feature: &str,
    message: &str,
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<String> {
    if json_output {
        let warnings = ignored_global_flag_warnings(ignored_global_flags);
        let message = redact_text(message);
        return Ok(serde_json::to_string_pretty(&json!({
            "success": false,
            "error": {
                "code": "NotAvailableError",
                "message": message,
                "data": {
                    "feature": feature,
                    "compatibility": "not_available"
                }
            },
            "warnings": warnings
        }))?);
    }
    Ok(format!("NotAvailableError: {}", redact_text(message)))
}

fn local_unsupported_command_result(
    args: &[String],
    json_output: bool,
    ignored_global_flags: &[GlobalFlagWarning],
) -> Result<Option<String>> {
    let Some(command) = args.first().map(String::as_str) else {
        return Ok(None);
    };
    if is_supported_remote_command(command) {
        return Ok(None);
    }
    let suggestions = command_suggestions(command);
    let suggestion_text = if suggestions.is_empty() {
        "Try `pire-browser help` for supported commands.".to_string()
    } else {
        format!(
            "Did you mean {}? Try `pire-browser help {}`.",
            suggestions
                .iter()
                .map(|suggestion| format!("`{suggestion}`"))
                .collect::<Vec<_>>()
                .join(" or "),
            suggestions[0]
        )
    };
    let redacted_command = redact_text(command);
    let message = redact_text(&format!(
        "Unsupported command: {command}. {suggestion_text}"
    ));
    if json_output {
        let warnings = ignored_global_flag_warnings(ignored_global_flags);
        return Ok(Some(serde_json::to_string_pretty(&json!({
            "success": false,
            "error": {
                "code": "unsupported_command",
                "message": message,
                "data": {
                    "command": redacted_command,
                    "suggestions": suggestions
                }
            },
            "warnings": warnings
        }))?));
    }
    Ok(Some(format!("unsupported_command: {message}")))
}

fn plain_error_message(error: &pire_browser_core::protocol::RpcError) -> String {
    let mut message = format!("{}: {}", error.code, error.message);
    if error.code == "invalid_args" && error.message == "target is required" {
        message.push_str(
            "\nHint: quote refs in PowerShell, for example `click '@e4'`; if the ref is stale, rerun `snapshot -i` or `find`.",
        );
    }
    redact_text(&message)
}

fn append_ignored_global_flag_warnings(
    result: &mut Value,
    ignored_global_flags: &[GlobalFlagWarning],
) {
    let warnings = ignored_global_flag_warnings(ignored_global_flags);
    for warning in warnings {
        append_warning_value(result, warning);
    }
}

fn append_state_policy_diagnostic(
    result: &mut Value,
    decision: &StateLoadPolicyDecision,
) -> Result<()> {
    result["statePolicy"] = serde_json::to_value(&decision.diagnostic)?;
    Ok(())
}

fn append_state_policy_warnings(
    result: &mut Value,
    warnings: &[StatePolicyWarning],
    include_text: bool,
) -> Result<()> {
    for warning in warnings {
        if include_text {
            append_warning_text(result, warning);
        }
        append_warning_value(result, serde_json::to_value(warning)?);
    }
    Ok(())
}

fn append_domain_policy_warnings(
    result: &mut Value,
    warnings: &[DomainPolicyWarning],
    include_text: bool,
) -> Result<()> {
    for warning in warnings {
        if include_text {
            append_warning_text_value(result, &warning.code, &warning.message);
        }
        append_warning_value(result, serde_json::to_value(warning)?);
    }
    Ok(())
}

fn append_warning_text(result: &mut Value, warning: &StatePolicyWarning) {
    append_warning_text_value(result, &warning.code, &warning.message)
}

fn append_warning_text_value(result: &mut Value, code: &str, message: &str) {
    let Some(text) = result
        .get("text")
        .and_then(Value::as_str)
        .map(ToString::to_string)
    else {
        return;
    };
    result["text"] = json!(format!("{text}\nWarning [{}]: {}", code, message));
}

fn append_warning_value(result: &mut Value, warning: Value) {
    if !result.is_object() {
        *result = json!({
            "text": result.to_string(),
            "warnings": [warning]
        });
        return;
    }
    let existing = result.get_mut("warnings").and_then(Value::as_array_mut);
    if let Some(existing) = existing {
        existing.push(warning);
    } else if let Some(object) = result.as_object_mut() {
        object.insert("warnings".to_string(), Value::Array(vec![warning]));
    }
}

fn ignored_global_flag_warnings(ignored_global_flags: &[GlobalFlagWarning]) -> Vec<Value> {
    ignored_global_flags
        .iter()
        .map(|warning| {
            json!({
                "code": "IGNORED_GLOBAL_FLAG",
                "feature": warning.flag,
                "message": redact_text(&format!("{} is accepted for agent-browser CLI compatibility but is not applied to the current Firefox WebExtension session.", warning.flag))
            })
        })
        .collect()
}

fn warning_values(
    state_warnings: &[StatePolicyWarning],
    domain_warnings: &[DomainPolicyWarning],
) -> Result<Vec<Value>> {
    let mut warnings = Vec::new();
    for warning in state_warnings {
        warnings.push(serde_json::to_value(warning)?);
    }
    for warning in domain_warnings {
        warnings.push(serde_json::to_value(warning)?);
    }
    Ok(warnings)
}

fn state_path_is_in_recommended_dir(path: &Path) -> bool {
    let Ok(current_dir) = std::env::current_dir() else {
        return false;
    };
    let full_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        current_dir.join(path)
    };
    full_path.starts_with(current_dir.join(".pire-state"))
}

fn is_documented_not_available_command(command: &str) -> Result<bool> {
    Ok(unsupported_roots_from_json(UNSUPPORTED_ROOTS_JSON)?.contains(command))
}

fn unsupported_roots_from_json(json_text: &str) -> Result<BTreeSet<String>> {
    let value: Value = serde_json::from_str(json_text).context("invalid unsupported roots json")?;
    let roots = value
        .get("unsupportedRoots")
        .and_then(Value::as_array)
        .context("unsupported roots json must contain unsupportedRoots array")?;
    roots
        .iter()
        .map(|root| {
            root.as_str()
                .map(ToString::to_string)
                .context("unsupportedRoots entries must be strings")
        })
        .collect()
}

fn exit_code_for_error(code: &str) -> i32 {
    match code {
        "TimeoutError" | "timeout" => 124,
        "ElementNotFound" | "not_found" | "ref_stale" | "ambiguous_locator" | "not_enabled" => 44,
        "InvalidArgumentError" | "invalid_args" => 2,
        "DomainPolicyError" => 2,
        "ActionPolicyError" => 2,
        "ConfirmationRequired" => CONFIRMATION_REQUIRED_EXIT_CODE,
        "ConfirmationDenied" | "ConfirmationExpired" => 2,
        "NotAvailableError" => 78,
        "unsupported_command" => 1,
        "session_not_found" => 1,
        "confirmation_not_found" => 2,
        _ => 1,
    }
}

fn send_to_session(
    session_id: Option<&str>,
    request: &RpcRequest,
) -> Result<(RpcResponse, String)> {
    let session = select_session(session_id)?;
    let line = serde_json::to_string(request)?;
    let response = match send_pipe_request(&session.pipe_name, &line) {
        Ok(response) => response,
        Err(err) => {
            if session_id.is_none() && is_stale_default_session_pipe_error(&err) {
                let _ = remove_session(&session.session_id);
            }
            return Err(err)
                .with_context(|| format!("failed talking to session {}", session.session_id));
        }
    };
    Ok((serde_json::from_str(&response)?, session.session_id))
}

fn send_to_named_session(
    profile_name: &str,
    args: &[String],
    request: &RpcRequest,
    domain_policy: &DomainPolicyDecision,
) -> Result<(RpcResponse, String)> {
    validate_profile_name(profile_name)?;
    cleanup_stale_sessions(now_ms())?;
    if let Some(session) = live_session_for_profile_name(profile_name)? {
        let session_id = session.session_id;
        return send_to_session(Some(&session_id), request);
    }

    if is_controlled_close_command(args) {
        bail!(
            "session_not_found: no live pire-browser session found for profile name `{profile_name}`. `--session-name {profile_name} close` does not launch Firefox; run `pire-browser session list` to inspect live sessions."
        );
    }
    if !can_auto_launch_for_remote_args(args) {
        bail!(
            "session_not_found: no live pire-browser session found for profile name `{profile_name}`. Run `pire-browser --session-name {profile_name} open <url>` to launch it or `pire-browser session list` to inspect live sessions."
        );
    }

    if let Some(url) = launch_url_for_remote_args(args) {
        ensure_url_allowed(domain_policy, &url)?;
    }
    let result = launch_firefox(LaunchOptions {
        profile: profile_name.to_string(),
        url: launch_url_for_remote_args(args),
        firefox_path: None,
    })?;
    let session_id = result.session.session_id;
    send_to_session(Some(&session_id), request)
}

fn can_auto_launch_for_remote_args(args: &[String]) -> bool {
    matches!(
        args.first().map(String::as_str),
        Some(
            "open"
                | "goto"
                | "navigate"
                | "snapshot"
                | "find"
                | "click"
                | "dblclick"
                | "fill"
                | "type"
                | "press"
                | "key"
                | "keyboard"
                | "keydown"
                | "keyup"
                | "hover"
                | "focus"
                | "select"
                | "check"
                | "uncheck"
                | "scroll"
                | "scrollintoview"
                | "wait"
                | "screenshot"
                | "get"
                | "is"
                | "eval"
                | "tab"
                | "tabs"
                | "back"
                | "forward"
                | "reload"
                | "window"
                | "frame"
                | "dialog"
                | "batch"
                | "cookies"
                | "storage"
                | "clipboard"
        )
    )
}

fn is_supported_remote_command(command: &str) -> bool {
    matches!(
        command,
        "status"
            | "open"
            | "goto"
            | "navigate"
            | "snapshot"
            | "find"
            | "click"
            | "dblclick"
            | "fill"
            | "type"
            | "press"
            | "key"
            | "keyboard"
            | "keydown"
            | "keyup"
            | "hover"
            | "focus"
            | "select"
            | "check"
            | "uncheck"
            | "scroll"
            | "scrollintoview"
            | "wait"
            | "screenshot"
            | "get"
            | "is"
            | "eval"
            | "tab"
            | "tabs"
            | "back"
            | "forward"
            | "reload"
            | "window"
            | "frame"
            | "dialog"
            | "batch"
            | "cookies"
            | "storage"
            | "clipboard"
            | "session"
            | "close"
            | "quit"
            | "exit"
    )
}

fn command_suggestions(command: &str) -> Vec<String> {
    let candidates = [
        "status",
        "doctor",
        "open",
        "snapshot",
        "find",
        "click",
        "fill",
        "wait",
        "clipboard",
        "state",
        "session",
        "screenshot",
        "tabs",
        "launch",
        "setup",
    ];
    candidates
        .iter()
        .filter(|candidate| {
            candidate.starts_with(command)
                || command.starts_with(*candidate)
                || levenshtein_distance(command, candidate) <= 2
        })
        .take(3)
        .map(|candidate| candidate.to_string())
        .collect()
}

fn levenshtein_distance(left: &str, right: &str) -> usize {
    let mut costs: Vec<usize> = (0..=right.len()).collect();
    for (left_index, left_char) in left.chars().enumerate() {
        let mut previous = left_index;
        costs[0] = left_index + 1;
        for (right_index, right_char) in right.chars().enumerate() {
            let insertion = costs[right_index + 1] + 1;
            let deletion = costs[right_index] + 1;
            let substitution = previous + usize::from(left_char != right_char);
            previous = costs[right_index + 1];
            costs[right_index + 1] = insertion.min(deletion).min(substitution);
        }
    }
    *costs.last().unwrap_or(&0)
}

fn launch_url_for_remote_args(args: &[String]) -> Option<String> {
    if args.iter().any(|arg| arg == "--new") {
        return None;
    }
    match args.first().map(String::as_str) {
        Some("open" | "goto" | "navigate") => first_positional_arg(&args[1..], &["--label"]),
        _ => None,
    }
}

fn navigation_url_for_remote_args(args: &[String]) -> Option<String> {
    match args.first().map(String::as_str) {
        Some("open" | "goto" | "navigate") => first_positional_arg(&args[1..], &["--label"]),
        Some("tab" | "tabs") if args.get(1).map(String::as_str) == Some("new") => {
            first_positional_arg(&args[2..], &["--label"])
        }
        _ => None,
    }
}

fn is_controlled_close_command(args: &[String]) -> bool {
    matches!(
        args.first().map(String::as_str),
        Some("close" | "quit" | "exit")
    )
}

fn first_positional_arg(args: &[String], value_flags: &[&str]) -> Option<String> {
    let mut skip_next = false;
    for arg in args {
        if skip_next {
            skip_next = false;
            continue;
        }
        if value_flags.contains(&arg.as_str()) {
            skip_next = true;
            continue;
        }
        if arg.starts_with("--") {
            continue;
        }
        return Some(arg.clone());
    }
    None
}

fn should_auto_launch_remote(session: Option<&str>, args: &[String], err: &anyhow::Error) -> bool {
    session.is_none()
        && can_auto_launch_for_remote_args(args)
        && is_auto_launchable_session_error(err)
}

fn is_auto_launchable_session_error(err: &anyhow::Error) -> bool {
    let details = format!("{err:#}");
    details.contains("extension_disconnected: no live Firefox extension session found")
        || (details.contains("failed talking to session")
            && (details.contains("The system cannot find the file specified")
                || details.contains("The pipe has been ended")
                || details.contains("All pipe instances are busy")
                || details.contains("os error 2")
                || details.contains("os error 109")
                || details.contains("os error 231")))
}

fn is_stale_default_session_pipe_error(err: &anyhow::Error) -> bool {
    let details = format!("{err:#}");
    details.contains("The system cannot find the file specified")
        || details.contains("The pipe has been ended")
        || details.contains("All pipe instances are busy")
        || details.contains("os error 2")
        || details.contains("os error 109")
        || details.contains("os error 231")
}

#[allow(dead_code)]
fn host_status_request() -> RpcRequest {
    RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "host_status".into(),
        params: json!({}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    #[test]
    fn auto_launches_for_browser_control_commands() {
        assert!(can_auto_launch_for_remote_args(&s(&[
            "open",
            "https://example.com"
        ])));
        assert!(can_auto_launch_for_remote_args(&s(&[
            "goto",
            "https://example.com"
        ])));
        assert!(can_auto_launch_for_remote_args(&s(&[
            "navigate",
            "https://example.com"
        ])));
        assert!(can_auto_launch_for_remote_args(&s(&["snapshot", "-i"])));
        assert!(can_auto_launch_for_remote_args(&s(&["tabs", "list"])));
        assert!(!can_auto_launch_for_remote_args(&s(&["close"])));
        assert!(!can_auto_launch_for_remote_args(&s(&["unknown"])));
    }

    #[test]
    fn interactive_confirmation_approval_marks_remote_request_context() {
        let domain_decision = domain_decision_from_request_context(None).unwrap();
        let action_decision = action_decision_from_request_context(None).unwrap();
        let confirmation_context =
            pire_browser_core::confirmation_policy::ConfirmationPolicyRequestContext {
                enabled: true,
                categories: vec!["eval".to_string()],
                approved_confirmation_id: None,
            };
        let confirmation_decision = confirmation_decision_from_context(Some(&confirmation_context));
        let request = build_command_request_with_policies(
            s(&["eval", "document.title"]),
            &domain_decision,
            &action_decision,
            &confirmation_decision,
            true,
        )
        .unwrap();

        assert_eq!(
            request.params["confirmationPolicy"]["approvedConfirmationId"],
            INTERACTIVE_CONFIRMATION_APPROVAL_ID
        );
    }

    #[test]
    fn formats_documented_not_available_text() {
        let result = local_not_available_result(&s(&["stream", "status"]), false, &[])
            .unwrap()
            .unwrap();
        assert!(result.contains("NotAvailableError"));
        assert!(result.contains("not implemented"));
    }

    #[test]
    fn loads_documented_not_available_roots_from_artifact() {
        let roots = unsupported_roots_from_json(UNSUPPORTED_ROOTS_JSON).unwrap();
        assert!(roots.contains("stream"));
        assert!(roots.contains("download"));
        assert!(!roots.contains("open"));
        assert!(!roots.contains("click"));
    }

    #[test]
    fn every_generated_unsupported_root_returns_not_available() {
        for root in unsupported_roots_from_json(UNSUPPORTED_ROOTS_JSON).unwrap() {
            let result = local_not_available_result(&s(&[root.as_str()]), false, &[])
                .unwrap()
                .unwrap();
            assert!(result.contains("NotAvailableError"), "{root}");
            assert_eq!(exit_code_for_error("NotAvailableError"), 78);
        }
    }

    #[test]
    fn supported_roots_are_not_marked_not_available() {
        for root in [
            "open", "goto", "navigate", "click", "fill", "snapshot", "tab", "tabs", "find", "wait",
        ] {
            assert!(local_not_available_result(&s(&[root]), false, &[])
                .unwrap()
                .is_none());
        }
    }

    #[test]
    fn rejects_invalid_unsupported_roots_artifact() {
        assert!(unsupported_roots_from_json("{}").is_err());
        assert!(unsupported_roots_from_json(r#"{"unsupportedRoots":[42]}"#).is_err());
    }

    #[test]
    fn formats_documented_not_available_json() {
        let result = local_not_available_result(&s(&["download", "#link", "out.zip"]), true, &[])
            .unwrap()
            .unwrap();
        assert!(result.contains("\"success\": false"));
        assert!(result.contains("\"NotAvailableError\""));
        assert!(result.contains("\"compatibility\": \"not_available\""));
    }

    #[test]
    fn state_show_remains_not_available() {
        let result = local_not_available_result(&s(&["state", "show", "state.json"]), true, &[])
            .unwrap()
            .unwrap();
        assert!(result.contains("\"NotAvailableError\""));
        assert!(result.contains("\"feature\": \"state\""));
    }

    #[test]
    fn formats_unknown_commands_locally_with_suggestions() {
        let result = local_unsupported_command_result(&s(&["stats"]), false, &[])
            .unwrap()
            .unwrap();
        assert!(result.contains("unsupported_command"));
        assert!(result.contains("status"));

        assert!(
            local_unsupported_command_result(&s(&["clipboard"]), false, &[])
                .unwrap()
                .is_none()
        );
        assert!(
            local_unsupported_command_result(&s(&["session"]), false, &[])
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn supported_remote_commands_are_not_locally_rejected() {
        for root in [
            "status",
            "open",
            "click",
            "tabs",
            "clipboard",
            "session",
            "close",
        ] {
            assert!(local_unsupported_command_result(&s(&[root]), false, &[])
                .unwrap()
                .is_none());
        }
    }

    #[test]
    fn plain_invalid_target_errors_include_ref_hint() {
        let error = pire_browser_core::protocol::RpcError {
            code: "invalid_args".to_string(),
            message: "target is required".to_string(),
            data: None,
        };
        let message = plain_error_message(&error);
        assert!(message.contains("click '@e4'"));
        assert!(message.contains("snapshot -i"));
    }

    #[test]
    fn derives_launch_url_from_open_command() {
        assert_eq!(
            launch_url_for_remote_args(&s(&["open", "https://example.com", "--label", "docs"])),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            launch_url_for_remote_args(&s(&["goto", "https://example.com"])),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            launch_url_for_remote_args(&s(&["navigate", "--label", "docs", "https://example.com"])),
            Some("https://example.com".to_string())
        );
        assert_eq!(launch_url_for_remote_args(&s(&["snapshot"])), None);
        assert_eq!(launch_url_for_remote_args(&s(&["open"])), None);
        assert_eq!(launch_url_for_remote_args(&s(&["open", "--new"])), None);
        assert_eq!(
            launch_url_for_remote_args(&s(&["open", "--new", "https://example.com"])),
            None
        );
        assert_eq!(
            navigation_url_for_remote_args(&s(&["open", "--new", "https://example.com"])),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            navigation_url_for_remote_args(&s(&["tabs", "new", "https://example.com"])),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            navigation_url_for_remote_args(&s(&[
                "tab",
                "new",
                "--label",
                "docs",
                "https://example.com"
            ])),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            launch_url_for_remote_args(&s(&["tabs", "new", "https://example.com"])),
            None
        );
    }

    #[test]
    fn treats_missing_session_pipe_as_auto_launchable() {
        let err = anyhow::anyhow!(
            "failed talking to session abc: failed to connect to pire-browser pipe \\\\.\\pipe\\abc: The system cannot find the file specified. (os error 2)"
        );
        assert!(is_auto_launchable_session_error(&err));
        assert!(should_auto_launch_remote(
            None,
            &s(&["open", "https://example.com"]),
            &err
        ));
        assert!(!should_auto_launch_remote(
            Some("named"),
            &s(&["open", "https://example.com"]),
            &err
        ));
        assert!(!should_auto_launch_remote(None, &s(&["close"]), &err));
    }

    #[test]
    fn treats_closed_default_session_pipe_as_auto_launchable() {
        for message in [
            "failed talking to session abc: timed out waiting for response from \\\\.\\pipe\\abc: PeekNamedPipe failed: The pipe has been ended. (os error 109)",
            "failed talking to session abc: failed to connect to pire-browser pipe \\\\.\\pipe\\abc: All pipe instances are busy. (os error 231)",
        ] {
            let err = anyhow::anyhow!(message);
            assert!(is_auto_launchable_session_error(&err), "{message}");
            assert!(is_stale_default_session_pipe_error(&err), "{message}");
        }
    }

    #[test]
    fn classifies_launch_and_connect_failures_for_json_envelopes() {
        let timeout = rpc_error_from_anyhow(&anyhow::anyhow!(
            "timed out waiting for pire-browser extension session; check C:/tmp/web-ext.log"
        ));
        assert_eq!(timeout.code, "timeout");
        assert_eq!(exit_code_for_error(&timeout.code), 124);

        let disconnected = rpc_error_from_anyhow(&anyhow::anyhow!(
            "extension_disconnected: no live Firefox extension session found"
        ));
        assert_eq!(disconnected.code, "extension_disconnected");

        let missing_session = rpc_error_from_anyhow(&anyhow::anyhow!(
            "session_not_found: no live pire-browser session found for `abc`"
        ));
        assert_eq!(missing_session.code, "session_not_found");

        let invalid_args = rpc_error_from_anyhow(&anyhow::anyhow!(
            "invalid_args: profile name may contain only letters, numbers, internal spaces, `_`, `-`, and `.`"
        ));
        assert_eq!(invalid_args.code, "invalid_args");
        assert_eq!(exit_code_for_error(&invalid_args.code), 2);

        let launch = rpc_error_from_anyhow(&anyhow::anyhow!(
            "web-ext exited before pire-browser connected (status: 1)"
        ));
        assert_eq!(launch.code, "browser_launch_failed");

        let domain = rpc_error_from_anyhow(&anyhow::anyhow!(
            "DomainPolicyError: host `example.net` is outside the active domain allowlist (example.com)"
        ));
        assert_eq!(domain.code, "DomainPolicyError");
        assert_eq!(domain.data, Some(json!({ "phase": "policy" })));
        assert_eq!(exit_code_for_error(&domain.code), 2);

        let action = rpc_error_from_anyhow(&anyhow::anyhow!(
            "ActionPolicyError: action category `eval` is denied by the active action policy"
        ));
        assert_eq!(action.code, "ActionPolicyError");
        assert_eq!(action.data, Some(json!({ "phase": "policy" })));
        assert_eq!(exit_code_for_error(&action.code), 2);
    }

    #[test]
    fn formats_json_error_envelope_with_ignored_global_flag_warnings() {
        let error = pire_browser_core::protocol::RpcError {
            code: "timeout".to_string(),
            message: "timed out token=raw-secret-token".to_string(),
            data: Some(json!({ "phase": "connect", "accessToken": "raw-token" })),
        };
        let warnings = ignored_global_flag_warnings(&[GlobalFlagWarning {
            flag: "--headless".to_string(),
        }]);
        let formatted = serde_json::to_string_pretty(&json!({
            "success": false,
            "error": {
                "code": error.code,
                "message": error.message,
                "data": error.data
            },
            "warnings": warnings
        }))
        .unwrap();
        assert!(formatted.contains("\"success\": false"));
        assert!(formatted.contains("\"timeout\""));
        assert!(formatted.contains("\"IGNORED_GLOBAL_FLAG\""));
    }

    #[test]
    fn diagnostic_errors_are_redacted() {
        let error = pire_browser_core::protocol::RpcError {
            code: "command_failed".to_string(),
            message: "failed with Authorization: Bearer raw-secret".to_string(),
            data: Some(json!({ "token": "raw-token" })),
        };
        let message = plain_error_message(&error);
        assert!(message.contains("[REDACTED]"));
        assert!(!message.contains("raw-secret"));

        let classified = rpc_error_from_anyhow(&anyhow::anyhow!(
            "failed open https://example.test/callback?code=oauth-code-123"
        ));
        assert!(!classified.message.contains("oauth-code-123"));
        assert!(classified.message.contains("code=[REDACTED]"));
    }

    #[test]
    fn ignored_global_flags_are_reported_as_json_warnings() {
        let warnings = vec![
            GlobalFlagWarning {
                flag: "--headless".to_string(),
            },
            GlobalFlagWarning {
                flag: "--color-scheme".to_string(),
            },
        ];
        let mut result = json!({ "text": "ok" });
        append_ignored_global_flag_warnings(&mut result, &warnings);
        let formatted = format_cli_result(&result, true).unwrap();
        assert!(formatted.contains("\"IGNORED_GLOBAL_FLAG\""));
        assert!(formatted.contains("\"--headless\""));
        assert!(formatted.contains("\"--color-scheme\""));
    }

    #[test]
    fn state_success_output_reports_counts_without_values() {
        let state = ActiveOriginStateFile {
            schema_version: 1,
            tool: "pire-browser".to_string(),
            kind: "active-origin-state".to_string(),
            created_at: 1,
            source: pire_browser_core::state_file::ActiveOriginStateSource {
                url: "https://example.test/app?code=query-secret#fragment-secret".to_string(),
                origin: "https://example.test".to_string(),
                session_id: Some("s1".to_string()),
                profile_name: Some("work".to_string()),
            },
            cookies: vec![json!({ "name": "cookie-name-secret", "value": "raw-cookie-secret" })],
            local_storage: [(
                "local-key-secret".to_string(),
                "raw-local-secret".to_string(),
            )]
            .into(),
            session_storage: [(
                "session-key-secret".to_string(),
                "raw-session-secret".to_string(),
            )]
            .into(),
        };

        let save = state_save_value(&state, Path::new("state.json"), 123);
        let save_text = serde_json::to_string(&save).unwrap();
        assert!(save_text.contains("\"cookies\":1"));
        assert!(save_text.contains("\"displayUrl\":\"https://example.test/app\""));
        assert!(!save_text.contains("\"url\""));
        assert!(!save_text.contains("raw-cookie-secret"));
        assert!(!save_text.contains("raw-local-secret"));
        assert!(!save_text.contains("raw-session-secret"));
        assert!(!save_text.contains("query-secret"));
        assert!(!save_text.contains("fragment-secret"));

        let load = state_load_value(
            &state,
            Path::new("state.json"),
            &json!({ "cookiesSet": 1, "reloaded": true }),
        );
        let load_text = serde_json::to_string(&load).unwrap();
        assert!(load_text.contains("\"cookiesSet\":1"));
        assert!(load_text.contains("\"displayUrl\":\"https://example.test/app\""));
        assert!(!load_text.contains("\"url\""));
        assert!(!load_text.contains("raw-cookie-secret"));
        assert!(!load_text.contains("raw-local-secret"));
        assert!(!load_text.contains("raw-session-secret"));
        assert!(!load_text.contains("query-secret"));
        assert!(!load_text.contains("fragment-secret"));

        for include_text in [true, false] {
            let inspect = state_inspect_value(&state, Path::new("state.json"), 456, include_text);
            let inspect_text = serde_json::to_string(&inspect).unwrap();
            assert!(inspect_text.contains("\"cookies\":1"));
            assert!(inspect_text.contains("\"localStorageKeys\":1"));
            assert!(inspect_text.contains("\"sessionStorageKeys\":1"));
            assert!(inspect_text.contains("https://example.test/app"));
            assert!(!inspect_text.contains("sensitive"));
            for sentinel in [
                "cookie-name-secret",
                "raw-cookie-secret",
                "local-key-secret",
                "raw-local-secret",
                "session-key-secret",
                "raw-session-secret",
                "query-secret",
                "fragment-secret",
            ] {
                assert!(!inspect_text.contains(sentinel), "{sentinel}");
            }
        }
    }

    #[test]
    fn state_save_path_warning_uses_recommended_dir() {
        let mut outside = json!({ "text": "ok" });
        append_state_save_path_warning(&mut outside, Path::new("state.json"));
        assert!(serde_json::to_string(&outside)
            .unwrap()
            .contains("STATE_FILE_OUTSIDE_RECOMMENDED_DIR"));

        let mut inside = json!({ "text": "ok" });
        append_state_save_path_warning(
            &mut inside,
            Path::new(".pire-state/example.com-review.json"),
        );
        assert!(inside.get("warnings").is_none());
    }
}
