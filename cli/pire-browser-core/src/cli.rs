use anyhow::{bail, Result};
use serde_json::{json, Map, Value};
use std::env;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

use crate::action_policy::ActionPolicyArgs;
use crate::confirmation_policy::ConfirmationPolicyArgs;
use crate::domain_policy::DomainPolicyArgs;
use crate::download::DOWNLOAD_TIMEOUT_MS;
use crate::protocol::RpcRequest;
use crate::state_policy::StateLoadPolicyFlag;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GlobalFlagWarning {
    pub flag: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigWarning {
    pub path: PathBuf,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigApplyResult {
    pub args: Vec<String>,
    pub warnings: Vec<ConfigWarning>,
}

#[derive(Debug, Clone, Default)]
pub struct ConfigApplyOptions {
    pub user_config: Option<PathBuf>,
    pub project_config: Option<PathBuf>,
    pub env_config: Option<PathBuf>,
    pub legacy_user_config: Option<PathBuf>,
    pub legacy_project_config: Option<PathBuf>,
    pub legacy_env_config: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionTarget {
    Default,
    Id(String),
    Name(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LocalCommand {
    Help {
        topic: Option<String>,
    },
    Setup {
        windows: bool,
        firefox_path: Option<String>,
    },
    Launch {
        profile: String,
        url: Option<String>,
        firefox_path: Option<String>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
    },
    Mcp {
        tools: String,
    },
    ProfilesList {
        json: bool,
    },
    SkillsList {
        json: bool,
    },
    SkillsCat {
        name: String,
        json: bool,
    },
    SkillsCatAll {
        json: bool,
    },
    InstallStatus {
        json: bool,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
    },
    DoctorFix {
        json: bool,
    },
    Status {
        json: bool,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
    },
    SessionList {
        json: bool,
    },
    SessionAttach {
        session: String,
        json: bool,
    },
    SessionCleanup {
        json: bool,
    },
    CloseAll {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
    },
    CloseOne {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
    },
    StateSave {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
        path: String,
    },
    StateLoad {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
        path: String,
        policy_flag: StateLoadPolicyFlag,
    },
    StateInspect {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        path: String,
        record: bool,
    },
    StateList {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
    },
    StateShow {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        path: String,
    },
    StateRename {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        old: String,
        new: String,
    },
    StateClear {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        name: Option<String>,
        all: bool,
    },
    StateClean {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        older_than_days: u64,
    },
    StateShortcut {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
        path: String,
        args: Vec<String>,
    },
    Download {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
        selector: String,
        path: String,
        timeout_ms: u64,
    },
    WaitDownload {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
        path: Option<String>,
        timeout_ms: u64,
    },
    Upload {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
        selector: String,
        files: Vec<String>,
    },
    Confirm {
        id: String,
        json: bool,
    },
    Deny {
        id: String,
        json: bool,
    },
    Remote {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
        args: Vec<String>,
    },
}

const GLOBAL_VALUE_FLAGS: &[&str] = &[
    "--session",
    "--session-name",
    "--profile",
    "--state",
    "--color-scheme",
    "--max-output",
    "--allowed-domains",
    "--confirm-actions",
    "--action-policy",
    "--config",
    "--executable-path",
    "--engine",
    "--provider",
    "-p",
    "--model",
];
const GLOBAL_BOOL_FLAGS: &[&str] = &[
    "--json",
    "--headed",
    "--headless",
    "--allow-file-access",
    "--auto-connect",
    "--confirm-interactive",
    "--no-allowed-domains",
    "--content-boundaries",
    "-q",
    "-v",
];

pub fn apply_config_defaults(raw: &[String]) -> Result<ConfigApplyResult> {
    apply_config_defaults_with_options(raw, default_config_options()?)
}

pub fn apply_config_defaults_with_options(
    raw: &[String],
    options: ConfigApplyOptions,
) -> Result<ConfigApplyResult> {
    let explicit_cli_config = explicit_cli_config_path(raw)?;
    let mut merged = Map::new();
    let mut warnings = Vec::new();

    load_optional_config(
        options.legacy_user_config.as_ref(),
        false,
        &mut merged,
        &mut warnings,
    )?;
    load_optional_config(
        options.user_config.as_ref(),
        false,
        &mut merged,
        &mut warnings,
    )?;
    load_optional_config(
        options.legacy_project_config.as_ref(),
        false,
        &mut merged,
        &mut warnings,
    )?;
    load_optional_config(
        options.project_config.as_ref(),
        false,
        &mut merged,
        &mut warnings,
    )?;
    if options.env_config.is_none() {
        load_optional_config(
            options.legacy_env_config.as_ref(),
            true,
            &mut merged,
            &mut warnings,
        )?;
    }
    load_optional_config(
        options.env_config.as_ref(),
        true,
        &mut merged,
        &mut warnings,
    )?;
    load_optional_config(
        explicit_cli_config.as_ref(),
        true,
        &mut merged,
        &mut warnings,
    )?;

    let mut args = config_args_from_map(&merged, raw);
    push_session_env_defaults(&mut args, raw);
    args.extend_from_slice(raw);
    Ok(ConfigApplyResult { args, warnings })
}

fn push_session_env_defaults(args: &mut Vec<String>, raw: &[String]) {
    push_session_env_defaults_from_values(
        args,
        raw,
        env_var_nonempty_alias("PIRE_BROWSER_SESSION_NAME", "AGENT_BROWSER_SESSION_NAME"),
        env_var_nonempty_alias("PIRE_BROWSER_PROFILE", "AGENT_BROWSER_PROFILE"),
        env_var_nonempty_alias("PIRE_BROWSER_SESSION", "AGENT_BROWSER_SESSION"),
    );
}

fn push_session_env_defaults_from_values(
    args: &mut Vec<String>,
    raw: &[String],
    session_name_env: Option<String>,
    profile_env: Option<String>,
    session_env: Option<String>,
) {
    if raw_has_any_flag(raw, &["--session", "--session-name", "--profile"])
        || raw_has_any_flag(args, &["--session", "--session-name", "--profile"])
    {
        return;
    }
    if let Some(value) = session_name_env {
        args.push("--session-name".to_string());
        args.push(value);
        return;
    }
    if let Some(value) = profile_env {
        args.push("--profile".to_string());
        args.push(value);
        return;
    }
    if let Some(value) = session_env {
        args.push("--session".to_string());
        args.push(value);
    }
}

fn env_var_nonempty(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_var_nonempty_alias(primary: &str, legacy: &str) -> Option<String> {
    env_var_nonempty(primary).or_else(|| env_var_nonempty(legacy))
}

fn default_config_options() -> Result<ConfigApplyOptions> {
    let (project_config, legacy_project_config) = env::current_dir()
        .ok()
        .map(|cwd| {
            (
                cwd.join("pire-browser.json"),
                cwd.join("agent-browser.json"),
            )
        })
        .unwrap_or((
            PathBuf::from("pire-browser.json"),
            PathBuf::from("agent-browser.json"),
        ));
    let (user_config, legacy_user_config) = home_dir_from_env()
        .map(|home| {
            (
                home.join(".pire-browser").join("config.json"),
                home.join(".agent-browser").join("config.json"),
            )
        })
        .unzip();
    let env_config = env_var_nonempty("PIRE_BROWSER_CONFIG").map(PathBuf::from);
    let legacy_env_config = if env_config.is_some() {
        None
    } else {
        env_var_nonempty("AGENT_BROWSER_CONFIG").map(PathBuf::from)
    };
    Ok(ConfigApplyOptions {
        user_config,
        project_config: Some(project_config),
        env_config,
        legacy_user_config,
        legacy_project_config: Some(legacy_project_config),
        legacy_env_config,
    })
}

fn home_dir_from_env() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .or_else(|| {
            let drive = env::var_os("HOMEDRIVE")?;
            let path = env::var_os("HOMEPATH")?;
            let mut value = PathBuf::from(drive);
            value.push(path);
            Some(value)
        })
}

fn explicit_cli_config_path(raw: &[String]) -> Result<Option<PathBuf>> {
    let mut explicit = None;
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == "--config" {
            let Some(value) = raw.get(i + 1) else {
                bail!("--config requires a path");
            };
            explicit = Some(PathBuf::from(value));
            i += 2;
            continue;
        }
        i += 1;
    }
    Ok(explicit)
}

fn load_optional_config(
    path: Option<&PathBuf>,
    required: bool,
    merged: &mut Map<String, Value>,
    warnings: &mut Vec<ConfigWarning>,
) -> Result<()> {
    let Some(path) = path else {
        return Ok(());
    };
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if required => {
            bail!(
                "config_not_found: could not read config {}: {error}",
                path.display()
            );
        }
        Err(_) => return Ok(()),
    };
    let value: Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(error) if required => {
            bail!(
                "config_malformed: could not parse config {}: {error}",
                path.display()
            );
        }
        Err(error) => {
            warnings.push(ConfigWarning {
                path: path.clone(),
                message: format!("ignored malformed config: {error}"),
            });
            return Ok(());
        }
    };
    let Some(object) = value.as_object() else {
        if required {
            bail!(
                "config_malformed: config {} must contain a JSON object",
                path.display()
            );
        }
        warnings.push(ConfigWarning {
            path: path.clone(),
            message: "ignored malformed config: expected a JSON object".to_string(),
        });
        return Ok(());
    };
    for (key, value) in object {
        merged.insert(key.clone(), value.clone());
    }
    Ok(())
}

fn config_args_from_map(config: &Map<String, Value>, raw: &[String]) -> Vec<String> {
    let mut args = Vec::new();

    push_profile_config(&mut args, config, raw);
    push_value_config(
        &mut args,
        config,
        raw,
        "sessionName",
        "--session-name",
        &["--session", "--session-name"],
    );
    push_value_config(
        &mut args,
        config,
        raw,
        "session",
        "--session",
        &["--session", "--session-name"],
    );
    push_value_config(
        &mut args,
        config,
        raw,
        "allowedDomains",
        "--allowed-domains",
        &["--allowed-domains", "--no-allowed-domains"],
    );
    push_bool_config(
        &mut args,
        config,
        raw,
        "noAllowedDomains",
        "--no-allowed-domains",
        &["--allowed-domains", "--no-allowed-domains"],
    );
    push_value_config(
        &mut args,
        config,
        raw,
        "actionPolicy",
        "--action-policy",
        &["--action-policy"],
    );
    push_value_config(
        &mut args,
        config,
        raw,
        "confirmActions",
        "--confirm-actions",
        &["--confirm-actions"],
    );
    push_bool_config(
        &mut args,
        config,
        raw,
        "confirmInteractive",
        "--confirm-interactive",
        &["--confirm-interactive"],
    );
    push_bool_config(&mut args, config, raw, "json", "--json", &["--json"]);
    push_bool_config(
        &mut args,
        config,
        raw,
        "allowFileAccess",
        "--allow-file-access",
        &["--allow-file-access"],
    );
    push_bool_config(
        &mut args,
        config,
        raw,
        "autoConnect",
        "--auto-connect",
        &["--auto-connect"],
    );
    push_headed_config(&mut args, config, raw);
    push_value_config(
        &mut args,
        config,
        raw,
        "colorScheme",
        "--color-scheme",
        &["--color-scheme"],
    );
    push_value_config(
        &mut args,
        config,
        raw,
        "maxOutput",
        "--max-output",
        &["--max-output"],
    );
    push_boolish_config(
        &mut args,
        config,
        raw,
        "contentBoundaries",
        "--content-boundaries",
        &["--content-boundaries"],
    );
    push_value_config(
        &mut args,
        config,
        raw,
        "executablePath",
        "--executable-path",
        &["--executable-path"],
    );
    push_value_config(&mut args, config, raw, "engine", "--engine", &["--engine"]);
    push_value_config(
        &mut args,
        config,
        raw,
        "provider",
        "--provider",
        &["--provider", "-p"],
    );
    push_value_config(&mut args, config, raw, "model", "--model", &["--model"]);

    args
}

fn push_profile_config(args: &mut Vec<String>, config: &Map<String, Value>, raw: &[String]) {
    if raw_has_any_flag(raw, &["--profile", "--session", "--session-name"]) {
        return;
    }
    if config
        .get("sessionName")
        .and_then(config_value_to_string)
        .is_some()
        || config
            .get("session")
            .and_then(config_value_to_string)
            .is_some()
    {
        return;
    }
    let Some(value) = config.get("profile").and_then(config_value_to_string) else {
        return;
    };
    args.push("--profile".to_string());
    args.push(value);
}

fn push_value_config(
    args: &mut Vec<String>,
    config: &Map<String, Value>,
    raw: &[String],
    key: &str,
    flag: &str,
    override_flags: &[&str],
) {
    if raw_has_any_flag(raw, override_flags) {
        return;
    }
    let Some(value) = config.get(key).and_then(config_value_to_string) else {
        return;
    };
    args.push(flag.to_string());
    args.push(value);
}

fn push_bool_config(
    args: &mut Vec<String>,
    config: &Map<String, Value>,
    raw: &[String],
    key: &str,
    flag: &str,
    override_flags: &[&str],
) {
    if raw_has_any_flag(raw, override_flags) {
        return;
    }
    if config.get(key).and_then(Value::as_bool) == Some(true) {
        args.push(flag.to_string());
    }
}

fn push_boolish_config(
    args: &mut Vec<String>,
    config: &Map<String, Value>,
    raw: &[String],
    key: &str,
    flag: &str,
    override_flags: &[&str],
) {
    if raw_has_any_flag(raw, override_flags) {
        return;
    }
    let Some(value) = config.get(key) else {
        return;
    };
    if config_value_to_boolish(value) {
        args.push(flag.to_string());
    }
}

fn config_value_to_boolish(value: &Value) -> bool {
    if let Some(value) = value.as_bool() {
        return value;
    }
    if let Some(value) = value.as_str() {
        let value = value.trim();
        if value.is_empty() {
            return false;
        }
        if matches!(
            value.to_ascii_lowercase().as_str(),
            "0" | "false" | "no" | "off"
        ) {
            return false;
        }
        return true;
    }
    if let Some(value) = value.as_i64() {
        return value != 0;
    }
    true
}

fn push_headed_config(args: &mut Vec<String>, config: &Map<String, Value>, raw: &[String]) {
    if raw_has_any_flag(raw, &["--headed", "--headless"]) {
        return;
    }
    if let Some(headless) = config.get("headless").and_then(Value::as_bool) {
        args.push(if headless { "--headless" } else { "--headed" }.to_string());
        return;
    }
    if let Some(headed) = config.get("headed").and_then(Value::as_bool) {
        args.push(if headed { "--headed" } else { "--headless" }.to_string());
    }
}

fn config_value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(value) if !value.trim().is_empty() => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        Value::Array(values) => {
            let strings: Vec<_> = values.iter().filter_map(config_value_to_string).collect();
            if strings.is_empty() {
                None
            } else {
                Some(strings.join(","))
            }
        }
        _ => None,
    }
}

fn raw_has_any_flag(raw: &[String], flags: &[&str]) -> bool {
    raw.iter().any(|arg| flags.contains(&arg.as_str()))
}

fn parse_bool_literal(value: &str) -> Option<bool> {
    match value.to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

pub fn parse_cli_args(raw: &[String]) -> Result<LocalCommand> {
    if raw.is_empty() {
        return Ok(LocalCommand::Help { topic: None });
    }
    if raw.first().map(|arg| is_help_flag(arg)).unwrap_or(false) {
        return Ok(LocalCommand::Help { topic: None });
    }
    if raw.first().map(String::as_str) == Some("help") {
        return Ok(LocalCommand::Help {
            topic: raw.get(1).cloned(),
        });
    }

    let mut args = raw.to_vec();
    let mut session_id = None;
    let mut session_name = None;
    let mut state_path = None;
    let mut json_output = false;
    let mut ignored_global_flags = Vec::new();
    let mut domain_policy = DomainPolicyArgs::default();
    let mut action_policy = ActionPolicyArgs::default();
    let mut confirmation_policy = ConfirmationPolicyArgs::default();
    while let Some(first) = args.first().cloned() {
        if GLOBAL_VALUE_FLAGS.contains(&first.as_str()) {
            let flag = args.remove(0);
            let Some(value) = args.first().cloned() else {
                bail!("{flag} requires a value");
            };
            args.remove(0);
            match flag.as_str() {
                "--session" => set_session_id_or_name(&mut session_id, &mut session_name, value)?,
                "--session-name" => set_session_name(&session_id, &mut session_name, value)?,
                "--profile" => set_profile_name(&session_id, &mut session_name, value)?,
                "--state" => set_global_state_path(&mut state_path, value)?,
                "--allowed-domains" => set_allowed_domains(&mut domain_policy, value)?,
                "--action-policy" => set_action_policy(&mut action_policy, value)?,
                "--confirm-actions" => {
                    set_confirm_actions(&mut confirmation_policy, value)?;
                }
                _ => {}
            }
            if ignored_with_warning_global_flag(&flag) {
                ignored_global_flags.push(GlobalFlagWarning { flag });
            }
            continue;
        }
        if GLOBAL_BOOL_FLAGS.contains(&first.as_str()) {
            args.remove(0);
            let effective_flag = if matches!(
                first.as_str(),
                "--headed" | "--headless" | "--content-boundaries"
            ) {
                if let Some(value) = args.first().and_then(|value| parse_bool_literal(value)) {
                    args.remove(0);
                    if value {
                        first.clone()
                    } else if first == "--headed" {
                        "--headless".to_string()
                    } else if first == "--headless" {
                        "--headed".to_string()
                    } else {
                        first.clone()
                    }
                } else {
                    first.clone()
                }
            } else {
                first.clone()
            };
            if first == "--json" {
                json_output = true;
            }
            if first == "--no-allowed-domains" {
                set_no_allowed_domains(&mut domain_policy)?;
            }
            if first == "--confirm-interactive" {
                confirmation_policy.confirm_interactive = true;
            }
            if ignored_with_warning_global_flag(&effective_flag) {
                ignored_global_flags.push(GlobalFlagWarning {
                    flag: effective_flag,
                });
            }
            continue;
        }
        match first.as_str() {
            "--session" => {
                args.remove(0);
                let Some(value) = args.first().cloned() else {
                    bail!("{first} requires a value");
                };
                args.remove(0);
                set_session_id_or_name(&mut session_id, &mut session_name, value)?;
            }
            "--session-name" => {
                args.remove(0);
                let Some(value) = args.first().cloned() else {
                    bail!("{first} requires a value");
                };
                args.remove(0);
                set_session_name(&session_id, &mut session_name, value)?;
            }
            "--json" => {
                args.remove(0);
                json_output = true;
            }
            _ => break,
        }
    }

    let session_target = session_target_from_flags(session_id, session_name);
    let Some(command) = args.first().cloned() else {
        return Ok(LocalCommand::Help { topic: None });
    };

    if command == "help" {
        return Ok(LocalCommand::Help {
            topic: args.get(1).cloned(),
        });
    }

    if args.iter().skip(1).any(|arg| is_help_flag(arg)) {
        return Ok(LocalCommand::Help {
            topic: Some(command),
        });
    }

    if command == "skills" || command == "skill" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let subcommand = args.first().map(String::as_str).unwrap_or("list");
        match subcommand {
            "list" => {
                if !args.is_empty() {
                    args.remove(0);
                }
                remove_json_flags(&mut args, &mut json_output);
                if let Some(extra) = args.first() {
                    bail!("unsupported skills list option: {extra}");
                }
                return Ok(LocalCommand::SkillsList { json: json_output });
            }
            "cat" | "get" => {
                let verb = subcommand.to_string();
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                if args.first().is_some_and(|arg| arg == "--all") {
                    args.remove(0);
                    remove_json_flags(&mut args, &mut json_output);
                    while args.first().is_some_and(|arg| arg == "--full") {
                        args.remove(0);
                        remove_json_flags(&mut args, &mut json_output);
                    }
                    if let Some(extra) = args.first() {
                        bail!("unsupported skills {verb} option: {extra}");
                    }
                    return Ok(LocalCommand::SkillsCatAll { json: json_output });
                }
                let Some(name) = args.first().cloned() else {
                    bail!("invalid_args: skills {verb} requires <name>");
                };
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                while args.first().is_some_and(|arg| arg == "--full") {
                    args.remove(0);
                    remove_json_flags(&mut args, &mut json_output);
                }
                if let Some(extra) = args.first() {
                    bail!("unsupported skills {verb} option: {extra}");
                }
                return Ok(LocalCommand::SkillsCat {
                    name,
                    json: json_output,
                });
            }
            other if other.starts_with('-') => bail!("unsupported skills option: {other}"),
            other => bail!("unsupported skills command: {other}; try `pire-browser skills list`"),
        }
    }

    if command == "install" {
        args.remove(0);
        let mut firefox_path = None;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--firefox-path" => {
                    i += 1;
                    let Some(path) = args.get(i).cloned() else {
                        bail!("--firefox-path requires a path");
                    };
                    firefox_path = Some(path);
                }
                other => bail!("unsupported install option: {other}"),
            }
            i += 1;
        }
        return Ok(LocalCommand::Setup {
            windows: false,
            firefox_path,
        });
    }

    if command == "setup" {
        args.remove(0);
        let mut windows = false;
        let mut firefox_path = None;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--windows" => windows = true,
                "--firefox-path" => {
                    i += 1;
                    let Some(path) = args.get(i).cloned() else {
                        bail!("--firefox-path requires a path");
                    };
                    firefox_path = Some(path);
                }
                other => bail!("unsupported setup option: {other}"),
            }
            i += 1;
        }
        return Ok(LocalCommand::Setup {
            windows,
            firefox_path,
        });
    }

    if command == "launch" {
        args.remove(0);
        let mut profile = "Default".to_string();
        let mut url = None;
        let mut firefox_path = None;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--profile" => {
                    i += 1;
                    let Some(value) = args.get(i).cloned() else {
                        bail!("--profile requires a value");
                    };
                    profile = value;
                }
                "--url" => {
                    i += 1;
                    let Some(value) = args.get(i).cloned() else {
                        bail!("--url requires a value");
                    };
                    url = Some(value);
                }
                "--firefox-path" => {
                    i += 1;
                    let Some(path) = args.get(i).cloned() else {
                        bail!("--firefox-path requires a path");
                    };
                    firefox_path = Some(path);
                }
                other => bail!("unsupported launch option: {other}"),
            }
            i += 1;
        }
        return Ok(LocalCommand::Launch {
            profile: profile_name_from_profile_value(&profile)?,
            url,
            firefox_path,
            domain_policy,
            action_policy,
            confirmation_policy,
        });
    }

    if command == "mcp" {
        args.remove(0);
        let mut tools = "core".to_string();
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--tools" => {
                    i += 1;
                    let Some(value) = args.get(i).cloned() else {
                        bail!("--tools requires a profile name");
                    };
                    tools = value;
                }
                other => bail!("unsupported mcp option: {other}"),
            }
            i += 1;
        }
        return Ok(LocalCommand::Mcp { tools });
    }

    if command == "install-status" || command == "doctor" {
        let doctorish = command.clone();
        args.remove(0);
        let mut fix = false;
        while let Some(arg) = args.first() {
            match arg.as_str() {
                "--json" => {
                    args.remove(0);
                    json_output = true;
                }
                "--offline" | "--quick" => {
                    args.remove(0);
                }
                "--fix" => {
                    args.remove(0);
                    fix = true;
                }
                other => bail!("unsupported {doctorish} option: {other}"),
            }
        }
        if fix {
            return Ok(LocalCommand::DoctorFix { json: json_output });
        }
        return Ok(LocalCommand::InstallStatus {
            json: json_output,
            domain_policy,
            action_policy,
            confirmation_policy,
        });
    }

    if command == "session" || command == "sessions" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let subcommand = args.first().map(String::as_str).unwrap_or("list");
        match subcommand {
            "list" => {
                if !args.is_empty() {
                    args.remove(0);
                }
                remove_json_flags(&mut args, &mut json_output);
                if let Some(extra) = args.first() {
                    bail!("unsupported session list option: {extra}");
                }
                return Ok(LocalCommand::SessionList { json: json_output });
            }
            "attach" => {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                let Some(session) = args.first().cloned() else {
                    bail!("session attach requires a session id");
                };
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                if let Some(extra) = args.first() {
                    bail!("unsupported session attach option: {extra}");
                }
                return Ok(LocalCommand::SessionAttach {
                    session,
                    json: json_output,
                });
            }
            "cleanup" => {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                if let Some(extra) = args.first() {
                    bail!("unsupported session cleanup option: {extra}");
                }
                return Ok(LocalCommand::SessionCleanup { json: json_output });
            }
            other if other.starts_with('-') => bail!("unsupported session option: {other}"),
            other => bail!("unsupported session command: {other}; try `pire-browser session list`"),
        }
    }

    if command == "profiles" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        if let Some(extra) = args.first() {
            bail!("unsupported profiles option: {extra}");
        }
        return Ok(LocalCommand::ProfilesList { json: json_output });
    }

    if command == "status" && matches!(session_target, SessionTarget::Default) {
        args.remove(0);
        while let Some(arg) = args.first() {
            match arg.as_str() {
                "--json" => {
                    args.remove(0);
                    json_output = true;
                }
                other => bail!("unsupported status option: {other}"),
            }
        }
        return Ok(LocalCommand::Status {
            json: json_output,
            domain_policy,
            action_policy,
            confirmation_policy,
        });
    }

    if command == "state" {
        let original_args = args.clone();
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let subcommand = args.first().map(String::as_str);
        if matches!(
            subcommand,
            Some("list" | "show" | "rename" | "clear" | "clean")
        ) {
            let subcommand = args.remove(0);
            match subcommand.as_str() {
                "list" => {
                    while let Some(arg) = args.first().cloned() {
                        args.remove(0);
                        match arg.as_str() {
                            "--json" => json_output = true,
                            other => bail!("unsupported state list option: {other}"),
                        }
                    }
                    return Ok(LocalCommand::StateList {
                        json: json_output,
                        ignored_global_flags,
                    });
                }
                "show" => {
                    let path = parse_single_state_arg("show", &mut args, &mut json_output)?;
                    return Ok(LocalCommand::StateShow {
                        json: json_output,
                        ignored_global_flags,
                        path,
                    });
                }
                "rename" => {
                    let mut positional = Vec::new();
                    while let Some(arg) = args.first().cloned() {
                        args.remove(0);
                        match arg.as_str() {
                            "--json" => json_output = true,
                            other if other.starts_with('-') => {
                                bail!("unsupported state rename option: {other}")
                            }
                            _ => positional.push(arg),
                        }
                    }
                    if positional.len() != 2 {
                        bail!("invalid_args: state rename requires <old> <new>");
                    }
                    return Ok(LocalCommand::StateRename {
                        json: json_output,
                        ignored_global_flags,
                        old: positional.remove(0),
                        new: positional.remove(0),
                    });
                }
                "clear" => {
                    let mut name = None;
                    let mut all = false;
                    while let Some(arg) = args.first().cloned() {
                        args.remove(0);
                        match arg.as_str() {
                            "--json" => json_output = true,
                            "--all" => all = true,
                            other if other.starts_with('-') => {
                                bail!("unsupported state clear option: {other}")
                            }
                            _ => {
                                if name.is_some() {
                                    bail!("unsupported state clear option: {arg}");
                                }
                                name = Some(arg);
                            }
                        }
                    }
                    if all && name.is_some() {
                        bail!("invalid_args: cannot use state clear --all with a name");
                    }
                    if !all && name.is_none() {
                        bail!("invalid_args: state clear requires <name> or --all");
                    }
                    return Ok(LocalCommand::StateClear {
                        json: json_output,
                        ignored_global_flags,
                        name,
                        all,
                    });
                }
                "clean" => {
                    let mut older_than_days = None;
                    while let Some(arg) = args.first().cloned() {
                        args.remove(0);
                        match arg.as_str() {
                            "--json" => json_output = true,
                            "--older-than" => {
                                let Some(value) = args.first().cloned() else {
                                    bail!("invalid_args: state clean --older-than requires <days>");
                                };
                                args.remove(0);
                                let parsed = value.parse::<u64>().map_err(|_| {
                                    anyhow::anyhow!(
                                        "invalid_args: state clean --older-than must be a non-negative integer"
                                    )
                                })?;
                                older_than_days = Some(parsed);
                            }
                            other => bail!("unsupported state clean option: {other}"),
                        }
                    }
                    let Some(older_than_days) = older_than_days else {
                        bail!("invalid_args: state clean requires --older-than <days>");
                    };
                    return Ok(LocalCommand::StateClean {
                        json: json_output,
                        ignored_global_flags,
                        older_than_days,
                    });
                }
                _ => unreachable!(),
            }
        }
        if matches!(subcommand, Some("save" | "load" | "inspect")) {
            let subcommand = args.remove(0);
            let mut path = None;
            let mut record = false;
            let mut require_inspected = false;
            let mut no_require_inspected = false;
            while let Some(arg) = args.first().cloned() {
                args.remove(0);
                match arg.as_str() {
                    "--json" => json_output = true,
                    "--record" if subcommand == "inspect" => record = true,
                    "--record" => bail!("unsupported state {subcommand} option: --record"),
                    "--require-inspected" if subcommand == "load" => require_inspected = true,
                    "--require-inspected" => {
                        bail!("unsupported state {subcommand} option: --require-inspected")
                    }
                    "--no-require-inspected" if subcommand == "load" => no_require_inspected = true,
                    "--no-require-inspected" => {
                        bail!("unsupported state {subcommand} option: --no-require-inspected")
                    }
                    other if other.starts_with('-') => {
                        bail!("unsupported state {subcommand} option: {other}")
                    }
                    _ => {
                        if path.is_some() {
                            bail!("unsupported state {subcommand} option: {arg}");
                        }
                        path = Some(arg);
                    }
                }
            }
            if subcommand == "load" && require_inspected && no_require_inspected {
                bail!(
                    "invalid_args: cannot use --require-inspected and --no-require-inspected together"
                );
            }
            let Some(path) = path else {
                bail!("invalid_args: state {subcommand} requires <path>");
            };
            if subcommand == "save" {
                return Ok(LocalCommand::StateSave {
                    target: session_target,
                    json: json_output,
                    ignored_global_flags,
                    domain_policy,
                    action_policy,
                    confirmation_policy,
                    path,
                });
            }
            if subcommand == "inspect" {
                return Ok(LocalCommand::StateInspect {
                    json: json_output,
                    ignored_global_flags,
                    path,
                    record,
                });
            }
            let policy_flag = if require_inspected {
                StateLoadPolicyFlag::RequireInspected
            } else if no_require_inspected {
                StateLoadPolicyFlag::NoRequireInspected
            } else {
                StateLoadPolicyFlag::Unspecified
            };
            return Ok(LocalCommand::StateLoad {
                target: session_target,
                json: json_output,
                ignored_global_flags,
                domain_policy,
                action_policy,
                confirmation_policy,
                path,
                policy_flag,
            });
        }
        args = original_args;
    }

    if command == "download" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let (selector, path, timeout_ms) = parse_download_args(&mut args)?;
        return Ok(LocalCommand::Download {
            target: session_target,
            json: json_output,
            ignored_global_flags,
            domain_policy,
            action_policy,
            confirmation_policy,
            selector,
            path,
            timeout_ms,
        });
    }

    if command == "wait" && args.iter().any(|arg| arg == "--download") {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let (path, timeout_ms) = parse_wait_download_args(&mut args)?;
        return Ok(LocalCommand::WaitDownload {
            target: session_target,
            json: json_output,
            ignored_global_flags,
            domain_policy,
            action_policy,
            confirmation_policy,
            path,
            timeout_ms,
        });
    }

    if command == "upload" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let (selector, files) = parse_upload_args(&mut args)?;
        return Ok(LocalCommand::Upload {
            target: session_target,
            json: json_output,
            ignored_global_flags,
            domain_policy,
            action_policy,
            confirmation_policy,
            selector,
            files,
        });
    }

    if command == "confirm" || command == "deny" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let Some(id) = args.first().cloned() else {
            bail!("invalid_args: {command} requires <confirmation-id>");
        };
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        if let Some(extra) = args.first() {
            bail!("unsupported {command} option: {extra}");
        }
        return if command == "confirm" {
            Ok(LocalCommand::Confirm {
                id,
                json: json_output,
            })
        } else {
            Ok(LocalCommand::Deny {
                id,
                json: json_output,
            })
        };
    }

    if let Some(index) = args.iter().position(|arg| arg == "--json") {
        args.remove(index);
        json_output = true;
    }

    if matches!(command.as_str(), "close" | "quit" | "exit")
        && args.iter().any(|arg| arg == "--all")
    {
        if state_path.is_some() {
            bail!("invalid_args: --state cannot be combined with close --all");
        }
        args.remove(0);
        let mut all = false;
        while let Some(arg) = args.first().cloned() {
            args.remove(0);
            match arg.as_str() {
                "--all" => all = true,
                "--json" => json_output = true,
                other => bail!("unsupported {command} option: {other}"),
            }
        }
        if !all {
            bail!("invalid_args: {command} --all requires --all");
        }
        return Ok(LocalCommand::CloseAll {
            json: json_output,
            ignored_global_flags,
        });
    }

    if matches!(command.as_str(), "close" | "quit" | "exit") {
        if state_path.is_some() {
            bail!("invalid_args: --state cannot be combined with {command}");
        }
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        if let Some(extra) = args.first() {
            bail!("unsupported {command} option: {extra}");
        }
        return Ok(LocalCommand::CloseOne {
            target: session_target,
            json: json_output,
            ignored_global_flags,
        });
    }

    if let Some(path) = state_path {
        return Ok(LocalCommand::StateShortcut {
            target: session_target,
            json: json_output,
            ignored_global_flags,
            domain_policy,
            action_policy,
            confirmation_policy,
            path,
            args,
        });
    }

    Ok(LocalCommand::Remote {
        target: session_target,
        json: json_output,
        ignored_global_flags,
        domain_policy,
        action_policy,
        confirmation_policy,
        args,
    })
}

fn set_session_id_or_name(
    session_id: &mut Option<String>,
    session_name: &mut Option<String>,
    value: String,
) -> Result<()> {
    if session_id.is_some() || session_name.is_some() {
        bail!("--session was provided more than once or mixed with --session-name");
    }
    if looks_like_session_id(&value) {
        *session_id = Some(value);
    } else {
        *session_name = Some(value);
    }
    Ok(())
}

fn looks_like_session_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (index, byte) in bytes.iter().enumerate() {
        let expected_dash = matches!(index, 8 | 13 | 18 | 23);
        if expected_dash {
            if *byte != b'-' {
                return false;
            }
        } else if !byte.is_ascii_hexdigit() {
            return false;
        }
    }
    true
}

fn set_session_name(
    session_id: &Option<String>,
    session_name: &mut Option<String>,
    value: String,
) -> Result<()> {
    if session_id.is_some() {
        bail!("cannot use --session and --session-name together");
    }
    if session_name.is_some() {
        bail!("--session-name was provided more than once");
    }
    *session_name = Some(value);
    Ok(())
}

fn set_profile_name(
    session_id: &Option<String>,
    session_name: &mut Option<String>,
    value: String,
) -> Result<()> {
    if session_id.is_some() {
        bail!("cannot use --profile with a strict --session <id> target");
    }
    *session_name = Some(profile_name_from_profile_value(&value)?);
    Ok(())
}

fn set_global_state_path(state_path: &mut Option<String>, value: String) -> Result<()> {
    if state_path.is_some() {
        bail!("--state was provided more than once");
    }
    if value.trim().is_empty() {
        bail!("invalid_args: --state requires a non-empty path");
    }
    *state_path = Some(value);
    Ok(())
}

fn profile_name_from_profile_value(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        bail!("invalid_args: --profile requires a non-empty value");
    }
    let candidate = if profile_value_is_path_like(value) {
        let base = value
            .trim_end_matches(['/', '\\'])
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or(value);
        let sanitized = sanitize_profile_component(base);
        let hash = short_stable_hash(value);
        format!("{sanitized}-{hash}")
    } else {
        value.to_string()
    };
    validate_managed_profile_name(&candidate)?;
    Ok(candidate)
}

fn profile_value_is_path_like(value: &str) -> bool {
    value.starts_with("~/")
        || value.starts_with("~\\")
        || value.starts_with("./")
        || value.starts_with(".\\")
        || value.starts_with("../")
        || value.starts_with("..\\")
        || value.starts_with('/')
        || value.starts_with('\\')
        || value.contains('/')
        || value.contains('\\')
        || value
            .as_bytes()
            .get(1)
            .copied()
            .map(|byte| byte == b':')
            .unwrap_or(false)
}

fn sanitize_profile_component(value: &str) -> String {
    let mut sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, ' ' | '_' | '-' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim()
        .trim_matches('-')
        .to_string();
    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        sanitized = "profile".to_string();
    }
    sanitized
}

fn short_stable_hash(value: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:08x}", hash as u32)
}

fn validate_managed_profile_name(profile_name: &str) -> Result<()> {
    if profile_name.is_empty() || profile_name.trim() != profile_name {
        bail!("invalid_args: profile name must be non-empty and must not have leading or trailing whitespace");
    }
    if profile_name == "." || profile_name == ".." {
        bail!("invalid_args: profile name must be a simple managed profile name, not a path");
    }
    if !profile_name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, ' ' | '_' | '-' | '.'))
    {
        bail!("invalid_args: profile name may contain only letters, numbers, internal spaces, `_`, `-`, and `.`");
    }
    Ok(())
}

fn session_target_from_flags(
    session_id: Option<String>,
    session_name: Option<String>,
) -> SessionTarget {
    if let Some(session_id) = session_id {
        SessionTarget::Id(session_id)
    } else if let Some(session_name) = session_name {
        SessionTarget::Name(session_name)
    } else {
        SessionTarget::Default
    }
}

fn set_allowed_domains(policy: &mut DomainPolicyArgs, value: String) -> Result<()> {
    if policy.no_allowed_domains {
        bail!("invalid_args: cannot use --allowed-domains and --no-allowed-domains together");
    }
    if policy.allowed_domains.is_some() {
        bail!("--allowed-domains was provided more than once");
    }
    policy.allowed_domains = Some(value);
    Ok(())
}

fn set_no_allowed_domains(policy: &mut DomainPolicyArgs) -> Result<()> {
    if policy.allowed_domains.is_some() {
        bail!("invalid_args: cannot use --allowed-domains and --no-allowed-domains together");
    }
    if policy.no_allowed_domains {
        bail!("--no-allowed-domains was provided more than once");
    }
    policy.no_allowed_domains = true;
    Ok(())
}

fn set_action_policy(policy: &mut ActionPolicyArgs, value: String) -> Result<()> {
    if policy.action_policy_path.is_some() {
        bail!("--action-policy was provided more than once");
    }
    policy.action_policy_path = Some(value);
    Ok(())
}

fn set_confirm_actions(policy: &mut ConfirmationPolicyArgs, value: String) -> Result<()> {
    if policy.confirm_actions.is_some() {
        bail!("--confirm-actions was provided more than once");
    }
    policy.confirm_actions = Some(value);
    Ok(())
}

fn is_help_flag(arg: &str) -> bool {
    arg == "--help" || arg == "-h"
}

fn remove_json_flags(args: &mut Vec<String>, json_output: &mut bool) {
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--json" {
            args.remove(i);
            *json_output = true;
        } else {
            i += 1;
        }
    }
}

fn parse_single_state_arg(
    subcommand: &str,
    args: &mut Vec<String>,
    json_output: &mut bool,
) -> Result<String> {
    let mut path = None;
    while let Some(arg) = args.first().cloned() {
        args.remove(0);
        match arg.as_str() {
            "--json" => *json_output = true,
            other if other.starts_with('-') => {
                bail!("unsupported state {subcommand} option: {other}")
            }
            _ => {
                if path.is_some() {
                    bail!("unsupported state {subcommand} option: {arg}");
                }
                path = Some(arg);
            }
        }
    }
    path.ok_or_else(|| anyhow::anyhow!("invalid_args: state {subcommand} requires <path>"))
}

fn parse_download_args(args: &mut Vec<String>) -> Result<(String, String, u64)> {
    let mut selector = None;
    let mut path = None;
    let mut timeout_ms = DOWNLOAD_TIMEOUT_MS;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--json" => {
                args.remove(i);
                continue;
            }
            "--timeout" => {
                i += 1;
                let Some(value) = args.get(i) else {
                    bail!("--timeout requires a value");
                };
                timeout_ms = parse_positive_timeout(value)?;
            }
            other if other.starts_with('-') => bail!("unsupported download option: {other}"),
            _ => {
                if selector.is_none() {
                    selector = Some(args[i].clone());
                } else if path.is_none() {
                    path = Some(args[i].clone());
                } else {
                    bail!("unsupported download option: {}", args[i]);
                }
            }
        }
        i += 1;
    }
    let Some(selector) = selector else {
        bail!("invalid_args: download requires <target>");
    };
    let Some(path) = path else {
        bail!("invalid_args: download requires <path>");
    };
    Ok((selector, path, timeout_ms))
}

fn parse_wait_download_args(args: &mut Vec<String>) -> Result<(Option<String>, u64)> {
    let mut saw_download = false;
    let mut path = None;
    let mut timeout_ms = DOWNLOAD_TIMEOUT_MS;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--json" => {
                args.remove(i);
                continue;
            }
            "--download" => saw_download = true,
            "--timeout" => {
                i += 1;
                let Some(value) = args.get(i) else {
                    bail!("--timeout requires a value");
                };
                timeout_ms = parse_positive_timeout(value)?;
            }
            other if other.starts_with('-') => bail!("unsupported wait --download option: {other}"),
            _ => {
                if path.is_some() {
                    bail!("unsupported wait --download option: {}", args[i]);
                }
                path = Some(args[i].clone());
            }
        }
        i += 1;
    }
    if !saw_download {
        bail!("invalid_args: wait download handler requires --download");
    }
    Ok((path, timeout_ms))
}

fn parse_upload_args(args: &mut Vec<String>) -> Result<(String, Vec<String>)> {
    let mut selector = None;
    let mut files = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--json" => {
                args.remove(i);
                continue;
            }
            other if other.starts_with('-') => bail!("unsupported upload option: {other}"),
            _ => {
                if selector.is_none() {
                    selector = Some(args[i].clone());
                } else {
                    files.push(args[i].clone());
                }
            }
        }
        i += 1;
    }
    let Some(selector) = selector else {
        bail!("invalid_args: upload requires <target>");
    };
    if files.is_empty() {
        bail!("invalid_args: upload requires at least one file");
    }
    Ok((selector, files))
}

fn parse_positive_timeout(value: &str) -> Result<u64> {
    let timeout = value
        .parse::<u64>()
        .map_err(|_| anyhow::anyhow!("invalid_args: --timeout must be a positive integer"))?;
    if timeout == 0 {
        bail!("invalid_args: --timeout must be a positive integer");
    }
    Ok(timeout)
}

fn ignored_with_warning_global_flag(flag: &str) -> bool {
    matches!(flag, "--headed" | "--headless")
}

pub fn help_text(topic: Option<&str>) -> Option<String> {
    let text = match topic.unwrap_or("").to_ascii_lowercase().as_str() {
        "" => TOP_LEVEL_HELP,
        "status" => STATUS_HELP,
        "doctor" | "install-status" => DOCTOR_HELP,
        "config" | "--config" => CONFIG_HELP,
        "install" => INSTALL_HELP,
        "open" | "goto" | "navigate" => OPEN_HELP,
        "snapshot" => SNAPSHOT_HELP,
        "pdf" => PDF_HELP,
        "diff" => DIFF_HELP,
        "find" => FIND_HELP,
        "click" => CLICK_HELP,
        "fill" => FILL_HELP,
        "wait" => WAIT_HELP,
        "pushstate" => PUSHSTATE_HELP,
        "console" => CONSOLE_HELP,
        "errors" => ERRORS_HELP,
        "network" => NETWORK_HELP,
        "vitals" => VITALS_HELP,
        "highlight" => HIGHLIGHT_HELP,
        "set" => SET_HELP,
        "mouse" => MOUSE_HELP,
        "drag" => DRAG_HELP,
        "batch" => BATCH_HELP,
        "addinitscript" | "removeinitscript" | "init-scripts" => INIT_SCRIPTS_HELP,
        "download" => DOWNLOAD_HELP,
        "upload" => UPLOAD_HELP,
        "clipboard" => CLIPBOARD_HELP,
        "auth" => AUTH_HELP,
        "state" => STATE_HELP,
        "action-policy" => ACTION_POLICY_HELP,
        "confirmation" | "confirm" | "deny" | "confirm-actions" => CONFIRMATION_HELP,
        "session" | "sessions" => SESSION_HELP,
        "profiles" => PROFILES_HELP,
        "screenshot" => SCREENSHOT_HELP,
        "tabs" | "tab" => TABS_HELP,
        "window" => WINDOW_HELP,
        "close" | "quit" | "exit" => CLOSE_HELP,
        "setup" => SETUP_HELP,
        "launch" => LAUNCH_HELP,
        "mcp" => MCP_HELP,
        "skills" | "skill" => SKILLS_HELP,
        _ => return None,
    };
    Some(text.trim().to_string())
}

const TOP_LEVEL_HELP: &str = r##"
pire-browser controls the user's Firefox browser through a local WebExtension.

Usage:
  pire-browser <command> [args]
  pire-browser help [topic]
  pire-browser <command> --help

Common commands:
  status [--json]                 Show live Firefox sessions and default target
  install [--firefox-path <path>]  Register the Firefox Native Messaging host
  doctor [--json] [--offline]     Check setup health and PATH/install hints
  mcp [--tools core|all]          Start the MCP stdio server
  --config ./ci-config.json open <url>
  open <url> [--label <name>]      Open a URL, auto-launching Firefox if needed
  open <url> --headers '{"Authorization":"Bearer token"}'
  --allow-file-access open file:///path/to/page.html
  snapshot -i                     Inspect the active page and print refs
  diff snapshot                    Compare current snapshot to previous
  diff screenshot --baseline before.png Compare current screenshot to baseline
  diff url <url1> <url2>           Compare two URLs by snapshot
  click '@e4'                     Click a ref from snapshot/find output
  fill '@e2' "text"               Fill a ref from snapshot/find output
  find label "Email" fill "x@y"   Find by semantic locator and act
  wait --selector "#done"         Wait for page state
  pushstate /dashboard            SPA client-side navigation in active page
  console                         Show recent page console messages
  errors                          Show recent page errors
  network requests                Show recent page network requests
  network har network.har         Export recent request metadata as HAR
  network route "**/api/**" --body '{}' Mock or block active-tab requests
  vitals [url]                    Measure best-effort Web Vitals for a page
  highlight '#submit'             Draw a visible overlay around a target
  set viewport 1280 720           Approximate the active page viewport
  mouse move 80 80                Dispatch page mouse events at viewport coords
  drag '@e1' '@e2'                Dispatch page drag/drop events
  batch "open <url>" "snapshot -i" Run multiple commands in one invocation
  addinitscript <js>              Register a document-start init script
  removeinitscript init1          Remove a runtime init script
  download '@e4' out.txt          Click a target and save a download
  wait --download out.txt         Wait for a recent/new download and save it
  upload '#file' ./fixture.txt    Assign a small local file to a file input
  auth login app                  Open a saved login form and submit it
  clipboard read                  Read text from the system clipboard
  skills list                     List installed agent skills
  skills cat core                 Print the version-matched core agent skill
  skills get core                 Agent-browser-style alias for skills cat core
  state save .pire-state/app.json Save active-origin cookies and web storage
  state list [--json]             List .pire-state files
  state inspect .pire-state/app.json
  state inspect --record .pire-state/app.json
  --action-policy ./policy.json snapshot
  --confirm-actions eval eval "document.title"
  confirm c_8f3a1234             Approve a pending confirmation
  deny c_8f3a1234                Deny a pending confirmation
  --allowed-domains "example.com" open <url>
  --content-boundaries snapshot   Mark page-sourced output boundaries
  --max-output 50000 get text body Cap emitted browser command text
  --session work open <url>       Reuse or launch a named Firefox profile
  --session-name work open <url>  Explicit named Firefox profile spelling
  --profile Work open <url>       Managed Firefox profile alias
  profiles [--json]               List managed Firefox profiles
  session list                    List live Firefox sessions
  screenshot out.png              Capture screenshot evidence
  pdf page.pdf                    Capture an image-backed PDF of the page
  tab new <url>                   Open a new tab and switch to it
  tabs list                       List tracked tabs
  window new                      Open a separate Firefox window
  close                           Close the targeted managed Firefox session
  close --all                     Close all live pire-browser sessions

PowerShell note:
  Quote refs such as '@e4' so PowerShell does not treat @ as syntax.
"##;

const STATUS_HELP: &str = r##"
Usage:
  pire-browser status [--json]

Shows live Firefox extension sessions, the session default commands will target,
the active page when Firefox has reported one, and advisory policy diagnostics.
"##;

const DOCTOR_HELP: &str = r##"
Usage:
  pire-browser doctor [--json] [--offline] [--quick]
  pire-browser install-status [--json]

Checks Firefox discovery, native messaging setup, extension build files, managed
profile state, live sessions, and CLI/PATH advisories. --offline and --quick are
accepted as no-op compatibility flags. Domain allowlist, action policy,
confirmation policy, and state policy entries are advisory diagnostics. --fix is
not implemented yet.
"##;

const CONFIG_HELP: &str = r##"
Usage:
  # from a project that has ./pire-browser.json
  pire-browser open https://example.com
  pire-browser --config ./ci-config.json open https://example.com
  PIRE_BROWSER_CONFIG=./ci-config.json pire-browser open https://example.com

Loads pire-browser JSON defaults before command parsing. Auto-discovered
configs are loaded from ~/.pire-browser/config.json and ./pire-browser.json
when present. Legacy config aliases are also accepted. Missing auto-discovered
files are ignored. Malformed auto-discovered files print a warning and
continue; explicit --config or PIRE_BROWSER_CONFIG paths must exist and contain
a JSON object.

Supported camelCase defaults include json, profile, sessionName, session, autoConnect, allowedDomains,
noAllowedDomains, actionPolicy, confirmActions, confirmInteractive,
allowFileAccess, headed, headless, colorScheme, maxOutput, contentBoundaries,
engine, provider, and model. CLI flags override config defaults. Unknown keys are ignored.
"##;

const OPEN_HELP: &str = r##"
Usage:
  pire-browser open <url> [--label <name>] [--new|--new-tab]
  pire-browser open <url> --headers '{"Authorization":"Bearer token"}'
  pire-browser open --init-script <path> <url>
  pire-browser --allow-file-access open file:///path/to/page.html
  pire-browser goto <url>
  pire-browser navigate <url>

Opens a page in the default session, auto-launching managed Firefox when needed.
`--new` and `--new-tab` open a new tab in the current managed Firefox window;
for a separate Firefox window, run `pire-browser window new` first, then open
the URL.
`--allow-file-access` supports opening local HTML file URLs. PDF local-file
behavior is not supported yet.
`--headers <json>` applies request headers to the target URL's origin for the
current managed Firefox session. Values are not echoed; output reports header
names only. Headers are not applied to different origins.
Use `--profile <name-or-path>`, `--session <name>`, or `--session-name <name>`
before the command to reuse or launch a named managed Firefox profile. Path-like
`--profile` values are mapped to stable managed Firefox profile names instead
of using the path as a raw browser profile directory. Use `--allowed-domains "example.com,*.example.com"` or
PIRE_BROWSER_ALLOWED_DOMAINS for a cooperative wrong-site guardrail.
`--init-script <path>` may be repeated and registers Firefox document-start
scripts for that navigation in the managed Firefox session.
"##;

const SNAPSHOT_HELP: &str = r##"
Usage:
  pire-browser snapshot -i
  pire-browser snapshot -i -c
  pire-browser snapshot -d 3
  pire-browser snapshot -i -c -d 5
  pire-browser snapshot -i -u
  pire-browser snapshot -s "#main"
  pire-browser snapshot --json

Prints a page snapshot with refs such as @e1. `-i` keeps the output ref-oriented
for interaction. `-c`/`--compact` suppresses low-value generic elements,
`-d`/`--depth` limits DOM depth in the Firefox snapshot model, `-u`/`--urls`
includes link URLs, and `-s` scopes to a CSS selector. Use quoted refs in
PowerShell, for example: pire-browser click '@e1'.
"##;

const PDF_HELP: &str = r##"
Usage:
  pire-browser pdf <path>
  pire-browser pdf <path> --viewport
  pire-browser pdf <path> --json

Captures the active page as a PDF file. The Firefox backend uses a full-page
screenshot by default and embeds that image into a one-page PDF, avoiding
Firefox's native save-as dialog. Pass `--viewport` to capture only the visible
viewport. The resulting PDF is suitable for visual evidence, but text is not
selectable and print CSS is not applied.
"##;

const DIFF_HELP: &str = r##"
Usage:
  pire-browser diff snapshot [--json]
  pire-browser diff snapshot --baseline before.txt [--json]
  pire-browser diff snapshot --selector "#main" --compact [--json]
  pire-browser diff screenshot --baseline before.png [--json]
  pire-browser diff screenshot --baseline before.png after.png [--json]
  pire-browser diff screenshot --baseline before.png -o diff.png
  pire-browser diff screenshot --baseline before.png -t 0.2
  pire-browser diff url https://v1.example https://v2.example [--json]
  pire-browser diff url https://v1.example https://v2.example --screenshot
  pire-browser diff url https://v1.example https://v2.example --wait-until networkidle
  pire-browser diff url https://v1.example https://v2.example --selector "#main" --compact

Compares a fresh active-page snapshot against the previous snapshot captured in
the active tab, or against a local baseline text file when `--baseline` is
provided. `--selector` scopes the snapshot before diffing, and `--compact`
uses the same compact snapshot filtering as `snapshot -i -c`.

`diff screenshot` compares a baseline image to a freshly captured current
screenshot, or to an explicit current image path. `-o`/`--output` writes a red
pixel-diff image. `-t`/`--threshold` accepts a 0-1 per-channel color threshold.

`diff url` opens the first URL, captures an interactive snapshot baseline, opens
the second URL, and compares the new snapshot against that baseline. Add
`--screenshot` to also capture both pages and include a pixel comparison.
"##;

const FIND_HELP: &str = r##"
Usage:
  pire-browser find role button --name "Submit"
  pire-browser find text "Save" --exact
  pire-browser find label "Email" fill "hello@example.com"
  pire-browser find text "Continue" click

Finds elements by supported selector families and can optionally perform an
action on the single match. Use `--exact` for whole normalized text/name
matching instead of substring matching.
"##;

const CLICK_HELP: &str = r##"
Usage:
  pire-browser click '@e4'
  pire-browser click "#submit"

Clicks a ref or selector. If a ref is stale, rerun snapshot -i or find.
"##;

const FILL_HELP: &str = r##"
Usage:
  pire-browser fill '@e2' "hello"
  pire-browser fill "input[name=email]" "hello@example.com"

Fills a ref or selector. Quote refs in PowerShell, for example '@e2'.
"##;

const WAIT_HELP: &str = r##"
Usage:
  pire-browser wait 1000
  pire-browser wait '@e1'
  pire-browser wait --selector "#done" --timeout 5000
  pire-browser wait --text "Saved"
  pire-browser wait --url "**/dashboard"
  pire-browser wait --load networkidle
  pire-browser wait --download out.txt --timeout 60000

Waits for a millisecond duration, ref, selector, text, URL pattern, function,
load state, or download. `--load networkidle` waits for document completion and
then for Firefox WebRequest activity in the active tab to stay quiet briefly.
Positional refs and selectors use the same locator handling as click/fill. Quote
refs in PowerShell, for example: pire-browser wait '@e1'.
"##;

const PUSHSTATE_HELP: &str = r##"
Usage:
  pire-browser pushstate <url-or-path>

Performs SPA client-side navigation in the active page.
The command first tries `window.next.router.push(...)` when a Next.js router is
available, then falls back to `history.pushState(...)` plus page navigation
events. The target must resolve to the active page's current origin. Run
`pire-browser snapshot -i` or `pire-browser wait --url` after pushstate to
verify the new route.
"##;

const CONSOLE_HELP: &str = r##"
Usage:
  pire-browser console [--json]
  pire-browser console --clear [--json]

Shows recent console messages captured from the active page and reachable frames.
The Firefox WebExtension backend captures page-world console.log/info/warn/error/debug
messages after the pire-browser content script loads. `--clear` clears the captured
console buffer for the current page context.
"##;

const ERRORS_HELP: &str = r##"
Usage:
  pire-browser errors [--json]
  pire-browser errors --clear [--json]

Shows recent page errors captured from the active page and reachable frames,
including `window.onerror` and unhandled promise rejections. `--clear` clears the
captured page-error buffer for the current page context.
"##;

const NETWORK_HELP: &str = r##"
Usage:
  pire-browser network requests [--json]
  pire-browser network requests --filter <pattern> [--type xhr,fetch] [--method POST] [--status 2xx]
  pire-browser network requests --clear [--json]
  pire-browser network request <requestId> [--json]
  pire-browser network har start [--json]
  pire-browser network har stop [output.har] [--json]
  pire-browser network har [path] [--filter <pattern>] [--json]
  pire-browser network export-har <path> [--json]
  pire-browser network route <pattern> [--json]
  pire-browser network route <pattern> --body <json-or-text> [--content-type <mime>] [--json]
  pire-browser network route <pattern> --abort [--resource-type script,xhr] [--json]
  pire-browser network unroute [pattern-or-route-id] [--json]

Shows recent network requests captured from the active Firefox tab through the
WebExtension `webRequest` API. `network` is an alias for `network requests`.
Filters are best-effort: URL substring/glob, resource
type, HTTP method, and status (`200`, `2xx`, or `400-499`).

Route rules are active-tab scoped. They can mark pass-through requests, abort
matching requests, or mock with a simple body redirect. Use `network unroute`
before returning to normal behavior. `network har start` and `network har stop`
match agent-browser's recording loop; `network har [path]` exports currently
captured records directly. HAR output is metadata-only from WebExtension request
records; request/response bodies, cookies, and raw headers are not captured.
Full CDP-style response control is not supported on the Firefox WebExtension
backend.
"##;

const VITALS_HELP: &str = r##"
Usage:
  pire-browser vitals
  pire-browser vitals https://example.com
  pire-browser vitals --json

Measures best-effort page performance signals from Firefox Performance APIs:
TTFB, FCP, LCP, CLS, INP, DOMContentLoaded, load, readyState, and hydration
warnings seen in captured console/page-error records. Some Chrome Web Vitals
entries may be unavailable in Firefox; unavailable metrics are reported
explicitly instead of estimated.
"##;

const HIGHLIGHT_HELP: &str = r##"
Usage:
  pire-browser highlight <target> [--json]

Draws a visible overlay around a target in the active page. Targets use the same
refs and selectors as `click` and `fill`, including refs from the latest
`snapshot -i` or `find` output, CSS selectors, `text=...`, and `xpath=...`.
Use this before `screenshot` when you need to show the user exactly which
element the agent is inspecting or about to act on.
"##;

const SET_HELP: &str = r##"
Usage:
  pire-browser set viewport <w> <h> [scale]
  pire-browser set device "iPhone 14"
  pire-browser set headers <json>
  pire-browser set media dark|light|auto

Resizes the active Firefox window to approximate a requested content
viewport, then reports the requested size plus measured page innerWidth and
innerHeight. Firefox WebExtensions cannot enforce deviceScaleFactor or exact
CDP viewport metrics; `scale` is accepted and reported with a best-effort
warning.

`set device <name>` applies a best-effort preset viewport for common devices
such as iPhone 14, iPhone 15 Pro, Pixel 7, Galaxy S22, and iPad. User-Agent,
touch, mobile browser chrome, and exact deviceScaleFactor are reported but not
enforced on the Firefox backend.

`set headers <json>` applies request headers to the active page's origin for the
current managed Firefox session. Passing `{}` clears headers for that origin.
Values are not echoed; output reports header names only.

`set media dark|light|auto` applies Firefox's webpage content color-scheme
override for the managed session. Geolocation, offline, and credentials
settings are not supported on this backend.
"##;

const MOUSE_HELP: &str = r##"
Usage:
  pire-browser mouse move <x> <y>
  pire-browser mouse down [left|middle|right]
  pire-browser mouse up [left|middle|right]
  pire-browser mouse wheel <dy> [dx]

Dispatches page-level mouse events at viewport coordinates in the active page.
This is a Firefox WebExtension compatibility path, not native OS mouse control.
"##;

const DRAG_HELP: &str = r##"
Usage:
  pire-browser drag <src> <dst>

Dispatches same-frame page-level pointer, mouse, dragstart, dragenter,
dragover, drop, and dragend events. This is a Firefox WebExtension
compatibility path, not native OS drag control.
"##;

const BATCH_HELP: &str = r##"
Usage:
  pire-browser batch "open <url>" "snapshot -i" "screenshot out.png"
  pire-browser batch --bail "open <url>" "click '@e1'" "screenshot out.png"
  echo '[["open","https://example.com"],["snapshot","-i"]]' | pire-browser batch --json

Runs multiple browser commands in one invocation. `--bail` stops and returns the
first command error. With no inline commands, `batch` reads a JSON array from
stdin; each entry may be a command string or an array of args.
"##;

const INIT_SCRIPTS_HELP: &str = r##"
Usage:
  pire-browser addinitscript <js>
  pire-browser removeinitscript <identifier>
  pire-browser open --init-script <path> <url>

Registers JavaScript to run at document_start for future navigations in the
current managed Firefox session. Runtime registrations return an identifier
such as init1 that can be passed to removeinitscript. This is a best-effort
Firefox WebExtension compatibility path.
"##;

const DOWNLOAD_HELP: &str = r##"
Usage:
  pire-browser download <target> <path> [--timeout <ms>]
  pire-browser wait --download [path] [--timeout <ms>]

Clicks a ref/selector to trigger a Firefox download, or waits for a recent/new
download. The default timeout is 60000ms. Files are staged under the local
pire-browser data directory before being finalized to the requested path.
Unknown MIME/helper-app dialogs can still stall until timeout on Firefox.
"##;

const UPLOAD_HELP: &str = r##"
Usage:
  pire-browser upload <target> <file> [more-files...] [--json]

Assigns small local files to a targeted input[type=file] or associated label in
the active Firefox page. V1 reads files in the CLI and sends them to the
extension as text-safe payloads, capped at 512 KiB total raw bytes.
No native OS file picker, directory upload, drag/drop upload, or large-file
chunking is implemented.
"##;

const CLIPBOARD_HELP: &str = r##"
Usage:
  pire-browser clipboard read
  pire-browser clipboard write "hello"
  pire-browser clipboard copy
  pire-browser clipboard paste

Reads and writes text clipboard contents through the Firefox extension.
copy and paste use the active page selection or focused editable element and
return a best-effort warning because native Ctrl+C/Ctrl+V handlers are not run.
"##;

const AUTH_HELP: &str = r##"
Usage:
  pire-browser auth save <name> --url <url> --username <user> --password <pass>
  pire-browser auth save <name> --url <url> --username <user> --password <pass> --username-selector <sel> --password-selector <sel> --submit-selector <sel>
  pire-browser auth login <name>
  pire-browser auth list
  pire-browser auth show <name>
  pire-browser auth delete <name>

Stores a best-effort local auth profile in the managed Firefox profile, then
opens the URL, fills username/password selectors, and clicks the submit selector
on login. Passwords are not printed by list/show output. This is not
a full encrypted auth vault.
"##;

const STATE_HELP: &str = r##"
Usage:
  pire-browser state inspect ./.pire-state/example.com-review.json
  pire-browser state inspect --record ./.pire-state/example.com-review.json
  pire-browser state list [--json]
  pire-browser state show <file-or-name> [--json]
  pire-browser state rename <old> <new>
  pire-browser state clear <name>
  pire-browser state clear --all
  pire-browser state clean --older-than <days>
  pire-browser state save ./.pire-state/example.com-review.json
  pire-browser state load ./.pire-state/example.com-review.json
  pire-browser state load --require-inspected ./.pire-state/example.com-review.json
  pire-browser state load --no-require-inspected ./.pire-state/example.com-review.json
  pire-browser --session-name work state save ./.pire-state/example.com-work.json
  pire-browser --session-name work state load ./.pire-state/example.com-work.json
  pire-browser --auto-connect state save ./.pire-state/example.com-work.json
  pire-browser --state ./.pire-state/example.com-work.json open https://example.com/dashboard

Saves, loads, lists, renames, clears, or inspects plaintext active-origin state
for the targeted Firefox page: cookies, localStorage, and sessionStorage. State
files contain secrets and should not be committed or shared. `state show` and
`state inspect` are metadata-only; they do not print cookie or storage values.
Management commands operate on `.pire-state` for bare names.
Use `state inspect --record` before `state load --require-inspected` for an
opt-in 24-hour local receipt gate stored outside the repo under the OS app-data
directory.
Set PIRE_BROWSER_REQUIRE_INSPECTED_STATE=1 to make normal `state load` require
that receipt; use `--no-require-inspected` only as an explicit cooperative
operator override.
`--session <uuid>` is strict live-id targeting. `--session <name> state load`
or `--session-name <name> state load` can launch that managed profile at the
saved display URL when no live named session exists. `--auto-connect state save`
saves from the selected live managed Firefox session. `--state <path> <command>`
preloads saved active-origin state before the requested browser command. Active
domain allowlists also check the saved state origin.
"##;

const ACTION_POLICY_HELP: &str = r##"
Usage:
  pire-browser --action-policy ./policy.json <command>

Action policy files use the upstream v1 shape:
  { "default": "allow", "deny": ["eval"] }
  { "default": "deny", "allow": ["navigate", "snapshot", "get"] }

Supported fields are default, allow, and deny. Confirmation is not part of the
policy file; use --confirm-actions or PIRE_BROWSER_CONFIRM_ACTIONS for V1
confirmation prompts/records.
PIRE_BROWSER_ACTION_POLICY can point at a policy file for all commands in the
current environment.
"##;

const CONFIRMATION_HELP: &str = r##"
Usage:
  pire-browser --confirm-actions eval eval "document.title"
  pire-browser confirm c_8f3a1234
  pire-browser deny c_8f3a1234
  PIRE_BROWSER_CONFIRM_ACTIONS=eval pire-browser eval "document.title"

Confirmation records are short-lived, plaintext local metadata under the
user's pire-browser data directory. They expire after about 60 seconds. Use
--confirm-interactive only from a TTY; non-interactive runs auto-deny.
"##;

const SESSION_HELP: &str = r##"
Usage:
  pire-browser session list [--json]
  pire-browser session attach <id> [--json]
  pire-browser session cleanup [--json]
  pire-browser --session <uuid> snapshot -i
  pire-browser --session <name> open <url>
  pire-browser --session-name <name> open <url>
  pire-browser --profile <name-or-path> open <url>
  pire-browser --session-name <name> close

Lists live Firefox extension sessions, prints the `--session <id>` prefix for a
chosen session, or removes stale session files. `--session <uuid>` is strict
live-id targeting. `--session <name>` reuses a managed named Firefox profile;
`--session-name <name>` is the explicit named-profile spelling.
`--profile <name-or-path>` is an alias for a reusable managed
Firefox profile. Path-like profile values are converted to stable managed names.
Close targets an existing named session only. Profile names may contain letters,
numbers, internal spaces, `_`, `-`, and `.`.
"##;

const PROFILES_HELP: &str = r##"
Usage:
  pire-browser profiles [--json]

Lists managed Firefox profiles known to pire-browser, including the default
profile path, launch metadata, and any live session id. This is best-effort
Firefox profile management under the local pire-browser data directory.
Path-like `--profile` values are mapped to stable managed names rather than
used as raw browser profile paths.
"##;

const SCREENSHOT_HELP: &str = r##"
Usage:
  pire-browser screenshot
  pire-browser screenshot out.png
  pire-browser screenshot --screenshot-dir screenshots out.png
  pire-browser screenshot --screenshot-dir screenshots
  pire-browser screenshot --annotate annotated.png
  pire-browser screenshot --screenshot-format jpeg --screenshot-quality 80 out.jpg

Captures the visible viewport of the active Firefox tab by default. `--full`
scrolls and stitches the page into a full-document screenshot. `--annotate`
adds best-effort numbered element overlays before capture and removes them
afterwards. `--screenshot-dir` writes the explicit filename there, or generates
a timestamped filename in that directory when no filename is provided. Relative
paths resolve from the command's current working directory. With no path or
directory, screenshots are written under the local pire-browser data
`screenshots/` directory and the resolved path is printed.
"##;

const TABS_HELP: &str = r##"
Usage:
  pire-browser tab new <url> [--label <name>]
  pire-browser tab list
  pire-browser tabs list
  pire-browser tabs new <url> [--label <name>]
  pire-browser tabs select <tN-or-label>
  pire-browser tabs close <tN-or-label>
  pire-browser tabs label <tN> <label>

`tab` and `tabs` are aliases. Use this for new tabs inside the current managed
Firefox window.
"##;

const WINDOW_HELP: &str = r##"
Usage:
  pire-browser window new

Opens a separate Firefox window in the active managed session. To follow a user
request such as "open a new window and go to a site", run `pire-browser window
new`, then `pire-browser open <url>`.
"##;

const CLOSE_HELP: &str = r##"
Usage:
  pire-browser close [--json]
  pire-browser quit [--json]
  pire-browser exit [--json]
  pire-browser close --all [--json]

Closes the targeted managed Firefox session and removes its live session record.
Use `--session <id>`, `--session <name>`, `--session-name <name>`, or
`--profile <name>` to close a specific reusable profile. `quit` and `exit` are
aliases. `close --all` closes every live pire-browser managed session.
"##;

const INSTALL_HELP: &str = r##"
Usage:
  pire-browser install [--firefox-path <path>]

Alias for setup. Registers the Firefox Native Messaging host for the current
user. Use `pire-browser doctor` for read-only diagnostics.
"##;

const SETUP_HELP: &str = r##"
Usage:
  pire-browser setup [--firefox-path <path>]
  pire-browser setup --windows [--firefox-path <path>]

Registers the Firefox Native Messaging host for the current user. `--windows`
is a deprecated compatibility alias and is ignored on non-Windows platforms.
`pire-browser install` is a public alias for this setup step.
"##;

const LAUNCH_HELP: &str = r##"
Usage:
  pire-browser launch [--profile Default] [--url <url>] [--firefox-path <path>]

Starts the managed Firefox profile and waits for the extension to connect.
For reusable named command workflows, use `--profile <name-or-path> <command>`,
`--session <name> <command>`, or `--session-name <name> <command>`.
`launch --profile <name-or-path>` only starts or reuses the profile.
"##;

const MCP_HELP: &str = r##"
Usage:
  pire-browser mcp
  pire-browser mcp --tools core
  pire-browser mcp --tools all

Starts a Model Context Protocol server over stdio. The current public MCP
profile is `core`: open, inspect, interact, wait, capture screenshots, inspect
tabs/status, close sessions, and fetch installed skill guidance. `all` is
accepted as an alias for all currently available MCP tools.
"##;

const SKILLS_HELP: &str = r##"
Usage:
  pire-browser skills [list] [--json]
  pire-browser skills list [--json]
  pire-browser skills cat core [--json]
  pire-browser skills get core [--full] [--json]
  pire-browser skills get --all [--json]

Lists or prints installed agent skill guidance. `get` is an agent-browser-style
alias for `cat`; `--full` is accepted for compatibility because bundled skill
content is self-contained. The `skill` root is accepted as a compatibility alias,
but public docs prefer `skills`.
"##;

pub fn build_command_request(args: Vec<String>) -> RpcRequest {
    let invocation_cwd = env::current_dir()
        .ok()
        .map(|path| path.to_string_lossy().to_string());
    RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "command".to_string(),
        params: json!({ "args": args, "invocationCwd": invocation_cwd }),
    }
}

pub fn format_cli_result(value: &Value, json_output: bool) -> Result<String> {
    if json_output {
        let warnings = value
            .get("warnings")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()));
        return Ok(serde_json::to_string_pretty(&json!({
            "success": true,
            "data": value,
            "warnings": warnings
        }))?);
    }

    if let Some(text) = value.get("text").and_then(|v| v.as_str()) {
        return Ok(text.to_string());
    }

    Ok(serde_json::to_string_pretty(value)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    fn default_domain_policy() -> DomainPolicyArgs {
        DomainPolicyArgs::default()
    }

    fn default_action_policy() -> ActionPolicyArgs {
        ActionPolicyArgs::default()
    }

    fn default_confirmation_policy() -> ConfirmationPolicyArgs {
        ConfirmationPolicyArgs::default()
    }

    fn config_options(project_config: Option<PathBuf>) -> ConfigApplyOptions {
        ConfigApplyOptions {
            user_config: None,
            project_config,
            env_config: None,
            ..ConfigApplyOptions::default()
        }
    }

    #[test]
    fn applies_explicit_config_defaults_before_parsing() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("ci-config.json");
        fs::write(
            &config,
            r#"{
              "sessionName": "review",
              "profile": "ignored-profile",
              "allowedDomains": ["example.com", "*.example.com"],
              "json": true,
              "unknownFutureKey": "ignored"
            }"#,
        )
        .unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&[
                "--config",
                config.to_str().unwrap(),
                "open",
                "https://example.com",
            ]),
            config_options(None),
        )
        .unwrap();
        assert!(expanded.warnings.is_empty());
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("review".to_string()),
                json: true,
                ignored_global_flags: vec![],
                domain_policy: DomainPolicyArgs {
                    allowed_domains: Some("example.com,*.example.com".to_string()),
                    no_allowed_domains: false,
                },
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );
    }

    #[test]
    fn applies_profile_config_default_as_named_target() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("pire-browser.json");
        fs::write(&config, r#"{ "profile": "Work" }"#).unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&["open", "https://example.com"]),
            config_options(Some(config)),
        )
        .unwrap();
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("Work".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );
    }

    #[test]
    fn accepts_legacy_project_config_alias() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("agent-browser.json");
        fs::write(&config, r#"{ "profile": "Legacy" }"#).unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&["open", "https://example.com"]),
            ConfigApplyOptions {
                legacy_project_config: Some(config),
                ..ConfigApplyOptions::default()
            },
        )
        .unwrap();
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("Legacy".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );
    }

    #[test]
    fn cli_flags_override_config_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("pire-browser.json");
        fs::write(
            &config,
            r#"{
              "sessionName": "from-config",
              "allowedDomains": "config.example",
              "json": true
            }"#,
        )
        .unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&[
                "--session-name",
                "from-cli",
                "--allowed-domains",
                "cli.example",
                "open",
                "https://cli.example",
            ]),
            config_options(Some(config)),
        )
        .unwrap();
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("from-cli".to_string()),
                json: true,
                ignored_global_flags: vec![],
                domain_policy: DomainPolicyArgs {
                    allowed_domains: Some("cli.example".to_string()),
                    no_allowed_domains: false,
                },
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://cli.example"])
            }
        );
    }

    #[test]
    fn explicit_config_missing_or_malformed_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("missing.json");
        let err = apply_config_defaults_with_options(
            &s(&["--config", missing.to_str().unwrap(), "status"]),
            config_options(None),
        )
        .unwrap_err();
        assert!(err.to_string().contains("config_not_found"));

        let malformed = dir.path().join("broken.json");
        fs::write(&malformed, "{").unwrap();
        let err = apply_config_defaults_with_options(
            &s(&["--config", malformed.to_str().unwrap(), "status"]),
            config_options(None),
        )
        .unwrap_err();
        assert!(err.to_string().contains("config_malformed"));
    }

    #[test]
    fn auto_discovered_malformed_config_warns_and_continues() {
        let dir = tempfile::tempdir().unwrap();
        let malformed = dir.path().join("pire-browser.json");
        fs::write(&malformed, "{").unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&["status"]),
            config_options(Some(malformed.clone())),
        )
        .unwrap();
        assert_eq!(expanded.args, s(&["status"]));
        assert_eq!(expanded.warnings.len(), 1);
        assert_eq!(expanded.warnings[0].path, malformed);
        assert!(expanded.warnings[0]
            .message
            .contains("ignored malformed config"));
    }

    #[test]
    fn missing_auto_discovered_config_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("pire-browser.json");

        let expanded =
            apply_config_defaults_with_options(&s(&["status"]), config_options(Some(missing)))
                .unwrap();
        assert_eq!(expanded.args, s(&["status"]));
        assert!(expanded.warnings.is_empty());
    }

    #[test]
    fn schema_and_unknown_config_keys_are_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("schema-config.json");
        fs::write(
            &config,
            r#"{
              "$schema": "./node_modules/pire-browser/pire-browser.schema.json",
              "json": true,
              "unknownFutureKey": { "nested": "ignored" }
            }"#,
        )
        .unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&["--config", config.to_str().unwrap(), "status"]),
            config_options(None),
        )
        .unwrap();
        assert!(expanded.warnings.is_empty());
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Status {
                json: true,
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
            }
        );
    }

    #[test]
    fn env_config_path_is_applied_as_required_config() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("env-config.json");
        fs::write(&config, r#"{ "confirmInteractive": true }"#).unwrap();
        let expanded = apply_config_defaults_with_options(
            &s(&["eval", "document.title"]),
            ConfigApplyOptions {
                user_config: None,
                project_config: None,
                env_config: Some(config),
                ..ConfigApplyOptions::default()
            },
        )
        .unwrap();
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: ConfirmationPolicyArgs {
                    confirm_actions: None,
                    confirm_interactive: true,
                },
                args: s(&["eval", "document.title"])
            }
        );
    }

    #[test]
    fn parses_legacy_style_headed_boolean_values() {
        let headed_false =
            parse_cli_args(&s(&["--headed", "false", "open", "example.com"])).unwrap();
        assert_eq!(
            headed_false,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![GlobalFlagWarning {
                    flag: "--headless".to_string()
                }],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "example.com"])
            }
        );

        let headed_true = parse_cli_args(&s(&["--headed", "true", "open", "example.com"])).unwrap();
        assert_eq!(
            headed_true,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![GlobalFlagWarning {
                    flag: "--headed".to_string()
                }],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "example.com"])
            }
        );
    }

    #[test]
    fn parses_setup() {
        let default_setup = parse_cli_args(&s(&["setup"])).unwrap();
        assert_eq!(
            default_setup,
            LocalCommand::Setup {
                windows: false,
                firefox_path: None,
            }
        );

        let parsed = parse_cli_args(&s(&[
            "setup",
            "--windows",
            "--firefox-path",
            "C:/Firefox/firefox.exe",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Setup {
                windows: true,
                firefox_path: Some("C:/Firefox/firefox.exe".to_string())
            }
        );

        let install = parse_cli_args(&s(&["install"])).unwrap();
        assert_eq!(
            install,
            LocalCommand::Setup {
                windows: false,
                firefox_path: None,
            }
        );

        let install_with_path = parse_cli_args(&s(&[
            "install",
            "--firefox-path",
            "/Applications/Firefox.app",
        ]))
        .unwrap();
        assert_eq!(
            install_with_path,
            LocalCommand::Setup {
                windows: false,
                firefox_path: Some("/Applications/Firefox.app".to_string()),
            }
        );
        assert!(parse_cli_args(&s(&["install", "--windows"])).is_err());
    }

    #[test]
    fn parses_empty_args_as_help() {
        assert_eq!(
            parse_cli_args(&[]).unwrap(),
            LocalCommand::Help { topic: None }
        );
        assert_eq!(
            parse_cli_args(&s(&["--help"])).unwrap(),
            LocalCommand::Help { topic: None }
        );
        assert_eq!(
            parse_cli_args(&s(&["help", "status"])).unwrap(),
            LocalCommand::Help {
                topic: Some("status".to_string())
            }
        );
    }

    #[test]
    fn parses_command_help() {
        assert_eq!(
            parse_cli_args(&s(&["open", "--help"])).unwrap(),
            LocalCommand::Help {
                topic: Some("open".to_string())
            }
        );
    }

    #[test]
    fn parses_remote_command_with_session() {
        let parsed = parse_cli_args(&s(&[
            "--session",
            "agent1",
            "find",
            "label",
            "Email",
            "fill",
            "x",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Name("agent1".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["find", "label", "Email", "fill", "x"])
            }
        );

        let parsed = parse_cli_args(&s(&[
            "--session",
            "4d4884fc-af4f-498c-a3f1-16f7bc91a738",
            "snapshot",
            "-i",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Id("4d4884fc-af4f-498c-a3f1-16f7bc91a738".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot", "-i"])
            }
        );
    }

    #[test]
    fn applies_pire_browser_session_env_defaults() {
        let mut args = Vec::new();
        push_session_env_defaults_from_values(
            &mut args,
            &s(&["open", "https://example.com"]),
            None,
            None,
            Some("agent1".to_string()),
        );
        assert_eq!(args, s(&["--session", "agent1"]));
        assert_eq!(
            parse_cli_args(&[args, s(&["open", "https://example.com"])].concat()).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("agent1".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );

        let mut args = Vec::new();
        push_session_env_defaults_from_values(
            &mut args,
            &s(&["open", "https://example.com"]),
            Some("work".to_string()),
            Some("profile".to_string()),
            Some("agent1".to_string()),
        );
        assert_eq!(args, s(&["--session-name", "work"]));

        let mut args = Vec::new();
        push_session_env_defaults_from_values(
            &mut args,
            &s(&["open", "https://example.com"]),
            None,
            Some("Work".to_string()),
            Some("agent1".to_string()),
        );
        assert_eq!(args, s(&["--profile", "Work"]));
        assert_eq!(
            parse_cli_args(&[args, s(&["open", "https://example.com"])].concat()).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("Work".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );

        let mut args = s(&["--session-name", "config"]);
        push_session_env_defaults_from_values(
            &mut args,
            &s(&["open", "https://example.com"]),
            Some("work".to_string()),
            Some("profile".to_string()),
            Some("agent1".to_string()),
        );
        assert_eq!(args, s(&["--session-name", "config"]));

        let mut args = s(&["--profile", "cli-profile"]);
        push_session_env_defaults_from_values(
            &mut args,
            &s(&["open", "https://example.com"]),
            Some("work".to_string()),
            Some("profile".to_string()),
            Some("agent1".to_string()),
        );
        assert_eq!(args, s(&["--profile", "cli-profile"]));
    }

    #[test]
    fn parses_profile_flag_as_named_target() {
        let parsed =
            parse_cli_args(&s(&["--profile", "Work", "open", "https://example.com"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Name("Work".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );

        let parsed = parse_cli_args(&s(&[
            "--profile",
            "~/.myapp-profile",
            "open",
            "https://example.com",
        ]))
        .unwrap();
        match parsed {
            LocalCommand::Remote { target, .. } => match target {
                SessionTarget::Name(name) => {
                    assert!(name.starts_with(".myapp-profile-"));
                    assert!(name.len() > ".myapp-profile-".len());
                }
                other => panic!("expected named profile target, got {other:?}"),
            },
            other => panic!("expected remote command, got {other:?}"),
        }

        let err = parse_cli_args(&s(&[
            "--session",
            "4d4884fc-af4f-498c-a3f1-16f7bc91a738",
            "--profile",
            "Work",
            "open",
            "https://example.com",
        ]))
        .unwrap_err();
        assert!(err.to_string().contains("cannot use --profile"));
    }

    #[test]
    fn accepts_json_after_command() {
        let parsed = parse_cli_args(&s(&["snapshot", "--json"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot"])
            }
        );
    }

    #[test]
    fn accepts_legacy_global_flags_before_command() {
        let parsed = parse_cli_args(&s(&[
            "--session-name",
            "lemonade",
            "--headed",
            "--color-scheme",
            "dark",
            "snapshot",
            "-i",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Name("lemonade".to_string()),
                json: true,
                ignored_global_flags: vec![GlobalFlagWarning {
                    flag: "--headed".to_string()
                }],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot", "-i"])
            }
        );
    }

    #[test]
    fn records_ignored_global_flags_that_need_json_warnings() {
        let parsed = parse_cli_args(&s(&[
            "--headless",
            "--color-scheme",
            "dark",
            "--max-output",
            "1000",
            "get",
            "title",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![GlobalFlagWarning {
                    flag: "--headless".to_string()
                }],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["get", "title"])
            }
        );
    }

    #[test]
    fn accepts_content_boundaries_as_bool_global_flag() {
        let parsed = parse_cli_args(&s(&["--content-boundaries", "snapshot", "--json"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot"])
            }
        );
    }

    #[test]
    fn applies_content_boundaries_config_default_as_boolish_flag() {
        let dir = tempfile::tempdir().unwrap();
        let enabled = dir.path().join("enabled.json");
        fs::write(&enabled, r#"{ "contentBoundaries": true }"#).unwrap();
        let expanded =
            apply_config_defaults_with_options(&s(&["snapshot"]), config_options(Some(enabled)))
                .unwrap();
        assert!(expanded.args.contains(&"--content-boundaries".to_string()));
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot"])
            }
        );

        let disabled = dir.path().join("disabled.json");
        fs::write(&disabled, r#"{ "contentBoundaries": "false" }"#).unwrap();
        let expanded =
            apply_config_defaults_with_options(&s(&["snapshot"]), config_options(Some(disabled)))
                .unwrap();
        assert!(!expanded.args.contains(&"--content-boundaries".to_string()));
    }

    #[test]
    fn accepts_allow_file_access_without_ignored_warning() {
        let parsed = parse_cli_args(&s(&[
            "--allow-file-access",
            "open",
            "file:///tmp/local-file.html",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "file:///tmp/local-file.html"])
            }
        );
    }

    #[test]
    fn parses_domain_allowlist_global_flags() {
        let parsed = parse_cli_args(&s(&[
            "--allowed-domains",
            "example.com,*.example.org",
            "open",
            "example.com",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: DomainPolicyArgs {
                    allowed_domains: Some("example.com,*.example.org".to_string()),
                    no_allowed_domains: false,
                },
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "example.com"])
            }
        );

        let parsed = parse_cli_args(&s(&["--no-allowed-domains", "snapshot"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: DomainPolicyArgs {
                    allowed_domains: None,
                    no_allowed_domains: true,
                },
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot"])
            }
        );

        assert!(parse_cli_args(&s(&[
            "--allowed-domains",
            "example.com",
            "--no-allowed-domains",
            "snapshot"
        ]))
        .is_err());
    }

    #[test]
    fn parses_action_policy_global_flag() {
        let parsed = parse_cli_args(&s(&[
            "--action-policy",
            "./policy.json",
            "snapshot",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: ActionPolicyArgs {
                    action_policy_path: Some("./policy.json".to_string()),
                },
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot"])
            }
        );

        let err = parse_cli_args(&s(&[
            "--action-policy",
            "./policy-a.json",
            "--action-policy",
            "./policy-b.json",
            "snapshot",
        ]))
        .unwrap_err();
        assert!(err
            .to_string()
            .contains("--action-policy was provided more than once"));
    }

    #[test]
    fn parses_confirmation_global_flags_and_commands() {
        let parsed = parse_cli_args(&s(&[
            "--confirm-actions",
            "eval,download",
            "--confirm-interactive",
            "eval",
            "document.title",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: ConfirmationPolicyArgs {
                    confirm_actions: Some("eval,download".to_string()),
                    confirm_interactive: true,
                },
                args: s(&["eval", "document.title"])
            }
        );

        assert_eq!(
            parse_cli_args(&s(&["confirm", "c_1234abcd", "--json"])).unwrap(),
            LocalCommand::Confirm {
                id: "c_1234abcd".to_string(),
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["deny", "c_1234abcd"])).unwrap(),
            LocalCommand::Deny {
                id: "c_1234abcd".to_string(),
                json: false
            }
        );

        let err = parse_cli_args(&s(&[
            "--confirm-actions",
            "eval",
            "--confirm-actions",
            "download",
            "snapshot",
        ]))
        .unwrap_err();
        assert!(err
            .to_string()
            .contains("--confirm-actions was provided more than once"));
    }

    #[test]
    fn parses_download_commands() {
        let parsed = parse_cli_args(&s(&[
            "--session-name",
            "work",
            "--confirm-actions",
            "download",
            "download",
            "@e4",
            "out/report.txt",
            "--timeout",
            "5000",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Download {
                target: SessionTarget::Name("work".to_string()),
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: ConfirmationPolicyArgs {
                    confirm_actions: Some("download".to_string()),
                    confirm_interactive: false,
                },
                selector: "@e4".to_string(),
                path: "out/report.txt".to_string(),
                timeout_ms: 5000,
            }
        );

        let parsed = parse_cli_args(&s(&[
            "--action-policy",
            "policy.json",
            "wait",
            "--download",
            "out/report.txt",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::WaitDownload {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: ActionPolicyArgs {
                    action_policy_path: Some("policy.json".to_string()),
                },
                confirmation_policy: default_confirmation_policy(),
                path: Some("out/report.txt".to_string()),
                timeout_ms: DOWNLOAD_TIMEOUT_MS,
            }
        );

        let err = parse_cli_args(&s(&["download", "@e4", "out.txt", "--timeout", "0"]))
            .unwrap_err()
            .to_string();
        assert!(err.contains("--timeout must be a positive integer"));
    }

    #[test]
    fn parses_upload_commands() {
        let parsed = parse_cli_args(&s(&[
            "--session",
            "abc",
            "--confirm-actions",
            "upload",
            "upload",
            "#file",
            "one.txt",
            "two.json",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Upload {
                target: SessionTarget::Name("abc".to_string()),
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: ConfirmationPolicyArgs {
                    confirm_actions: Some("upload".to_string()),
                    confirm_interactive: false,
                },
                selector: "#file".to_string(),
                files: s(&["one.txt", "two.json"]),
            }
        );

        let missing_file = parse_cli_args(&s(&["upload", "#file"]))
            .unwrap_err()
            .to_string();
        assert!(missing_file.contains("upload requires at least one file"));

        let unsupported = parse_cli_args(&s(&["upload", "#file", "one.txt", "--timeout", "10"]))
            .unwrap_err()
            .to_string();
        assert!(unsupported.contains("unsupported upload option"));
    }

    #[test]
    fn formats_json_success_envelope() {
        let value = json!({ "text": "ok", "warnings": [{"code": "BEST_EFFORT_FIREFOX_GAP"}] });
        let formatted = format_cli_result(&value, true).unwrap();
        assert!(formatted.contains("\"success\": true"));
        assert!(formatted.contains("\"data\""));
        assert!(formatted.contains("\"warnings\""));
    }

    #[test]
    fn formats_skills_json_success_envelopes() {
        let list =
            format_cli_result(&json!({ "skills": crate::skills::list_skills() }), true).unwrap();
        assert!(list.contains("\"success\": true"));
        assert!(list.contains("\"skills\""));

        let skill = crate::skills::skill_content("core").unwrap();
        let cat = format_cli_result(&json!({ "skill": skill }), true).unwrap();
        assert!(cat.contains("\"success\": true"));
        assert!(cat.contains("\"skill\""));
        assert!(cat.contains("\"content\""));
    }

    #[test]
    fn parses_install_status_json() {
        let parsed = parse_cli_args(&s(&["install-status", "--json"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::InstallStatus {
                json: true,
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy()
            }
        );
    }

    #[test]
    fn parses_doctor_as_install_status() {
        let parsed = parse_cli_args(&s(&["doctor", "--json"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::InstallStatus {
                json: true,
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy()
            }
        );
    }

    #[test]
    fn parses_status_json() {
        let parsed = parse_cli_args(&s(&["status", "--json"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Status {
                json: true,
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy()
            }
        );
        let parsed = parse_cli_args(&s(&["--json", "status"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Status {
                json: true,
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy()
            }
        );
    }

    #[test]
    fn rejects_mixed_session_target_flags() {
        assert!(parse_cli_args(&s(&[
            "--session",
            "abc",
            "--session-name",
            "work",
            "snapshot"
        ]))
        .is_err());
        assert!(parse_cli_args(&s(&[
            "--session-name",
            "work",
            "--session",
            "abc",
            "snapshot"
        ]))
        .is_err());
    }

    #[test]
    fn parses_session_lifecycle_commands() {
        assert_eq!(
            parse_cli_args(&s(&["session", "list", "--json"])).unwrap(),
            LocalCommand::SessionList { json: true }
        );
        assert_eq!(
            parse_cli_args(&s(&["sessions", "--json"])).unwrap(),
            LocalCommand::SessionList { json: true }
        );
        assert_eq!(
            parse_cli_args(&s(&["session", "attach", "abc", "--json"])).unwrap(),
            LocalCommand::SessionAttach {
                session: "abc".to_string(),
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["session", "cleanup"])).unwrap(),
            LocalCommand::SessionCleanup { json: false }
        );
        assert!(parse_cli_args(&s(&["session", "rename", "abc"])).is_err());
    }

    #[test]
    fn parses_close_all_as_local_teardown() {
        assert_eq!(
            parse_cli_args(&s(&["close", "--all", "--json"])).unwrap(),
            LocalCommand::CloseAll {
                json: true,
                ignored_global_flags: vec![]
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["quit", "--all"])).unwrap(),
            LocalCommand::CloseAll {
                json: false,
                ignored_global_flags: vec![]
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["exit", "--json", "--all"])).unwrap(),
            LocalCommand::CloseAll {
                json: true,
                ignored_global_flags: vec![]
            }
        );
        assert!(parse_cli_args(&s(&["--state", "state.json", "close", "--all"])).is_err());
        assert!(parse_cli_args(&s(&["close", "--all", "--force"])).is_err());
    }

    #[test]
    fn parses_close_one_as_local_teardown() {
        assert_eq!(
            parse_cli_args(&s(&["close", "--json"])).unwrap(),
            LocalCommand::CloseOne {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![]
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["--session", "work", "quit"])).unwrap(),
            LocalCommand::CloseOne {
                target: SessionTarget::Name("work".to_string()),
                json: false,
                ignored_global_flags: vec![]
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["--session-name", "work", "exit", "--json"])).unwrap(),
            LocalCommand::CloseOne {
                target: SessionTarget::Name("work".to_string()),
                json: true,
                ignored_global_flags: vec![]
            }
        );
        assert!(parse_cli_args(&s(&["--state", "state.json", "close"])).is_err());
        assert!(parse_cli_args(&s(&["close", "--force"])).is_err());
    }

    #[test]
    fn parses_profiles_command() {
        assert_eq!(
            parse_cli_args(&s(&["profiles"])).unwrap(),
            LocalCommand::ProfilesList { json: false }
        );
        assert_eq!(
            parse_cli_args(&s(&["profiles", "--json"])).unwrap(),
            LocalCommand::ProfilesList { json: true }
        );
        assert!(parse_cli_args(&s(&["profiles", "show"])).is_err());
    }

    #[test]
    fn parses_skill_commands() {
        assert_eq!(
            parse_cli_args(&s(&["skills"])).unwrap(),
            LocalCommand::SkillsList { json: false }
        );
        assert_eq!(
            parse_cli_args(&s(&["skills", "list", "--json"])).unwrap(),
            LocalCommand::SkillsList { json: true }
        );
        assert_eq!(
            parse_cli_args(&s(&["--json", "skills", "list"])).unwrap(),
            LocalCommand::SkillsList { json: true }
        );
        assert_eq!(
            parse_cli_args(&s(&["skills", "cat", "core"])).unwrap(),
            LocalCommand::SkillsCat {
                name: "core".to_string(),
                json: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["skill", "cat", "core", "--json"])).unwrap(),
            LocalCommand::SkillsCat {
                name: "core".to_string(),
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["skills", "get", "core", "--full", "--json"])).unwrap(),
            LocalCommand::SkillsCat {
                name: "core".to_string(),
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["skills", "get", "--all", "--json"])).unwrap(),
            LocalCommand::SkillsCatAll { json: true }
        );
        assert_eq!(
            parse_cli_args(&s(&["skill", "cat", "--all"])).unwrap(),
            LocalCommand::SkillsCatAll { json: false }
        );
        assert!(parse_cli_args(&s(&["skills", "cat"])).is_err());
        assert!(parse_cli_args(&s(&["skills", "show", "core"])).is_err());
    }

    #[test]
    fn parses_mcp_command() {
        assert_eq!(
            parse_cli_args(&s(&["mcp"])).unwrap(),
            LocalCommand::Mcp {
                tools: "core".to_string()
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["mcp", "--tools", "core"])).unwrap(),
            LocalCommand::Mcp {
                tools: "core".to_string()
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["mcp", "--tools", "all"])).unwrap(),
            LocalCommand::Mcp {
                tools: "all".to_string()
            }
        );
        assert!(parse_cli_args(&s(&["mcp", "--tools"])).is_err());
        assert!(parse_cli_args(&s(&["mcp", "--bad"])).is_err());
    }

    #[test]
    fn parses_state_save_and_load_commands() {
        assert_eq!(
            parse_cli_args(&s(&["state", "save", "state.json", "--json"])).unwrap(),
            LocalCommand::StateSave {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                path: "state.json".to_string()
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "--session-name",
                "work",
                "--headless",
                "state",
                "load",
                "work-state.json",
                "--json"
            ]))
            .unwrap(),
            LocalCommand::StateLoad {
                target: SessionTarget::Name("work".to_string()),
                json: true,
                ignored_global_flags: vec![GlobalFlagWarning {
                    flag: "--headless".to_string()
                }],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                path: "work-state.json".to_string(),
                policy_flag: StateLoadPolicyFlag::Unspecified
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["--session", "abc", "state", "load", "state.json"])).unwrap(),
            LocalCommand::StateLoad {
                target: SessionTarget::Name("abc".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                path: "state.json".to_string(),
                policy_flag: StateLoadPolicyFlag::Unspecified
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "state",
                "load",
                "--require-inspected",
                "state.json",
                "--json"
            ]))
            .unwrap(),
            LocalCommand::StateLoad {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                path: "state.json".to_string(),
                policy_flag: StateLoadPolicyFlag::RequireInspected
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "state",
                "load",
                "--json",
                "state.json",
                "--no-require-inspected"
            ]))
            .unwrap(),
            LocalCommand::StateLoad {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                path: "state.json".to_string(),
                policy_flag: StateLoadPolicyFlag::NoRequireInspected
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["state", "inspect", "state.json", "--json"])).unwrap(),
            LocalCommand::StateInspect {
                json: true,
                ignored_global_flags: vec![],
                path: "state.json".to_string(),
                record: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "state",
                "inspect",
                "--record",
                "state.json",
                "--json"
            ]))
            .unwrap(),
            LocalCommand::StateInspect {
                json: true,
                ignored_global_flags: vec![],
                path: "state.json".to_string(),
                record: true
            }
        );
        assert!(parse_cli_args(&s(&["state", "save"])).is_err());
        assert!(parse_cli_args(&s(&["state", "inspect"])).is_err());
        assert!(parse_cli_args(&s(&[
            "state",
            "inspect",
            "--require-inspected",
            "state.json"
        ]))
        .is_err());
        assert!(parse_cli_args(&s(&[
            "state",
            "inspect",
            "--no-require-inspected",
            "state.json"
        ]))
        .is_err());
        assert!(parse_cli_args(&s(&["state", "load", "--record", "state.json"])).is_err());
        assert!(parse_cli_args(&s(&[
            "state",
            "load",
            "--require-inspected",
            "--no-require-inspected",
            "state.json"
        ]))
        .is_err());
        assert_eq!(
            parse_cli_args(&s(&["state", "list"])).unwrap(),
            LocalCommand::StateList {
                json: false,
                ignored_global_flags: vec![]
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["state", "show", "state.json", "--json"])).unwrap(),
            LocalCommand::StateShow {
                json: true,
                ignored_global_flags: vec![],
                path: "state.json".to_string()
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["state", "rename", "old", "new", "--json"])).unwrap(),
            LocalCommand::StateRename {
                json: true,
                ignored_global_flags: vec![],
                old: "old".to_string(),
                new: "new".to_string()
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["state", "clear", "work"])).unwrap(),
            LocalCommand::StateClear {
                json: false,
                ignored_global_flags: vec![],
                name: Some("work".to_string()),
                all: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["state", "clear", "--all", "--json"])).unwrap(),
            LocalCommand::StateClear {
                json: true,
                ignored_global_flags: vec![],
                name: None,
                all: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["state", "clean", "--older-than", "7"])).unwrap(),
            LocalCommand::StateClean {
                json: false,
                ignored_global_flags: vec![],
                older_than_days: 7
            }
        );
        assert!(parse_cli_args(&s(&["state", "rename", "old"])).is_err());
        assert!(parse_cli_args(&s(&["state", "clear"])).is_err());
        assert!(parse_cli_args(&s(&["state", "clear", "--all", "work"])).is_err());
        assert!(parse_cli_args(&s(&["state", "clean"])).is_err());
        assert_eq!(
            parse_cli_args(&s(&["state", "clean", "--older-than", "0"])).unwrap(),
            LocalCommand::StateClean {
                json: false,
                ignored_global_flags: vec![],
                older_than_days: 0
            }
        );
    }

    #[test]
    fn parses_state_shortcut_and_auto_connect_state_save() {
        assert_eq!(
            parse_cli_args(&s(&[
                "--state",
                "./my-auth.json",
                "open",
                "https://app.example.com/dashboard",
                "--json"
            ]))
            .unwrap(),
            LocalCommand::StateShortcut {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                path: "./my-auth.json".to_string(),
                args: s(&["open", "https://app.example.com/dashboard"])
            }
        );

        assert_eq!(
            parse_cli_args(&s(&[
                "--auto-connect",
                "state",
                "save",
                "./my-auth.json",
                "--json"
            ]))
            .unwrap(),
            LocalCommand::StateSave {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                path: "./my-auth.json".to_string()
            }
        );

        assert!(parse_cli_args(&s(&["--state", "", "open", "https://example.com"])).is_err());
        assert!(parse_cli_args(&s(&[
            "--state",
            "one.json",
            "--state",
            "two.json",
            "open",
            "https://example.com"
        ]))
        .is_err());
    }

    #[test]
    fn parses_doctor_noop_flags_and_fix() {
        let parsed = parse_cli_args(&s(&["doctor", "--offline", "--quick", "--json"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::InstallStatus {
                json: true,
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy()
            }
        );
        let parsed = parse_cli_args(&s(&["doctor", "--fix", "--json"])).unwrap();
        assert_eq!(parsed, LocalCommand::DoctorFix { json: true });
    }

    #[test]
    fn help_text_includes_ref_quoting_guidance() {
        let text = help_text(None).unwrap();
        assert!(text.contains("click '@e4'"));
        assert!(text.contains("skills cat core"));
        assert!(text.contains("pushstate /dashboard"));
        assert!(text.contains("console"));
        assert!(text.contains("errors"));
        assert!(text.contains("network requests"));
        assert!(text.contains("network route"));
        assert!(text.contains("network har"));
        assert!(text.contains("diff snapshot"));
        assert!(text.contains("highlight '#submit'"));
        assert!(text.contains("install [--firefox-path <path>]"));
        assert!(text.contains("--config ./ci-config.json open <url>"));
        assert!(text.contains("open <url> --headers"));
        assert!(text.contains("tab new <url>"));
        assert!(text.contains("window new"));
        assert!(text.contains("close"));
        assert!(text.contains("close --all"));
        assert!(text.contains("--profile Work open <url>"));
        assert!(text.contains("profiles [--json]"));
        assert!(text.contains("set viewport"));
        assert!(text.contains("mouse move"));
        assert!(text.contains("drag '@e1' '@e2'"));
        assert!(text.contains("batch \"open <url>\""));
        assert!(text.contains("addinitscript <js>"));
        assert!(text.contains("--allow-file-access open file:///path/to/page.html"));
        assert!(text.contains("auth login"));
        assert!(help_text(Some("status")).unwrap().contains("status"));
        assert!(help_text(Some("install"))
            .unwrap()
            .contains("Alias for setup"));
        assert!(help_text(Some("config"))
            .unwrap()
            .contains("PIRE_BROWSER_CONFIG"));
        assert!(help_text(Some("config")).unwrap().contains("autoConnect"));
        assert!(help_text(Some("state"))
            .unwrap()
            .contains("--auto-connect state save"));
        assert!(help_text(Some("state"))
            .unwrap()
            .contains("--state ./.pire-state"));
        assert!(help_text(Some("open"))
            .unwrap()
            .contains("[--new|--new-tab]"));
        assert!(help_text(Some("open")).unwrap().contains("new tab"));
        assert!(help_text(Some("open"))
            .unwrap()
            .contains("--init-script <path>"));
        assert!(help_text(Some("open"))
            .unwrap()
            .contains("--allow-file-access"));
        assert!(help_text(Some("open"))
            .unwrap()
            .contains("--headers <json>"));
        assert!(help_text(Some("snapshot"))
            .unwrap()
            .contains("snapshot -i -c"));
        assert!(help_text(Some("snapshot"))
            .unwrap()
            .contains("snapshot -d 3"));
        assert!(help_text(Some("snapshot"))
            .unwrap()
            .contains("snapshot -i -c -d 5"));
        assert!(help_text(Some("snapshot")).unwrap().contains("-s"));
        assert!(help_text(Some("pdf"))
            .unwrap()
            .contains("pire-browser pdf <path>"));
        assert!(help_text(None).unwrap().contains("pdf page.pdf"));
        assert!(help_text(Some("diff"))
            .unwrap()
            .contains("diff snapshot --baseline"));
        assert!(help_text(Some("diff"))
            .unwrap()
            .contains("diff screenshot --baseline before.png"));
        assert!(help_text(Some("diff"))
            .unwrap()
            .contains("diff url https://v1.example https://v2.example"));
        assert!(help_text(None).unwrap().contains("diff url <url1> <url2>"));
        assert!(help_text(Some("wait")).unwrap().contains("wait '@e1'"));
        assert!(help_text(Some("wait"))
            .unwrap()
            .contains("wait --load networkidle"));
        assert!(help_text(Some("pushstate"))
            .unwrap()
            .contains("history.pushState"));
        assert!(help_text(Some("console"))
            .unwrap()
            .contains("console --clear"));
        assert!(help_text(Some("errors"))
            .unwrap()
            .contains("unhandled promise"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network request <requestId>"));
        assert!(help_text(Some("network")).unwrap().contains("network har"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network har stop [output.har]"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("HAR output is metadata-only"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network route <pattern> --body"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network unroute [pattern-or-route-id]"));
        assert!(help_text(Some("vitals"))
            .unwrap()
            .contains("pire-browser vitals https://example.com"));
        assert!(help_text(None).unwrap().contains("vitals [url]"));
        assert!(help_text(Some("highlight"))
            .unwrap()
            .contains("Draws a visible overlay"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set viewport <w> <h> [scale]"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set device \"iPhone 14\""));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set headers <json>"));
        assert!(help_text(Some("find"))
            .unwrap()
            .contains("find text \"Save\" --exact"));
        assert!(help_text(Some("mouse")).unwrap().contains("mouse wheel"));
        assert!(help_text(Some("drag"))
            .unwrap()
            .contains("drag <src> <dst>"));
        assert!(help_text(Some("batch"))
            .unwrap()
            .contains("JSON array from"));
        assert!(help_text(Some("addinitscript"))
            .unwrap()
            .contains("removeinitscript <identifier>"));
        assert!(help_text(Some("auth"))
            .unwrap()
            .contains("--username-selector"));
        assert!(help_text(Some("auth")).unwrap().contains("auth login"));
        assert!(help_text(Some("tabs")).unwrap().contains("tab new"));
        assert!(help_text(Some("window")).unwrap().contains("window new"));
        assert!(help_text(Some("close")).unwrap().contains("quit"));
        assert!(help_text(Some("quit")).unwrap().contains("close --all"));
        assert!(help_text(Some("clipboard"))
            .unwrap()
            .contains("clipboard read"));
        assert!(help_text(Some("state")).unwrap().contains("state save"));
        assert!(help_text(Some("state")).unwrap().contains("state list"));
        assert!(help_text(Some("state")).unwrap().contains("state show"));
        assert!(help_text(Some("mcp"))
            .unwrap()
            .contains("Model Context Protocol server"));
        assert!(help_text(Some("skills"))
            .unwrap()
            .contains("skills get core"));
        assert!(help_text(Some("session"))
            .unwrap()
            .contains("session attach"));
        assert!(help_text(Some("profiles"))
            .unwrap()
            .contains("managed Firefox profiles"));
        assert!(help_text(Some("action-policy"))
            .unwrap()
            .contains("PIRE_BROWSER_ACTION_POLICY"));
        assert!(help_text(Some("unknown")).is_none());
    }

    #[test]
    fn parses_launch_with_defaults() {
        let parsed = parse_cli_args(&s(&["launch"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Launch {
                profile: "Default".to_string(),
                url: None,
                firefox_path: None,
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy()
            }
        );
    }

    #[test]
    fn parses_launch_options() {
        let parsed = parse_cli_args(&s(&[
            "launch",
            "--profile",
            "Default",
            "--url",
            "https://discord.com/login",
            "--firefox-path",
            "C:/Firefox/firefox.exe",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Launch {
                profile: "Default".to_string(),
                url: Some("https://discord.com/login".to_string()),
                firefox_path: Some("C:/Firefox/firefox.exe".to_string()),
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy()
            }
        );

        let parsed = parse_cli_args(&s(&["launch", "--profile", "~/.myapp-profile"])).unwrap();
        match parsed {
            LocalCommand::Launch { profile, .. } => {
                assert!(profile.starts_with(".myapp-profile-"));
            }
            other => panic!("expected launch command, got {other:?}"),
        }
    }

    #[test]
    fn rejects_unsupported_launch_option() {
        let err = parse_cli_args(&s(&["launch", "--bad"])).unwrap_err();
        assert!(err.to_string().contains("unsupported launch option"));
    }
}
