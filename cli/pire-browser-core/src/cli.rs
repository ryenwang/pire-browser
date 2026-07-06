use anyhow::{bail, Result};
use serde_json::{json, Map, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::action_policy::ActionPolicyArgs;
use crate::confirmation_policy::ConfirmationPolicyArgs;
use crate::domain_policy::DomainPolicyArgs;
use crate::download::DOWNLOAD_TIMEOUT_MS;
use crate::protocol::RpcRequest;
use crate::state_policy::StateLoadPolicyFlag;

pub const READ_TIMEOUT_MS: u64 = 15_000;

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
    pub config: Map<String, Value>,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionIdScope {
    Worktree,
    Cwd,
    Global,
}

impl SessionIdScope {
    pub fn as_str(self) -> &'static str {
        match self {
            SessionIdScope::Worktree => "worktree",
            SessionIdScope::Cwd => "cwd",
            SessionIdScope::Global => "global",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionIdOptions {
    pub scope: SessionIdScope,
    pub prefix: String,
    pub json: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RestoreCliOptions {
    pub requested: bool,
    pub name: Option<String>,
    pub save: Option<String>,
    pub check_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadCommandOptions {
    pub url: String,
    pub raw: bool,
    pub require_md: bool,
    pub outline: bool,
    pub llms: Option<String>,
    pub filter: Option<String>,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadActiveUrlOptions {
    pub raw: bool,
    pub require_md: bool,
    pub outline: bool,
    pub llms: Option<String>,
    pub filter: Option<String>,
    pub timeout_ms: u64,
}

impl ReadActiveUrlOptions {
    pub fn with_url(self, url: String) -> ReadCommandOptions {
        ReadCommandOptions {
            url,
            raw: self.raw,
            require_md: self.require_md,
            outline: self.outline,
            llms: self.llms,
            filter: self.filter,
            timeout_ms: self.timeout_ms,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ParsedReadArgs {
    RemoteActiveTab,
    Url(ReadCommandOptions),
    ActiveUrl(ReadActiveUrlOptions),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LocalCommand {
    Help {
        topic: Option<String>,
    },
    Setup {
        windows: bool,
        firefox_path: Option<String>,
        with_deps: bool,
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
    Dashboard {
        action: DashboardAction,
        port: u16,
        json: bool,
        background: bool,
        background_worker: bool,
    },
    Stream {
        action: StreamAction,
        port: u16,
        json: bool,
    },
    ActivityList {
        json: bool,
        limit: usize,
    },
    ReadUrl {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        options: ReadCommandOptions,
    },
    ReadActiveUrl {
        target: SessionTarget,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
        options: ReadActiveUrlOptions,
    },
    ProfilesList {
        json: bool,
    },
    ProfilesImport {
        json: bool,
        source: String,
        name: String,
        overwrite: bool,
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
    SkillsPath {
        name: String,
        json: bool,
    },
    PluginList {
        json: bool,
    },
    PluginShow {
        name: String,
        json: bool,
    },
    PluginAdd {
        reference: String,
        name: Option<String>,
        capabilities: Vec<String>,
        no_manifest: bool,
        global: bool,
        json: bool,
    },
    PluginRun {
        name: String,
        capability: String,
        payload: Value,
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        confirmation_policy: ConfirmationPolicyArgs,
    },
    Chat {
        json: bool,
        ignored_global_flags: Vec<GlobalFlagWarning>,
        instruction: Option<String>,
        max_steps: usize,
    },
    InstallStatus {
        json: bool,
        domain_policy: DomainPolicyArgs,
        action_policy: ActionPolicyArgs,
        confirmation_policy: ConfirmationPolicyArgs,
    },
    DoctorFix {
        json: bool,
        firefox_path: Option<String>,
        with_deps: bool,
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
    SessionInfo {
        target: SessionTarget,
        restore: RestoreCliOptions,
        json: bool,
    },
    SessionId {
        options: SessionIdOptions,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DashboardAction {
    Start,
    Status,
    Stop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamAction {
    Enable,
    Status,
    Disable,
}

const GLOBAL_VALUE_FLAGS: &[&str] = &[
    "--session",
    "--session-name",
    "--profile",
    "--state",
    "--restore-save",
    "--restore-check-text",
    "--color-scheme",
    "--max-output",
    "--allowed-domains",
    "--confirm-actions",
    "--action-policy",
    "--config",
    "--executable-path",
    "--download-path",
    "--engine",
    "--provider",
    "--args",
    "--user-agent",
    "--proxy",
    "--proxy-bypass",
    "-p",
    "--model",
];
const GLOBAL_BOOL_FLAGS: &[&str] = &[
    "--json",
    "--headed",
    "--headless",
    "--no-auto-dialog",
    "--hide-scrollbars",
    "--allow-file-access",
    "--auto-connect",
    "--confirm-interactive",
    "--no-allowed-domains",
    "--content-boundaries",
    "-q",
    "-v",
    "--quiet",
    "--verbose",
];

const GLOBAL_OPTIONAL_VALUE_FLAGS: &[&str] = &["--restore"];

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
    push_restore_env_defaults(&mut args, raw);
    push_state_env_defaults(&mut args, raw);
    args.extend_from_slice(raw);
    push_init_script_env_defaults(&mut args);
    Ok(ConfigApplyResult {
        args,
        warnings,
        config: merged,
    })
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

fn push_restore_env_defaults(args: &mut Vec<String>, raw: &[String]) {
    push_restore_env_defaults_from_value(
        args,
        raw,
        env_var_nonempty_alias("PIRE_BROWSER_RESTORE", "AGENT_BROWSER_RESTORE"),
    );
}

fn push_restore_env_defaults_from_value(
    args: &mut Vec<String>,
    raw: &[String],
    value: Option<String>,
) {
    if raw_has_any_flag(raw, &["--restore"]) || raw_has_any_flag(args, &["--restore"]) {
        return;
    }
    let Some(value) = value else {
        return;
    };
    if parse_bool_literal(&value) == Some(false) {
        return;
    }
    args.push("--restore".to_string());
    let explicit_target = raw_has_any_flag(raw, &["--session", "--session-name", "--profile"])
        || raw_has_any_flag(args, &["--session", "--session-name", "--profile"]);
    if parse_bool_literal(&value) != Some(true) && !explicit_target {
        args.push(value);
    }
}

fn push_state_env_defaults(args: &mut Vec<String>, raw: &[String]) {
    push_state_env_defaults_from_value(
        args,
        raw,
        env_var_nonempty_alias("PIRE_BROWSER_STATE", "AGENT_BROWSER_STATE"),
    );
}

fn push_state_env_defaults_from_value(
    args: &mut Vec<String>,
    raw: &[String],
    value: Option<String>,
) {
    if raw_has_any_flag(raw, &["--state"]) || raw_has_any_flag(args, &["--state"]) {
        return;
    }
    if !command_allows_state_default(raw) {
        return;
    }
    if let Some(value) = value {
        args.push("--state".to_string());
        args.push(value);
    }
}

fn push_init_script_env_defaults(args: &mut Vec<String>) {
    let value = env_var_nonempty_alias("PIRE_BROWSER_INIT_SCRIPTS", "AGENT_BROWSER_INIT_SCRIPTS");
    push_init_script_env_defaults_from_value(args, value);
}

fn push_init_script_env_defaults_from_value(args: &mut Vec<String>, value: Option<String>) {
    if raw_has_any_flag(args, &["--init-script"]) {
        return;
    }
    let Some(value) = value else {
        return;
    };
    let Some(command_index) = first_command_index(args) else {
        return;
    };
    if !matches!(
        args.get(command_index).map(String::as_str),
        Some("open" | "goto" | "navigate")
    ) {
        return;
    }
    if !has_positional_after(
        args,
        command_index + 1,
        &["--label", "--headers", "--enable", "--device"],
    ) {
        return;
    }
    let paths: Vec<String> = env::split_paths(&value)
        .map(|path| path.to_string_lossy().trim().to_string())
        .filter(|path| !path.is_empty())
        .collect();
    if paths.is_empty() {
        return;
    }
    let insert_at = command_index + 1;
    for path in paths.into_iter().rev() {
        args.insert(insert_at, path);
        args.insert(insert_at, "--init-script".to_string());
    }
}

fn command_allows_state_default(raw: &[String]) -> bool {
    let Some(index) = first_command_index(raw) else {
        return false;
    };
    matches!(
        raw[index].as_str(),
        "open"
            | "goto"
            | "navigate"
            | "read"
            | "snapshot"
            | "find"
            | "click"
            | "tap"
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
            | "mouse"
            | "drag"
            | "swipe"
            | "select"
            | "check"
            | "uncheck"
            | "scroll"
            | "scrollintoview"
            | "scrollinto"
            | "wait"
            | "screenshot"
            | "pdf"
            | "get"
            | "is"
            | "eval"
            | "console"
            | "errors"
            | "network"
            | "trace"
            | "record"
            | "tab"
            | "tabs"
            | "back"
            | "forward"
            | "reload"
            | "pushstate"
            | "window"
            | "frame"
            | "dialog"
            | "diff"
            | "batch"
            | "cookies"
            | "storage"
            | "set"
            | "device"
            | "clipboard"
            | "auth"
            | "download"
            | "upload"
            | "vitals"
            | "react"
            | "addinitscript"
            | "removeinitscript"
            | "highlight"
    )
}

fn first_command_index(args: &[String]) -> Option<usize> {
    let mut index = 0;
    while index < args.len() {
        let arg = args[index].as_str();
        if GLOBAL_OPTIONAL_VALUE_FLAGS.contains(&arg) {
            index += 1;
            if let Some(value) = args.get(index) {
                if is_optional_restore_key(value) {
                    index += 1;
                }
            }
            continue;
        }
        if GLOBAL_VALUE_FLAGS.contains(&arg) {
            index += 2;
            continue;
        }
        if GLOBAL_BOOL_FLAGS.contains(&arg) {
            index += 1;
            if matches!(
                arg,
                "--headed"
                    | "--headless"
                    | "--content-boundaries"
                    | "--no-auto-dialog"
                    | "--hide-scrollbars"
            ) && args
                .get(index)
                .and_then(|value| parse_bool_literal(value))
                .is_some()
            {
                index += 1;
            }
            continue;
        }
        return Some(index);
    }
    None
}

fn has_positional_after(args: &[String], start: usize, value_flags: &[&str]) -> bool {
    let mut index = start;
    while index < args.len() {
        let arg = args[index].as_str();
        if value_flags.contains(&arg) {
            index += 2;
            continue;
        }
        if arg.starts_with('-') {
            index += 1;
            continue;
        }
        return true;
    }
    false
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
    push_restore_config(&mut args, config, raw);
    push_value_config(
        &mut args,
        config,
        raw,
        "restoreSave",
        "--restore-save",
        &["--restore-save"],
    );
    push_value_config(&mut args, config, raw, "state", "--state", &["--state"]);
    if !command_allows_state_default(raw) {
        remove_flag_and_value(&mut args, "--state");
    }
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
    push_bool_config(
        &mut args,
        config,
        raw,
        "noAutoDialog",
        "--no-auto-dialog",
        &["--no-auto-dialog"],
    );
    push_bool_value_config(
        &mut args,
        config,
        raw,
        "hideScrollbars",
        "--hide-scrollbars",
        &["--hide-scrollbars"],
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
    push_value_config(&mut args, config, raw, "proxy", "--proxy", &["--proxy"]);
    push_value_config(
        &mut args,
        config,
        raw,
        "proxyBypass",
        "--proxy-bypass",
        &["--proxy-bypass"],
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
    push_value_config(
        &mut args,
        config,
        raw,
        "downloadPath",
        "--download-path",
        &["--download-path"],
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
    push_value_config(&mut args, config, raw, "args", "--args", &["--args"]);
    push_value_config(
        &mut args,
        config,
        raw,
        "userAgent",
        "--user-agent",
        &["--user-agent"],
    );
    push_value_config(&mut args, config, raw, "model", "--model", &["--model"]);

    args
}

fn push_restore_config(args: &mut Vec<String>, config: &Map<String, Value>, raw: &[String]) {
    if raw_has_any_flag(raw, &["--restore"]) || raw_has_any_flag(args, &["--restore"]) {
        return;
    }
    let Some(value) = config.get("restore") else {
        return;
    };
    let explicit_target = raw_has_any_flag(raw, &["--session", "--session-name", "--profile"])
        || raw_has_any_flag(args, &["--session", "--session-name", "--profile"]);
    match value {
        Value::Bool(false) | Value::Null => {}
        Value::Bool(true) => args.push("--restore".to_string()),
        _ => {
            if let Some(value) = config_value_to_string(value) {
                args.push("--restore".to_string());
                if !explicit_target {
                    args.push(value);
                }
            }
        }
    }
}

fn remove_flag_and_value(args: &mut Vec<String>, flag: &str) {
    let mut index = 0;
    while index < args.len() {
        if args[index] == flag {
            args.remove(index);
            if index < args.len() {
                args.remove(index);
            }
            continue;
        }
        index += 1;
    }
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

fn push_bool_value_config(
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
    let Some(value) = config.get(key).and_then(Value::as_bool) else {
        return;
    };
    args.push(flag.to_string());
    args.push(value.to_string());
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
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" | "on" => Some(true),
        "false" | "0" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn is_optional_restore_key(value: &str) -> bool {
    if value.trim().is_empty() || value.starts_with('-') {
        return false;
    }
    !is_known_command_name(value)
}

fn is_known_command_name(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "activity"
            | "addinitscript"
            | "auth"
            | "back"
            | "batch"
            | "chat"
            | "check"
            | "click"
            | "clipboard"
            | "close"
            | "config"
            | "confirm"
            | "console"
            | "cookies"
            | "dashboard"
            | "deny"
            | "device"
            | "dialog"
            | "dialogs"
            | "diff"
            | "doctor"
            | "download"
            | "drag"
            | "errors"
            | "eval"
            | "evaluate"
            | "exit"
            | "fill"
            | "find"
            | "focus"
            | "forward"
            | "frame"
            | "frames"
            | "get"
            | "goto"
            | "help"
            | "highlight"
            | "hover"
            | "install"
            | "install-status"
            | "is"
            | "key"
            | "keyboard"
            | "keydown"
            | "keyup"
            | "launch"
            | "mcp"
            | "mouse"
            | "navigate"
            | "network"
            | "open"
            | "pdf"
            | "plugin"
            | "plugins"
            | "press"
            | "profiles"
            | "profiler"
            | "pushstate"
            | "quit"
            | "react"
            | "read"
            | "record"
            | "reload"
            | "removeinitscript"
            | "screenshot"
            | "scroll"
            | "scrollinto"
            | "scrollintoview"
            | "select"
            | "session"
            | "sessions"
            | "set"
            | "setcontent"
            | "skills"
            | "skill"
            | "snapshot"
            | "state"
            | "status"
            | "storage"
            | "stream"
            | "swipe"
            | "tab"
            | "tabs"
            | "tap"
            | "trace"
            | "type"
            | "uncheck"
            | "update"
            | "upgrade"
            | "upload"
            | "vitals"
            | "wait"
            | "window"
    )
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
    let mut restore_requested = false;
    let mut restore_name = None;
    let mut restore_save = None;
    let mut restore_check_text = None;
    let mut state_path = None;
    let mut json_output = false;
    let mut ignored_global_flags = Vec::new();
    let mut domain_policy = DomainPolicyArgs::default();
    let mut action_policy = ActionPolicyArgs::default();
    let mut confirmation_policy = ConfirmationPolicyArgs::default();
    while let Some(first) = args.first().cloned() {
        if first == "--restore" {
            restore_requested = true;
            args.remove(0);
            if let Some(value) = args.first().filter(|value| is_optional_restore_key(value)) {
                let value = value.clone();
                args.remove(0);
                restore_name = Some(value.clone());
                if session_id.is_none() && session_name.is_none() {
                    set_session_name(&session_id, &mut session_name, value)?;
                }
            }
            continue;
        }
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
                "--restore-save" => {
                    validate_restore_save(&value)?;
                    restore_save = Some(value);
                }
                "--restore-check-text" => {
                    validate_non_empty_flag_value(&flag, &value)?;
                    restore_check_text = Some(value);
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
                "--headed"
                    | "--headless"
                    | "--content-boundaries"
                    | "--no-auto-dialog"
                    | "--hide-scrollbars"
            ) {
                if let Some(value) = args.first().and_then(|value| parse_bool_literal(value)) {
                    args.remove(0);
                    if value {
                        first.clone()
                    } else if first == "--headed" {
                        "--headless".to_string()
                    } else if first == "--headless" {
                        "--headed".to_string()
                    } else if first == "--no-auto-dialog" {
                        "--auto-dialog".to_string()
                    } else if first == "--hide-scrollbars" {
                        "--show-scrollbars".to_string()
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

    if command == "read" {
        let mut read_args = args.clone();
        read_args.remove(0);
        match parse_read_args(&mut read_args, &mut json_output)? {
            ParsedReadArgs::RemoteActiveTab => {}
            ParsedReadArgs::Url(options) => {
                return Ok(LocalCommand::ReadUrl {
                    json: json_output,
                    ignored_global_flags,
                    domain_policy,
                    options,
                });
            }
            ParsedReadArgs::ActiveUrl(options) => {
                return Ok(LocalCommand::ReadActiveUrl {
                    target: session_target,
                    json: json_output,
                    ignored_global_flags,
                    domain_policy,
                    action_policy,
                    confirmation_policy,
                    options,
                });
            }
        }
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
            "path" => {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                if let Some(option) = args.first().filter(|arg| arg.starts_with('-')) {
                    bail!("unsupported skills path option: {option}");
                }
                let name = args.first().cloned().unwrap_or_else(|| "core".to_string());
                if !args.is_empty() {
                    args.remove(0);
                }
                remove_json_flags(&mut args, &mut json_output);
                if let Some(extra) = args.first() {
                    bail!("unsupported skills path option: {extra}");
                }
                return Ok(LocalCommand::SkillsPath {
                    name,
                    json: json_output,
                });
            }
            other if other.starts_with('-') => bail!("unsupported skills option: {other}"),
            other => bail!("unsupported skills command: {other}; try `pire-browser skills list`"),
        }
    }

    if command == "plugin" || command == "plugins" {
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
                    bail!("unsupported plugin list option: {extra}");
                }
                return Ok(LocalCommand::PluginList { json: json_output });
            }
            "show" => {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                let Some(name) = args.first().cloned() else {
                    bail!("invalid_args: plugin show requires <name>");
                };
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                if let Some(extra) = args.first() {
                    bail!("unsupported plugin show option: {extra}");
                }
                return Ok(LocalCommand::PluginShow {
                    name,
                    json: json_output,
                });
            }
            "add" => {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                let Some(reference) = args.first().cloned() else {
                    bail!("invalid_args: plugin add requires <package-or-repo>");
                };
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                let mut name = None;
                let mut capabilities = Vec::new();
                let mut no_manifest = false;
                let mut global = false;
                let mut i = 0;
                while i < args.len() {
                    match args[i].as_str() {
                        "--json" => {
                            json_output = true;
                            i += 1;
                        }
                        "--name" => {
                            i += 1;
                            let Some(value) = args.get(i) else {
                                bail!("invalid_args: plugin add --name requires a value");
                            };
                            if value.trim().is_empty() {
                                bail!("invalid_args: plugin add --name cannot be empty");
                            }
                            name = Some(value.clone());
                            i += 1;
                        }
                        "--capability" => {
                            i += 1;
                            let Some(value) = args.get(i) else {
                                bail!("invalid_args: plugin add --capability requires a value");
                            };
                            if value.trim().is_empty() {
                                bail!("invalid_args: plugin add --capability cannot be empty");
                            }
                            capabilities.push(value.clone());
                            i += 1;
                        }
                        "--no-manifest" => {
                            no_manifest = true;
                            i += 1;
                        }
                        "--global" => {
                            global = true;
                            i += 1;
                        }
                        other if other.starts_with('-') => {
                            bail!("unsupported plugin add option: {other}");
                        }
                        other => bail!("unsupported plugin add argument: {other}"),
                    }
                }
                return Ok(LocalCommand::PluginAdd {
                    reference,
                    name,
                    capabilities,
                    no_manifest,
                    global,
                    json: json_output,
                });
            }
            "run" => {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                let Some(name) = args.first().cloned() else {
                    bail!("invalid_args: plugin run requires <name> <capability>");
                };
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                let Some(capability) = args.first().cloned() else {
                    bail!("invalid_args: plugin run requires <name> <capability>");
                };
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                let mut payload = json!({});
                let mut i = 0;
                while i < args.len() {
                    match args[i].as_str() {
                        "--json" => {
                            json_output = true;
                            i += 1;
                        }
                        "--payload" => {
                            i += 1;
                            let Some(raw_payload) = args.get(i) else {
                                bail!("invalid_args: plugin run --payload requires JSON");
                            };
                            payload = serde_json::from_str(raw_payload).map_err(|err| {
                                anyhow::anyhow!(
                                    "invalid_args: plugin run --payload must be valid JSON: {err}"
                                )
                            })?;
                            i += 1;
                        }
                        other if other.starts_with('-') => {
                            bail!("unsupported plugin run option: {other}");
                        }
                        other => bail!("unsupported plugin run argument: {other}"),
                    }
                }
                return Ok(LocalCommand::PluginRun {
                    name,
                    capability,
                    payload,
                    json: json_output,
                    ignored_global_flags,
                    confirmation_policy,
                });
            }
            other if other.starts_with('-') => bail!("unsupported plugin option: {other}"),
            other => bail!("unsupported plugin command: {other}; try `pire-browser plugin list`"),
        }
    }

    if command == "chat" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let mut max_steps = 5usize;
        let mut instruction_parts = Vec::new();
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--json" => json_output = true,
                "--max-steps" => {
                    i += 1;
                    let Some(value) = args.get(i) else {
                        bail!("invalid_args: chat --max-steps requires a positive integer");
                    };
                    max_steps = value.parse::<usize>().map_err(|_| {
                        anyhow::anyhow!(
                            "invalid_args: chat --max-steps requires a positive integer"
                        )
                    })?;
                    if max_steps == 0 {
                        bail!("invalid_args: chat --max-steps requires a positive integer");
                    }
                    max_steps = max_steps.min(20);
                }
                other if other.starts_with('-') => bail!("unsupported chat option: {other}"),
                other => instruction_parts.push(other.to_string()),
            }
            i += 1;
        }
        let instruction = if instruction_parts.is_empty() {
            None
        } else {
            Some(instruction_parts.join(" "))
        };
        return Ok(LocalCommand::Chat {
            json: json_output,
            ignored_global_flags,
            instruction,
            max_steps,
        });
    }

    if command == "install" {
        args.remove(0);
        let mut firefox_path = None;
        let mut with_deps = false;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--with-deps" => with_deps = true,
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
            with_deps,
        });
    }

    if command == "setup" {
        args.remove(0);
        let mut windows = false;
        let mut firefox_path = None;
        let mut with_deps = false;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--windows" => windows = true,
                "--with-deps" => with_deps = true,
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
            with_deps,
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
                "--headless" | "--headed" => {
                    i += 1;
                    if args
                        .get(i)
                        .and_then(|value| parse_bool_literal(value))
                        .is_none()
                    {
                        i -= 1;
                    }
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

    if command == "dashboard" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let action = match args.first().map(String::as_str) {
            Some("start") => {
                args.remove(0);
                DashboardAction::Start
            }
            Some("status") => {
                args.remove(0);
                DashboardAction::Status
            }
            Some("stop") => {
                args.remove(0);
                DashboardAction::Stop
            }
            _ => DashboardAction::Start,
        };
        remove_json_flags(&mut args, &mut json_output);
        let mut port = 4848;
        let mut background = false;
        let mut background_worker = false;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--json" => {
                    json_output = true;
                }
                "--background" if action == DashboardAction::Start => {
                    background = true;
                }
                "--background-worker" if action == DashboardAction::Start => {
                    background_worker = true;
                }
                "--port" if action == DashboardAction::Start => {
                    i += 1;
                    let Some(value) = args.get(i) else {
                        bail!("--port requires a port number");
                    };
                    port = value
                        .parse::<u16>()
                        .map_err(|_| anyhow::anyhow!("--port must be a TCP port number"))?;
                }
                "--port" => bail!("dashboard {action:?} does not support --port"),
                other if other.starts_with('-') => bail!("unsupported dashboard option: {other}"),
                other => bail!(
                    "unsupported dashboard command: {other}; try `pire-browser dashboard start`"
                ),
            }
            i += 1;
        }
        return Ok(LocalCommand::Dashboard {
            action,
            port,
            json: json_output,
            background,
            background_worker,
        });
    }

    if command == "stream" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        let action = match args.first().map(String::as_str) {
            Some("enable") => {
                args.remove(0);
                StreamAction::Enable
            }
            Some("status") => {
                args.remove(0);
                StreamAction::Status
            }
            Some("disable") => {
                args.remove(0);
                StreamAction::Disable
            }
            _ => StreamAction::Status,
        };
        remove_json_flags(&mut args, &mut json_output);
        let mut port = 4848;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--json" => {
                    json_output = true;
                }
                "--port" if action == StreamAction::Enable => {
                    i += 1;
                    let Some(value) = args.get(i) else {
                        bail!("--port requires a port number");
                    };
                    port = value
                        .parse::<u16>()
                        .map_err(|_| anyhow::anyhow!("--port must be a TCP port number"))?;
                }
                "--port" => bail!("stream {action:?} does not support --port"),
                other if other.starts_with('-') => bail!("unsupported stream option: {other}"),
                other => {
                    bail!("unsupported stream command: {other}; try `pire-browser stream status`")
                }
            }
            i += 1;
        }
        return Ok(LocalCommand::Stream {
            action,
            port,
            json: json_output,
        });
    }

    if command == "activity" {
        args.remove(0);
        remove_json_flags(&mut args, &mut json_output);
        if args.first().is_some_and(|arg| arg == "list") {
            args.remove(0);
        }
        remove_json_flags(&mut args, &mut json_output);
        let mut limit = 20usize;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--json" => json_output = true,
                "--limit" => {
                    i += 1;
                    let Some(value) = args.get(i) else {
                        bail!("--limit requires a positive integer");
                    };
                    limit = value
                        .parse::<usize>()
                        .map_err(|_| anyhow::anyhow!("--limit requires a positive integer"))?;
                    if limit == 0 {
                        bail!("--limit requires a positive integer");
                    }
                    limit = limit.min(100);
                }
                other if other.starts_with('-') => bail!("unsupported activity option: {other}"),
                other => {
                    bail!("unsupported activity command: {other}; try `pire-browser activity list`")
                }
            }
            i += 1;
        }
        return Ok(LocalCommand::ActivityList {
            json: json_output,
            limit,
        });
    }

    if command == "install-status" || command == "doctor" {
        let doctorish = command.clone();
        args.remove(0);
        let mut fix = false;
        let mut firefox_path = None;
        let mut with_deps = false;
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--json" => {
                    json_output = true;
                }
                "--offline" | "--quick" => {
                    // Compatibility flags: diagnostics stay local and quick in this backend.
                }
                "--fix" => {
                    fix = true;
                }
                "--with-deps" => {
                    with_deps = true;
                }
                "--firefox-path" => {
                    i += 1;
                    let Some(path) = args.get(i).cloned() else {
                        bail!("--firefox-path requires a path");
                    };
                    firefox_path = Some(path);
                }
                other => bail!("unsupported {doctorish} option: {other}"),
            }
            i += 1;
        }
        if fix {
            return Ok(LocalCommand::DoctorFix {
                json: json_output,
                firefox_path,
                with_deps,
            });
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
        let subcommand = args.first().map(String::as_str);
        if subcommand.is_none() {
            if command == "sessions" {
                return Ok(LocalCommand::SessionList { json: json_output });
            }
            return Ok(LocalCommand::SessionInfo {
                target: session_target,
                restore: RestoreCliOptions {
                    requested: restore_requested,
                    name: restore_name,
                    save: restore_save,
                    check_text: restore_check_text,
                },
                json: json_output,
            });
        }
        let subcommand = subcommand.unwrap_or("list");
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
            "info" => {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                if let Some(extra) = args.first() {
                    bail!("unsupported session info option: {extra}");
                }
                return Ok(LocalCommand::SessionInfo {
                    target: session_target,
                    restore: RestoreCliOptions {
                        requested: restore_requested,
                        name: restore_name,
                        save: restore_save,
                        check_text: restore_check_text,
                    },
                    json: json_output,
                });
            }
            "id" => {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
                let mut scope = SessionIdScope::Worktree;
                let mut prefix = "pire-browser".to_string();
                let mut i = 0;
                while i < args.len() {
                    match args[i].as_str() {
                        "--json" => json_output = true,
                        "--scope" => {
                            i += 1;
                            let Some(value) = args.get(i) else {
                                bail!("session id --scope requires worktree, cwd, or global");
                            };
                            scope = parse_session_id_scope(value)?;
                        }
                        "--prefix" => {
                            i += 1;
                            let Some(value) = args.get(i) else {
                                bail!("session id --prefix requires a value");
                            };
                            prefix = value.clone();
                        }
                        other => bail!("unsupported session id option: {other}"),
                    }
                    i += 1;
                }
                return Ok(LocalCommand::SessionId {
                    options: SessionIdOptions {
                        scope,
                        prefix,
                        json: json_output,
                    },
                });
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

        let subcommand = args.first().map(String::as_str);
        if matches!(subcommand, None | Some("list")) {
            if subcommand == Some("list") {
                args.remove(0);
                remove_json_flags(&mut args, &mut json_output);
            }
            if let Some(extra) = args.first() {
                bail!("unsupported profiles list option: {extra}");
            }
            return Ok(LocalCommand::ProfilesList { json: json_output });
        }

        if subcommand == Some("import") {
            args.remove(0);
            remove_json_flags(&mut args, &mut json_output);
            let mut source = None;
            let mut name = None;
            let mut overwrite = false;
            while let Some(arg) = args.first().cloned() {
                args.remove(0);
                match arg.as_str() {
                    "--json" => json_output = true,
                    "--overwrite" => overwrite = true,
                    "--name" => {
                        let Some(value) = args.first().cloned() else {
                            bail!("profiles import --name requires a managed profile name");
                        };
                        args.remove(0);
                        name = Some(value);
                    }
                    other if other.starts_with('-') => {
                        bail!("unsupported profiles import option: {other}")
                    }
                    other => {
                        if source.is_some() {
                            bail!("profiles import accepts exactly one Firefox profile directory");
                        }
                        source = Some(other.to_string());
                    }
                }
            }
            let Some(source) = source else {
                bail!("profiles import requires a Firefox profile directory");
            };
            let Some(name) = name else {
                bail!("profiles import requires --name <managed-name>");
            };
            return Ok(LocalCommand::ProfilesImport {
                json: json_output,
                source,
                name,
                overwrite,
            });
        }

        let extra = args
            .first()
            .cloned()
            .unwrap_or_else(|| "(missing)".to_string());
        bail!("unsupported profiles command: {extra}; try `pire-browser profiles list`");
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

fn validate_restore_save(value: &str) -> Result<()> {
    match value.trim().to_ascii_lowercase().as_str() {
        "auto" | "always" | "never" => Ok(()),
        _ => bail!("invalid_args: --restore-save requires auto, always, or never"),
    }
}

fn validate_non_empty_flag_value(flag: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        bail!("invalid_args: {flag} requires a non-empty value");
    }
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

pub fn session_id_value(options: &SessionIdOptions) -> Result<Value> {
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    session_id_value_for_cwd(options, &cwd)
}

fn session_id_value_for_cwd(options: &SessionIdOptions, cwd: &Path) -> Result<Value> {
    let prefix = sanitize_session_id_prefix(&options.prefix)?;
    let root = match options.scope {
        SessionIdScope::Worktree => Some(worktree_root_for_cwd(cwd)?),
        SessionIdScope::Cwd => Some(normalize_existing_path(cwd)),
        SessionIdScope::Global => None,
    };
    let root_text = root.as_ref().map(|path| session_path_string(path));
    let session = if let Some(root_key) = &root_text {
        format!("{prefix}-{}", short_stable_hash(&root_key))
    } else {
        prefix.clone()
    };
    validate_managed_profile_name(&session)?;
    let usage = format!("pire-browser --session {session} open <url>");
    Ok(json!({
        "text": session.clone(),
        "session": session.clone(),
        "scope": options.scope.as_str(),
        "prefix": prefix,
        "root": root_text,
        "usage": usage
    }))
}

fn session_path_string(path: &Path) -> String {
    let value = path.to_string_lossy().to_string();
    #[cfg(windows)]
    {
        if let Some(rest) = value.strip_prefix("\\\\?\\UNC\\") {
            return format!("\\\\{rest}");
        }
        if let Some(rest) = value.strip_prefix("\\\\?\\") {
            return rest.to_string();
        }
    }
    value
}

fn sanitize_session_id_prefix(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        bail!("invalid_args: session id --prefix requires a non-empty value");
    }
    let mut sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else if matches!(ch, '_' | '-' | '.' | ' ') {
                '-'
            } else {
                '-'
            }
        })
        .collect::<String>();
    while sanitized.contains("--") {
        sanitized = sanitized.replace("--", "-");
    }
    sanitized = sanitized.trim_matches(['-', '.']).to_string();
    if sanitized.is_empty() {
        bail!("invalid_args: session id --prefix must contain at least one letter or number");
    }
    Ok(sanitized)
}

fn worktree_root_for_cwd(cwd: &Path) -> Result<PathBuf> {
    let cwd = normalize_existing_path(cwd);
    for candidate in cwd.ancestors() {
        if candidate.join(".git").exists() {
            return Ok(candidate.to_path_buf());
        }
    }
    Ok(cwd)
}

fn normalize_existing_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
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

fn parse_session_id_scope(value: &str) -> Result<SessionIdScope> {
    match value {
        "worktree" => Ok(SessionIdScope::Worktree),
        "cwd" => Ok(SessionIdScope::Cwd),
        "global" => Ok(SessionIdScope::Global),
        _ => bail!("session id --scope must be worktree, cwd, or global"),
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

fn parse_read_args(args: &mut Vec<String>, json_output: &mut bool) -> Result<ParsedReadArgs> {
    let mut url = None;
    let mut raw = false;
    let mut require_md = false;
    let mut outline = false;
    let mut llms = None;
    let mut filter = None;
    let mut timeout_ms = READ_TIMEOUT_MS;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--json" => {
                *json_output = true;
            }
            "--raw" => raw = true,
            "--require-md" => require_md = true,
            "--outline" => outline = true,
            "--filter" => {
                i += 1;
                let Some(value) = args.get(i).cloned() else {
                    bail!("--filter requires a value");
                };
                filter = Some(value);
            }
            "--llms" => {
                i += 1;
                let Some(value) = args.get(i).cloned() else {
                    bail!("--llms requires index or full");
                };
                match value.as_str() {
                    "index" | "full" => llms = Some(value),
                    _ => bail!("invalid_args: --llms must be index or full"),
                }
            }
            "--timeout" => {
                i += 1;
                let Some(value) = args.get(i) else {
                    bail!("--timeout requires a value");
                };
                timeout_ms = parse_positive_timeout(value)?;
            }
            other if other.starts_with('-') => bail!("unsupported read option: {other}"),
            _ => {
                if url.is_some() {
                    bail!("unsupported read option: {}", args[i]);
                }
                url = Some(args[i].clone());
            }
        }
        i += 1;
    }
    if let Some(url) = url {
        return Ok(ParsedReadArgs::Url(ReadCommandOptions {
            url,
            raw,
            require_md,
            outline,
            llms,
            filter,
            timeout_ms,
        }));
    }
    if raw || require_md || llms.is_some() || timeout_ms != READ_TIMEOUT_MS {
        return Ok(ParsedReadArgs::ActiveUrl(ReadActiveUrlOptions {
            raw,
            require_md,
            outline,
            llms,
            filter,
            timeout_ms,
        }));
    }
    Ok(ParsedReadArgs::RemoteActiveTab)
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

fn ignored_with_warning_global_flag(_flag: &str) -> bool {
    false
}

pub fn help_text(topic: Option<&str>) -> Option<String> {
    let text = match topic.unwrap_or("").to_ascii_lowercase().as_str() {
        "" | "commands" => TOP_LEVEL_HELP,
        "status" => STATUS_HELP,
        "doctor" | "install-status" => DOCTOR_HELP,
        "chat" => CHAT_HELP,
        "config" | "--config" => CONFIG_HELP,
        "install" => INSTALL_HELP,
        "update" | "upgrade" => UPDATE_HELP,
        "open" | "goto" | "navigate" => OPEN_HELP,
        "read" => READ_HELP,
        "snapshot" => SNAPSHOT_HELP,
        "pdf" => PDF_HELP,
        "diff" => DIFF_HELP,
        "find" => FIND_HELP,
        "get" => GET_HELP,
        "is" => IS_HELP,
        "eval" | "evaluate" => EVAL_HELP,
        "click" => CLICK_HELP,
        "tap" => TAP_HELP,
        "dblclick" => DBLCLICK_HELP,
        "fill" => FILL_HELP,
        "type" => TYPE_HELP,
        "press" | "key" => PRESS_HELP,
        "keyboard" => KEYBOARD_HELP,
        "keydown" | "keyup" => KEY_EDGE_HELP,
        "hover" | "focus" => HOVER_FOCUS_HELP,
        "select" => SELECT_HELP,
        "check" | "uncheck" => CHECK_HELP,
        "scroll" => SCROLL_HELP,
        "scrollintoview" | "scrollinto" => SCROLL_INTO_VIEW_HELP,
        "wait" => WAIT_HELP,
        "back" | "forward" | "reload" => HISTORY_NAVIGATION_HELP,
        "pushstate" => PUSHSTATE_HELP,
        "console" => CONSOLE_HELP,
        "errors" => ERRORS_HELP,
        "dialog" | "dialogs" => DIALOG_HELP,
        "cookies" | "cookie" => COOKIES_HELP,
        "storage" => STORAGE_HELP,
        "network" => NETWORK_HELP,
        "trace" => TRACE_HELP,
        "profiler" => PROFILER_HELP,
        "record" => RECORD_HELP,
        "vitals" => VITALS_HELP,
        "react" => REACT_HELP,
        "highlight" => HIGHLIGHT_HELP,
        "set" => SET_HELP,
        "device" => DEVICE_HELP,
        "mouse" => MOUSE_HELP,
        "swipe" => SWIPE_HELP,
        "drag" => DRAG_HELP,
        "batch" => BATCH_HELP,
        "addinitscript" | "removeinitscript" | "setcontent" | "init-scripts" => INIT_SCRIPTS_HELP,
        "download" => DOWNLOAD_HELP,
        "upload" => UPLOAD_HELP,
        "clipboard" => CLIPBOARD_HELP,
        "auth" => AUTH_HELP,
        "plugin" | "plugins" => PLUGIN_HELP,
        "state" => STATE_HELP,
        "action-policy" => ACTION_POLICY_HELP,
        "confirmation" | "confirm" | "deny" | "confirm-actions" => CONFIRMATION_HELP,
        "session" | "sessions" => SESSION_HELP,
        "profiles" => PROFILES_HELP,
        "screenshot" => SCREENSHOT_HELP,
        "tabs" | "tab" => TABS_HELP,
        "frame" | "frames" | "iframe" | "iframes" => FRAME_HELP,
        "window" => WINDOW_HELP,
        "close" | "quit" | "exit" => CLOSE_HELP,
        "setup" => SETUP_HELP,
        "launch" => LAUNCH_HELP,
        "dashboard" => DASHBOARD_HELP,
        "stream" | "streaming" => STREAM_HELP,
        "activity" => ACTIVITY_HELP,
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
  install [--with-deps] [--firefox-path <path>]
                                    Register the Firefox Native Messaging host
  upgrade                         Check and apply a safe package update
  doctor [--json] [--offline] [--fix] [--with-deps]
                                  Check setup health; --fix repairs setup
  mcp [--tools core|network|state|debug|tabs|mobile|react|all]
                                  Start the MCP stdio server
  dashboard start [--port 4848] [--background]
                                  Start a local status/session/activity dashboard
  dashboard status|stop           Inspect or stop the background dashboard
  stream enable [--port 4848]     Start dashboard-backed live preview stream
  stream status|disable           Inspect or stop dashboard-backed preview stream
  activity list [--json]          Show recent redacted CLI command activity
  chat "open example.com and summarize it"
                                  Natural-language browser control via AI Gateway
  --config ./ci-config.json open <url>
  open                            Launch/reuse Firefox without navigating
  open <url> [--label <name>]      Open a URL, auto-launching Firefox if needed
  --headless open <url>            Launch managed Firefox headlessly for CI
  --no-auto-dialog open <url>      Disable page dialog auto-handling
  --args "-private-window" open <url>
                                  Pass Firefox args when launching a new session
  --user-agent "qa-bot/1.0" open <url>
                                  Override User-Agent for a new session
  open <url> --device "iPhone 14"
                                  Apply a device preset before first navigation
  open <url> --headers '{"Authorization":"Bearer token"}'
  --proxy http://proxy.example:8080 open <url>
  --allow-file-access open file:///path/to/page.html
  read <url>                      Fetch agent-readable text without Firefox
  read                            Read rendered text from the active Firefox tab
  snapshot                        Inspect the active page and print refs
  diff snapshot                    Compare current snapshot to previous
  diff screenshot --baseline before.png Compare current screenshot to baseline
  diff url <url1> <url2>           Compare two URLs by snapshot
  click '@e4'                     Click a ref from snapshot/find output
  tap '@e4'                       Tap/click a ref from snapshot/find output
  dblclick '@e4'                  Double-click a ref from snapshot/find output
  fill '@e2' "text"               Fill a ref from snapshot/find output
  type '@e2' "text"               Type into a ref from snapshot/find output
  press Enter                     Press a key at the current page focus
  keyboard type "hello"           Type with focused-page key events
  keyboard inserttext "hello"     Insert text at focus without key events
  keydown Shift                   Hold a key down at the current page focus
  keyup Shift                     Release a held key at the current page focus
  hover '@e4'                     Dispatch hover events for a ref/selector
  focus '@e2'                     Focus a ref/selector before keyboard input
  select '#country' US            Select an option in a <select>
  check '#terms'                  Check a checkbox or radio
  uncheck '#terms'                Uncheck a checkbox
  scroll down 500                 Scroll page or container
  scrollintoview '@e4'            Scroll a ref/selector into view
  find label "Email" fill "x@y"   Find by semantic locator and act
  get text '@e1'                  Read text/title/url/attrs/box/styles
  is visible '@e1'                Check visible/enabled/checked state
  wait --selector "#done"         Wait for page state
  back                            Navigate active tab back in history
  forward                         Navigate active tab forward in history
  reload                          Reload the active tab
  pushstate /dashboard            SPA client-side navigation in active page
  console                         Show recent page console messages
  errors                          Show recent page errors
  dialog status                   Show recently observed JavaScript dialogs
  dialog accept [text]            Accept next shimmed confirm/prompt
  dialog dismiss                  Dismiss next shimmed confirm/prompt
  cookies                         Show active URL cookies
  storage local [key]             Read active-origin localStorage
  network requests                Show recent page network requests
  network wait-for-response "**/api/**" Wait for matching API response
  network har network.har         Export recent request data as HAR
  network route "**/api/**" --body '{}' Mock or block active-tab requests
  trace start                     Start a Firefox QA evidence bundle
  trace stop trace.json           Stop and write trace bundle JSON
  profiler start                  Start Firefox performance profiling
  profiler stop profile.json      Stop and write trace-event JSON
  record start [recording-dir]    Start screenshot-sequence recording
  record restart recording-dir    Stop current recording and start the next
  record stop recording-dir       Stop and write frame evidence
  vitals [url]                    Measure best-effort Web Vitals for a page
  open --enable react-devtools <url>
                                  Open a React app with agent-browser-style opt-in
  react tree                      Show best-effort React component tree
  react inspect r1                Inspect React props, hooks, state, and source
  react renders start             Begin best-effort React render recording
  react renders stop              Stop and print React render profile
  react suspense                  Show best-effort React Suspense boundaries
  highlight '#submit'             Draw a visible overlay around a target
  device "iPhone 14"              Best-effort device viewport + UA/navigator shim
  set viewport 1280 720           Approximate the active page viewport
  mouse move 80 80                Dispatch page mouse events at viewport coords
  mouse down [left]               Press page mouse button
  mouse up [left]                 Release page mouse button
  mouse wheel 400 [0]             Dispatch page wheel event
  swipe up 500                    Best-effort mobile swipe as page scroll
  drag '@e1' '@e2'                Dispatch page drag/drop events
  batch "open <url>" "snapshot"    Run multiple commands in one invocation
  addinitscript <js>              Register a document-start init script
  removeinitscript init1          Remove a runtime init script
  setcontent '<h1>Hello</h1>'      Replace active page HTML for a repro
  download '@e4' out.txt          Click a target and save a download
  wait --download out.txt         Wait for a recent/new download and save it
  --download-path ./downloads open <url>
                                  Use a default Firefox download directory
  upload '#file' ./fixture.txt    Assign bounded files to an input or dropzone
  auth login app                  Open a saved login form and submit it
  auth login app --credential-provider vault --item "My App"
                                  Resolve credentials through a configured plugin
  plugin add agent-browser-plugin-captcha
                                  Add a plugin to project config
  plugin list                     List configured agent-browser protocol plugins
  plugin show vault               Show one configured plugin without running it
  plugin run captcha captcha.solve --payload '{"siteKey":"abc"}'
                                  Run a command.run/custom plugin capability
  clipboard read                  Read text from the system clipboard
  skills [list]                   List installed agent skills
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
  --session work --restore open <url>
                                  Agent-browser-style persistent session recipe
  --session-name work open <url>  Explicit named Firefox profile spelling
  --profile Work open <url>       Managed Firefox profile alias
  profiles [--json]               List managed Firefox profiles
  profiles import <dir> --name Work
                                  Copy a Firefox profile into a managed profile
  session                         Inspect current/default session target
  session list                    List live Firefox sessions
  session id --scope worktree --prefix my-app
                                  Print a stable project-scoped session name
  screenshot out.png              Capture screenshot evidence
  pdf page.pdf                    Capture an image-backed PDF of the page
  tab                             List tracked tabs
  tab new <url>                   Open a new tab and switch to it
  frame '@e3'                     Scope snapshots/actions to an iframe
  window                          List tracked Firefox windows
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
  pire-browser doctor --fix [--json] [--with-deps] [--firefox-path <path>]
  pire-browser install-status [--json]

Checks Firefox discovery, native messaging setup, extension build files, managed
profile state, live sessions, and CLI/PATH advisories. --offline and --quick are
accepted as no-op compatibility flags. Domain allowlist, action policy,
confirmation policy, and state policy entries are advisory diagnostics. --fix is
an explicit repair path that reruns native host setup and then verifies status.
"##;

const ACTIVITY_HELP: &str = r##"
Usage:
  pire-browser activity
  pire-browser activity list [--limit 20] [--json]

Shows the newest redacted pire-browser command activity recorded by the local
CLI launcher. The feed is bounded on disk and masks known secret-bearing
arguments such as passwords, headers, proxy credentials, cookie values, storage
values, and HTTP Basic credentials. It is intended for debugging agent runs and
for the local dashboard activity panel.
"##;

const CHAT_HELP: &str = r##"
Usage:
  pire-browser chat "open example.com and summarize it"
  pire-browser --model anthropic/claude-sonnet-4.6 chat "take a screenshot"
  pire-browser -q chat "summarize this page"
  pire-browser -v chat "fill the login form"
  pire-browser chat --max-steps 8
  pire-browser chat --json "fill the login form"

Runs an agent-browser-style natural-language browser loop. The model proposes
pire-browser commands as JSON, the CLI executes them through normal command
paths, and the model receives command output before deciding the next step or
final answer. The loop is bounded by --max-steps, default 5 and maximum 20.

Set AI_GATEWAY_API_KEY for Vercel AI Gateway. VERCEL_OIDC_TOKEN is also
accepted. The default AI_GATEWAY_URL is https://ai-gateway.vercel.sh and the
default AI_GATEWAY_MODEL is anthropic/claude-sonnet-4.6. Use --model or
AI_GATEWAY_MODEL to override the model. With no instruction, chat starts a
small terminal REPL; when stdin is piped, it reads one instruction from stdin.
"##;

const CONFIG_HELP: &str = r##"
Usage:
  # from a project that has ./pire-browser.json
  pire-browser open https://example.com
  pire-browser --config ./ci-config.json open https://example.com
  PIRE_BROWSER_CONFIG=./ci-config.json pire-browser open https://example.com

Loads pire-browser JSON defaults before command parsing. Auto-discovered
configs are loaded from ~/.pire-browser/config.json and ./pire-browser.json
when present. Agent-browser-compatible aliases ~/.agent-browser/config.json,
./agent-browser.json, and AGENT_BROWSER_CONFIG are also accepted. Missing
auto-discovered files are ignored. Malformed auto-discovered files print a
warning and continue; explicit --config, PIRE_BROWSER_CONFIG, or
AGENT_BROWSER_CONFIG paths must exist and contain a JSON object.

Supported camelCase defaults include json, profile, sessionName, session,
restore, restoreSave, state, autoConnect, allowedDomains, noAllowedDomains, actionPolicy,
confirmActions, confirmInteractive, noAutoDialog, hideScrollbars,
allowFileAccess, headed, headless, colorScheme, proxy, proxyBypass, args, userAgent, downloadPath,
maxOutput, contentBoundaries, engine, provider, model, and plugins. `plugins` configures
credential-provider and command/custom integrations; `plugin add` can write
entries, but configured plugins do not synthesize CLI flags. CLI flags override
config defaults. Unknown keys are ignored. `restore: true` or `--restore`
is an agent-browser-compatible persistence assertion; with a named session,
the managed Firefox profile already preserves browser state. `restore: "work"`
acts like `--restore work` when no explicit session/profile target is present.
`restoreSave: "auto"` is accepted for compatibility. `headless: true`, `--headless`,
PIRE_BROWSER_HEADLESS=1, and AGENT_BROWSER_HEADLESS=1 make newly launched
managed Firefox sessions run headlessly; existing live sessions keep their
current mode. `--no-auto-dialog`, AGENT_BROWSER_NO_AUTO_DIALOG=1, and
`noAutoDialog: true` disable pire-browser's page-shimmed dialog auto-handling
for command requests; native page dialogs may block Firefox until handled
manually. `args`, `userAgent`, `--args`, and `--user-agent` also apply only when
a new managed Firefox session is launched.
"##;

const OPEN_HELP: &str = r##"
Usage:
  pire-browser open
  pire-browser open <url> [--label <name>] [--new|--new-tab]
  pire-browser open <url> --headers '{"Authorization":"Bearer token"}'
  pire-browser --args "-private-window,--disable-features=Example" open <url>
  pire-browser --user-agent "qa-bot/1.0" open <url>
  pire-browser --proxy http://proxy.example:8080 open <url>
  pire-browser --proxy http://proxy.example:8080 --proxy-bypass "localhost,*.internal" open <url>
  pire-browser --download-path ./downloads open <url>
  pire-browser open --init-script <path> <url>
  pire-browser --allow-file-access open file:///path/to/page.html
  pire-browser goto <url>
  pire-browser navigate <url>

Opens or reuses the default managed Firefox session. With no URL, `open`
launches Firefox without navigating, matching agent-browser pre-navigation
setup recipes. With a URL, it opens a page in the default session,
auto-launching managed Firefox when needed.
`--new` and `--new-tab` open a new tab in the current managed Firefox window;
for a separate Firefox window, run `pire-browser window new` first, then open
the URL.
`--args <list>` passes comma- or newline-separated Firefox arguments when a new
managed session is launched. `--user-agent <value>` writes a Firefox
User-Agent override into that new managed profile. Existing live sessions keep
their current launch context.
`--allow-file-access` supports opening local HTML file URLs. PDF local-file
behavior is not supported yet.
`--headers <json>` applies request headers to the target URL's origin for the
current managed Firefox session. Values are not echoed; output reports header
names only. Headers are not applied to different origins.
`--proxy <url>` applies Firefox proxy settings through the managed extension for
browser bridge commands. `--proxy-bypass <list>` maps to Firefox passthrough
hosts. Proxy credentials may be supplied in the URL or with
PIRE_BROWSER_PROXY_USERNAME/PIRE_BROWSER_PROXY_PASSWORD; credentials are not
echoed in command output. Prefer `--proxy ... open <url>` over `launch --url`
when the first navigation must use the proxy.
Use `--profile <name-or-path>`, `--session <name>`, or `--session-name <name>`
before the command to reuse or launch a named managed Firefox profile. Path-like
`--profile` values are mapped to stable managed Firefox profile names instead
of using the path as a raw browser profile directory. Use `--allowed-domains "example.com,*.example.com"` or
PIRE_BROWSER_ALLOWED_DOMAINS for a cooperative wrong-site guardrail.
`--init-script <path>` may be repeated and registers Firefox document-start
scripts for that navigation in the managed Firefox session.
"##;

const READ_HELP: &str = r##"
Usage:
  pire-browser read <url>
  pire-browser read <url> --filter <text>
  pire-browser read <url> --outline
  pire-browser read <url> --llms index
  pire-browser read <url> --llms full
  pire-browser read --llms index
  pire-browser read <url> --require-md
  pire-browser read --require-md
  pire-browser read <url> --raw
  pire-browser read <url> --timeout <ms>
  pire-browser read

Reads agent-friendly text. With a URL, the CLI fetches the page directly without
launching Firefox, accepts markdown/plain/html, extracts readable text from HTML,
and honors domain/output guardrails. Without a URL, the command reads the
rendered text from the active Firefox tab, including client-side page state. If
`--llms`, `--require-md`, `--raw`, or `--timeout` is used without a URL, the CLI
first reads the active tab URL, then performs the same guarded URL fetch for
that HTTP resource.

`--llms index` walks ancestor paths for the nearest llms.txt. `--llms full`
walks ancestor paths for the nearest llms-full.txt. `--require-md` fails unless
the HTTP response is markdown. `--outline` returns page headings. `--filter`
narrows emitted lines to matches plus heading context.
"##;

const SNAPSHOT_HELP: &str = r##"
Usage:
  pire-browser snapshot
  pire-browser snapshot -i
  pire-browser snapshot -i -C
  pire-browser snapshot -i -c
  pire-browser snapshot -d 3
  pire-browser snapshot --depth 5
  pire-browser snapshot -i -c -C -d 5
  pire-browser snapshot -i -u
  pire-browser snapshot -s "#main"
  pire-browser snapshot --selector "#main"
  pire-browser snapshot --json

Prints a page snapshot with refs such as @e1. Bare `snapshot` is the
agent-browser-compatible default for AI inspection; `-i`/`--interactive` keeps
the compact legacy ref-list format available. `-c`/`--compact` suppresses low-value generic elements,
`-C`/`--cursor-interactive` includes visible cursor-pointer or inline onclick
elements such as clickable divs, `-d`/`--depth` limits DOM depth in the Firefox
snapshot model, `-u`/`--urls` includes link URLs, and `-s`/`--selector` scopes
to a CSS selector. Use quoted refs in PowerShell, for example:
pire-browser click '@e1'.
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
  pire-browser find role checkbox --name "Terms" check
  pire-browser find role combobox --name "Country" select US

Finds elements by supported selector families and can optionally perform an
action on the single match. Actions include `click`, `fill`, `type`, `hover`,
`focus`, `check`, `uncheck`, `select`, and `text`. Use `--exact` for whole
normalized text/name matching instead of substring matching.
"##;

const GET_HELP: &str = r##"
Usage:
  pire-browser get text <sel>
  pire-browser get html <sel>
  pire-browser get value <sel>
  pire-browser get attr <sel> <attr>
  pire-browser get title
  pire-browser get url
  pire-browser get count <sel>
  pire-browser get box <sel>
  pire-browser get styles <sel>

Reads page or element information from the active Firefox tab. Selectors may be
CSS selectors, refs from the latest snapshot or find output, `text=...`, or
`xpath=...`. Use `--json` when another tool needs the structured `value`.
Quote refs in PowerShell, for example: pire-browser get text '@e1'.
"##;

const IS_HELP: &str = r##"
Usage:
  pire-browser is visible <sel>
  pire-browser is enabled <sel>
  pire-browser is checked <sel>

Checks a target's current page state in the active Firefox tab. Selectors may be
CSS selectors, refs from the latest snapshot or find output, `text=...`, or
`xpath=...`. Re-run `snapshot -i` before using old refs after navigation or DOM
changes.
"##;

const EVAL_HELP: &str = r##"
Usage:
  pire-browser eval <js>
  pire-browser eval -b <base64-utf8-js>
  pire-browser eval --base64 <base64-utf8-js>
  echo "document.title" | pire-browser eval --stdin

Runs JavaScript in the active Firefox page after the normal policy and
confirmation checks. Use `-b`/`--base64` or `--stdin` for long scripts, scripts
with shell-sensitive quoting, or generated snippets. Base64 input must decode to
UTF-8 JavaScript. `--stdin` reads the entire piped input as the script.

Prefer targeted commands such as `get`, `is`, `find`, or `snapshot -i` when
they can answer the question without custom JavaScript.
"##;

const CLICK_HELP: &str = r##"
Usage:
  pire-browser click '@e4'
  pire-browser click "#submit"
  pire-browser click '@link-ref' --new-tab

Clicks a ref or selector. Use `--new-tab` or `--new` with link targets when
the click should open a new tab. If a ref is stale, rerun snapshot -i or find.
"##;

const TAP_HELP: &str = r##"
Usage:
  pire-browser tap '@e4'
  pire-browser tap "#submit"

Best-effort agent-browser-style alias for click. This dispatches the same
Firefox WebExtension page-level click path as `click`; it is not native touch
input or mobile browser emulation. If a ref is stale, rerun snapshot -i or find.
"##;

const DBLCLICK_HELP: &str = r##"
Usage:
  pire-browser dblclick '@e4'
  pire-browser dblclick "#item"

Double-clicks a ref or selector in the active Firefox tab. Use a fresh ref from
`snapshot -i` or semantic find output. If the page changes after the
double-click, verify with `snapshot -i`, `get`, or `is` before reporting
success.
"##;

const FILL_HELP: &str = r##"
Usage:
  pire-browser fill '@e2' "hello"
  pire-browser fill "input[name=email]" "hello@example.com"

Fills a ref or selector. Quote refs in PowerShell, for example '@e2'.
"##;

const TYPE_HELP: &str = r##"
Usage:
  pire-browser type '@e2' "hello"
  pire-browser type "input[name=email]" "hello@example.com"

Types into a ref or selector in the active Firefox tab. Use `fill` when you want
to clear an editable control first. Use `keyboard type <text>` when the target is
already focused and the page needs focused key events rather than a selector.
"##;

const PRESS_HELP: &str = r##"
Usage:
  pire-browser press Enter
  pire-browser press Tab
  pire-browser key Enter

Presses one key at the current page focus. Focus or click the intended control
first when the target is ambiguous. Use `keydown <key>` and `keyup <key>` when a
flow needs a held modifier key.
"##;

const KEYBOARD_HELP: &str = r##"
Usage:
  pire-browser keyboard type "hello"
  pire-browser keyboard inserttext "hello"

`keyboard type` dispatches focused-page key events for the provided text.
`keyboard inserttext` inserts text at the current focus without key events. Use
`focus <target>` or `click <target>` first when the focused element is unclear,
then verify with `get value`, `snapshot -i`, or another targeted check.
"##;

const KEY_EDGE_HELP: &str = r##"
Usage:
  pire-browser keydown Shift
  pire-browser keyup Shift

Dispatches a focused-page keydown or keyup event. These commands act at the
current page focus, so focus or click the intended control first. Use `press`
for one-shot keys such as Enter or Tab.
"##;

const HOVER_FOCUS_HELP: &str = r##"
Usage:
  pire-browser hover <sel>
  pire-browser focus <sel>

Dispatches page-level hover events or focuses a target in the active Firefox
tab. Selectors may be CSS selectors, refs from the latest snapshot or find
output, `text=...`, or `xpath=...`.

`hover` is best-effort: Firefox WebExtensions can dispatch hover/mouseover
events but cannot force native browser `:hover` state in every page. `focus`
is the preferred setup step before `keyboard type`, `keyboard inserttext`,
`keydown`, or `keyup` when you have a selector/ref.
"##;

const SELECT_HELP: &str = r##"
Usage:
  pire-browser select <sel> <value>
  pire-browser find role combobox --name "Country" select US

Selects an option in a targeted HTML <select> element and dispatches input and
change events. The value should match the option value. Use a fresh ref from
`snapshot -i` or a semantic find locator, then verify with `get value <sel>` or
`snapshot -i`.
"##;

const CHECK_HELP: &str = r##"
Usage:
  pire-browser check <sel>
  pire-browser uncheck <sel>
  pire-browser find role checkbox --name "Terms" check

Checks or unchecks a targeted checkbox or radio input and dispatches input and
change events. Use a fresh ref from `snapshot -i` or semantic find output, then
verify with `is checked <sel>` or a fresh snapshot. `uncheck` only applies to
checkboxes; radio buttons usually remain selected until another radio in the
group is checked.
"##;

const SCROLL_HELP: &str = r##"
Usage:
  pire-browser scroll down
  pire-browser scroll down 500
  pire-browser scroll up 500
  pire-browser scroll left 300
  pire-browser scroll right 300
  pire-browser scroll down 500 --selector "#panel"

Scrolls the page or a targeted scroll container in the active Firefox tab.
Directions are direct page movement, unlike `swipe`, which maps touch direction
to page scroll for agent-browser-style mobile recipes. Use
`scrollintoview <target>` when you already know the element you need.
"##;

const SCROLL_INTO_VIEW_HELP: &str = r##"
Usage:
  pire-browser scrollintoview <sel>
  pire-browser scrollinto <sel>

Scrolls a ref or selector into the visible viewport and returns the element box
when available. Selectors may be CSS selectors, refs from the latest snapshot or
find output, `text=...`, or `xpath=...`. Re-run `snapshot -i` after scrolling
before acting on stale refs.
"##;

const WAIT_HELP: &str = r##"
Usage:
  pire-browser wait 1000
  pire-browser wait '@e1'
  pire-browser wait --selector "#done" --timeout 5000
  pire-browser wait --text "Saved"
  pire-browser wait --url "**/dashboard"
  pire-browser wait --load networkidle
  pire-browser wait --fn "window.appReady === true"
  pire-browser wait --download out.txt --timeout 60000

Waits for a millisecond duration, ref, selector, text, URL pattern, function,
load state, or download. `--load networkidle` waits for document completion and
then for Firefox WebRequest activity in the active tab to stay quiet briefly.
`--fn <expression>` evaluates a page-world JavaScript expression until it is
truthy, so prefer short predicate expressions and avoid side effects.
Positional refs and selectors use the same locator handling as click/fill. Quote
refs in PowerShell, for example: pire-browser wait '@e1'.
"##;

const HISTORY_NAVIGATION_HELP: &str = r##"
Usage:
  pire-browser back
  pire-browser forward
  pire-browser reload

Navigates the active Firefox tab through browser history or reloads the current
page, matching agent-browser's history command shape. These commands may change
the page URL, document, focused frame, and element refs. Run `pire-browser wait`
when the destination needs time to settle, then take a fresh
`pire-browser snapshot -i` before acting on refs from the new page.
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

const DIALOG_HELP: &str = r##"
Usage:
  pire-browser dialog status [--json]
  pire-browser dialog accept [text]
  pire-browser dialog dismiss

Reports and configures JavaScript dialogs observed by the managed Firefox
content script. Dialog support is Firefox WebExtension mediated: alert,
confirm, and prompt are shimmed in the page context so they do not hard-block
the agent loop. Use global `--no-auto-dialog` or AGENT_BROWSER_NO_AUTO_DIALOG=1
to disable that page shim for agent-browser-compatible debugging; native page
dialogs may block Firefox until handled manually. `dialog accept [text]`
configures the next shimmed confirm or prompt to accept, using text as the
prompt return value; `dialog dismiss` configures the next shimmed confirm or
prompt to cancel. When a dialog is observed during another command, command
output includes PAGE_DIALOG warnings. Re-run `snapshot -i` after handling a
dialog before acting on refs.
"##;

const NETWORK_HELP: &str = r##"
Usage:
  pire-browser network requests [--json]
  pire-browser network requests --filter <pattern> [--type xhr,fetch] [--method POST] [--status 2xx]
  pire-browser network requests --clear [--json]
  pire-browser network request <requestId> [--json]
  pire-browser network wait-for-request <pattern> [--type xhr,fetch] [--method POST] [--timeout 10000] [--json]
  pire-browser network wait-for-response <pattern> [--type xhr,fetch] [--method POST] [--status 2xx] [--timeout 10000] [--json]
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
Use `network wait-for-request` before an action when you need to prove a request
started, and `network wait-for-response` when you need the matching HTTP
response before verification.

Route rules are active-tab scoped. They can mark pass-through requests, abort
matching requests, or mock with a simple body redirect. Use `network unroute`
before returning to normal behavior. `network har start` and `network har stop`
match agent-browser's recording loop; `network har [path]` exports currently
captured records directly. HAR output is built from Firefox WebExtension
records; request/response headers, captured outgoing request bodies, and
bounded text-like response previews are redacted/truncated when available.
Cookies, binary bodies, streaming payloads, and raw secrets are not captured.
Full CDP-style response control is not supported on the Firefox WebExtension
backend.
"##;

const COOKIES_HELP: &str = r##"
Usage:
  pire-browser cookies [--json]
  pire-browser cookies set <name> <value> [--json]
  pire-browser cookies set --curl <file-or-cookie-data> [--domain <domain>] [--json]
  pire-browser cookies clear [--json]

Lists, sets, or clears cookies visible to the active Firefox tab URL. Cookie
values may contain secrets; only print or share them when the user explicitly
needs that state for debugging. `cookies set --curl` imports cookies from a
Copy-as-cURL dump, JSON cookie array, object with a `cookies` array, or bare
Cookie header. Use `--domain <domain>` when staging cookies before navigation
from an about:blank tab.
"##;

const STORAGE_HELP: &str = r##"
Usage:
  pire-browser storage local [key] [--json]
  pire-browser storage local set <key> <value> [--json]
  pire-browser storage local clear [--json]
  pire-browser storage session [key] [--json]
  pire-browser storage session set <key> <value> [--json]
  pire-browser storage session clear [--json]

Reads or mutates active-origin Web Storage in the page context. `local` maps to
localStorage and `session` maps to sessionStorage. Values may contain secrets;
prefer targeted key reads over dumping the full storage area.
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

const TRACE_HELP: &str = r##"
Usage:
  pire-browser trace start [--json]
  pire-browser trace status [--json]
  pire-browser trace stop [output.json] [--json]

Records a Firefox QA evidence bundle for the active tab. `trace start` marks the
beginning of the window, `trace status` reports whether recording is active, and
`trace stop` writes a JSON bundle containing WebExtension-observable console
messages, page errors, network request metadata/HAR, best-effort vitals,
compact snapshot text, and screenshot evidence.

This is not a Chrome DevTools performance trace, CPU profile, or video capture.
"##;

const PROFILER_HELP: &str = r##"
Usage:
  pire-browser profiler start [--categories <csv>] [--json]
  pire-browser profiler status [--json]
  pire-browser profiler stop [output.json] [--json]

Records best-effort Firefox Performance Timeline evidence for the active tab.
`profiler start` marks the beginning of the window, `profiler status` reports
whether profiling is active, and `profiler stop` writes Chrome Trace
Event-shaped JSON that can be inspected by trace viewers such as Perfetto. If no
output path is provided, a generated temp JSON path is used.

`--categories` is accepted for agent-browser command-shape compatibility and is
recorded as metadata only. Firefox does not expose Chrome trace categories,
sampling JavaScript CPU profiles, or DevTools timeline internals to WebExtension
content scripts. This is not a Chrome DevTools CPU profile or sampling profiler.
"##;

const RECORD_HELP: &str = r##"
Usage:
  pire-browser record start [output-dir] [url] [--interval-ms 1000] [--max-frames 60] [--json]
  pire-browser record status [--json]
  pire-browser record stop [output-dir] [--json]
  pire-browser record restart [output-dir] [url] [--interval-ms 1000] [--max-frames 60] [--json]

Records a bounded Firefox screenshot-sequence evidence bundle for the active
tab. `record start` begins capturing visible viewport PNG frames. It can accept
an output directory for a later bare `record stop`, and an optional URL to open
before capturing the first frame. `record status` reports the active frame
count, `record stop` writes frame images plus `recording.json` under the output
directory, and `record restart` stops the current recording if present before
starting another. If no output directory is provided when a bundle is written, a
generated `pire-browser-recording-<timestamp>` directory is used.

This is not native WebM video, WebSocket viewport streaming, or Chrome DevTools
screencast output.
"##;

const REACT_HELP: &str = r##"
Usage:
  pire-browser open --enable react-devtools <url>
  pire-browser react tree
  pire-browser react tree --selector "#root" --depth 3
  pire-browser react inspect r1
  pire-browser react inspect '@e1'
  pire-browser react inspect '#root button'
  pire-browser react renders start
  pire-browser react renders stop [--json]
  pire-browser react suspense
  pire-browser react suspense --only-dynamic

Inspects React components in the active Firefox tab. The command names mirror
agent-browser's React workflow, but the Firefox backend is best-effort: it reads
React Fiber data attached to DOM nodes and uses a lightweight hook rather than
the full React DevTools extension. `open --enable react-devtools` is accepted
for command-shape compatibility and installs that hook before page JavaScript
runs.

Use `react tree` to get fresh component ids such as r1, then inspect a current
id with `react inspect r1`. Component ids are derived from the current page tree,
so rerun `react tree` after navigation, route changes, or large DOM updates.
`react inspect` also accepts refs from `snapshot -i` or CSS selectors and
inspects the nearest owning React component. Use `react renders start` before the
interaction of interest, then `react renders stop` to print a best-effort render
profile. Use `react suspense` for best-effort Suspense boundary state from
DOM-attached Fiber data; `--only-dynamic` shows currently fallback/dehydrated
boundaries.
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
  pire-browser device "iPhone 14"
  pire-browser set device "iPhone 14"
  pire-browser set geo <lat> <lng>
  pire-browser set headers <json>
  pire-browser set credentials <username> <password>
  pire-browser set media dark|light|auto
  pire-browser set offline on|off

Resizes the active Firefox window to approximate a requested content
viewport, then reports the requested size plus measured page innerWidth and
innerHeight. Firefox WebExtensions cannot enforce deviceScaleFactor or exact
CDP viewport metrics; `scale` is accepted and reported with a best-effort
warning.

`device <name>` applies a best-effort preset viewport for common devices such as
iPhone 14, iPhone 15 Pro, Pixel 7, Galaxy S22, and iPad. `set device <name>` is
a compatibility spelling for the same behavior. It also applies a request
User-Agent override for future requests and a best-effort page-level
navigator/touch shim for future navigations plus the active page. Native touch,
mobile browser chrome, and exact deviceScaleFactor are still not enforced on
the Firefox backend. Use `open <url> --device <name>` when the first navigation
must see the preset User-Agent.

`set geo <lat> <lng>` installs a best-effort page-level geolocation shim for
managed Firefox pages. It updates navigator.geolocation for future navigations
and tries to inject into the active page, but does not change Firefox's native
permission prompt, OS location services, IP-based location, or browser chrome
state.

`set headers <json>` applies request headers to the active page's origin for the
current managed Firefox session. Passing `{}` clears headers for that origin.
Values are not echoed; output reports header names only.

`set credentials <username> <password>` applies best-effort HTTP Basic auth to
the active page's origin for the current managed Firefox session. The password
is not echoed in output. Credentials are memory-only for the extension session,
not an encrypted auth vault.

`set media dark|light|auto` applies Firefox's webpage content color-scheme
override for the managed session.

`set offline on|off` toggles best-effort Firefox request blocking for managed
tabs. It cancels future network requests, but does not fully emulate CDP
offline mode: navigator.onLine, service worker cache behavior, DNS, and socket
state are not controlled.
"##;

const DEVICE_HELP: &str = r##"
Usage:
  pire-browser device "iPhone 14"
  pire-browser set device "iPhone 14"

Applies a best-effort preset viewport for common devices such as iPhone 14,
iPhone 15 Pro, Pixel 7, Galaxy S22, and iPad. This is an agent-browser-style
alias for `set device <name>`.

Firefox WebExtensions resize the managed Firefox window to approximate the
requested content viewport. They also apply a request User-Agent override for
future requests and a best-effort page-level navigator/touch shim for future
navigations plus the active page. Native touch, mobile browser chrome, and exact
deviceScaleFactor are still not enforced, so verify measured
page.innerWidth/page.innerHeight and page-visible navigator values before relying
on mobile-specific behavior.
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

const SWIPE_HELP: &str = r##"
Usage:
  pire-browser swipe up
  pire-browser swipe down 500
  pire-browser swipe left 300
  pire-browser swipe right 300

Best-effort agent-browser-style mobile swipe helper. Firefox WebExtensions
cannot dispatch native touch gestures, so this maps touch direction to page
scroll: swipe up scrolls down, swipe down scrolls up, swipe left scrolls right,
and swipe right scrolls left. Use `scroll` when you want direct scroll
direction rather than touch-gesture semantics.
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
  pire-browser batch "open <url>" "snapshot" "screenshot out.png"
  pire-browser batch --bail "open <url>" "click '@e1'" "screenshot out.png"
  echo '[["open","https://example.com"],["snapshot"]]' | pire-browser batch --json

Runs multiple browser commands in one invocation. `--bail` stops and returns the
first command error. With no inline commands, `batch` reads a JSON array from
stdin; each entry may be a command string or an array of args.
"##;

const INIT_SCRIPTS_HELP: &str = r##"
Usage:
  pire-browser addinitscript <js>
  pire-browser removeinitscript <identifier>
  pire-browser setcontent <html>
  pire-browser open --init-script <path> <url>

Registers JavaScript to run at document_start for future navigations in the
current managed Firefox session. Runtime registrations return an identifier
such as init1 that can be passed to removeinitscript. This is a best-effort
Firefox WebExtension compatibility path.

`setcontent <html>` replaces the active page document HTML. Use it for small
fixture/repro pages, then run `snapshot -i` before interacting. It is a
Firefox WebExtension document replacement, not CDP Page.setDocumentContent.
"##;

const DOWNLOAD_HELP: &str = r##"
Usage:
  pire-browser download <target> <path> [--timeout <ms>]
  pire-browser wait --download [path] [--timeout <ms>]

Clicks a ref/selector to trigger a Firefox download, or waits for a recent/new
download. The default timeout is 60000ms. Files are staged under the local
pire-browser data directory before being finalized to the requested path.
Use global `--download-path <dir>` or `PIRE_BROWSER_DOWNLOAD_PATH=<dir>` to set
the Firefox download directory for newly launched managed sessions. Relative
download paths resolve from the CLI current working directory. With no explicit
wait/download output path, `wait --download` reports the completed Firefox file.
Unknown MIME/helper-app dialogs can still stall until timeout on Firefox.
"##;

const UPLOAD_HELP: &str = r##"
Usage:
  pire-browser upload <target> <file> [more-files...] [--json]

Assigns bounded local files to a targeted input[type=file], associated label,
nested file input, or page dropzone in the active Firefox page. The CLI reads
files locally, stages payloads through the native host, and streams chunks to
the extension so Firefox's Native Messaging message limit is not exceeded.
Total raw upload bytes are capped at 8 MiB per command.

Dropzone uploads dispatch page dragenter/dragover/drop events with DataTransfer
files. Native OS file picker control, directory upload, and browser-chrome drag
state are not implemented.
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
  echo "pass" | pire-browser auth save <name> --url <url> --username <user> --password-stdin
  pire-browser auth save <name> --url <url> --username <user> --password <pass> --username-selector <sel> --password-selector <sel> --submit-selector <sel>
  pire-browser auth login <name>
  pire-browser auth login <name> --credential-provider <provider> --item <item-ref> --url <url>
  pire-browser --confirm-actions plugin:vault:credential.read auth login <name> --credential-provider vault --item <item-ref>
  pire-browser auth list
  pire-browser auth show <name>
  pire-browser auth delete <name>

Stores a best-effort local auth profile in an encrypted auth vault, then opens
the URL, fills username/password selectors, and clicks the submit selector on
login. Passwords are not printed by list/show output. Use --password-stdin to
avoid putting the password in shell history. The vault uses AES-256-GCM with
PIRE_BROWSER_AUTH_ENCRYPTION_KEY, PIRE_BROWSER_ENCRYPTION_KEY,
AGENT_BROWSER_ENCRYPTION_KEY, or an auto-generated local key file.
Credential-provider plugins use the agent-browser plugin protocol. Add them
with `pire-browser plugin add`, configure `plugins` with name, command, args,
and capability credential.read in pire-browser.json / agent-browser.json, or set
AGENT_BROWSER_PLUGINS to the same JSON array. The plugin receives
credential.resolve and must return credential with username, password, url, and
optional usernameSelector/passwordSelector/submitSelector. Plugin stderr and
plugin error text are suppressed for this core login path to reduce accidental
secret exposure.
"##;

const PLUGIN_HELP: &str = r##"
Usage:
  pire-browser plugin add <package-or-repo> [--name <name>] [--global] [--json]
  pire-browser plugin add <package-or-repo> --no-manifest --capability <name>... [--json]
  pire-browser plugin list [--json]
  pire-browser plugin show <name> [--json]
  pire-browser plugin run <name> <capability> [--payload <json>] [--json]

Lists, inspects, or explicitly runs configured agent-browser protocol plugins.
Plugin entries come from the `plugins` array in pire-browser config files or
from PIRE_BROWSER_PLUGINS / AGENT_BROWSER_PLUGINS. Use list/show before choosing
a plugin.

`plugin add` follows agent-browser's add flow. It probes the plugin manifest,
then writes the effective project config (`pire-browser.json` when present,
otherwise `agent-browser.json`) or `--global` config. npm-style references such
as `agent-browser-plugin-captcha` and `@company/agent-browser-plugin-vault` run
through `npx --yes`; GitHub references such as `org/agent-browser-plugin-cloud`
run through `npx --yes github:org/agent-browser-plugin-cloud`; local paths run
directly. Use `--no-manifest --capability <name>` when a plugin has no manifest.

`credential.read` providers run through `auth login --credential-provider`.
`plugin run` executes plugins that declare `command.run` and the requested
custom capability, for example `captcha.solve`. It cannot invoke core plugin
capabilities or protocol request types directly. Use `auth login
--credential-provider` for `credential.read`. Configured `launch.mutate`
plugins run before local Firefox launches and can append `launch.args`, set
`launch.userAgent`, or provide pre-navigation `launch.initScripts`; returned
`launch.extensions` and `browser.provider` are discoverable but not executed by
this Firefox backend.
Use `--confirm-actions plugin:<name>:<capability>` when a plugin capability
should require user approval before it runs. Plugin stderr is suppressed.
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

Saves, loads, lists, renames, clears, or inspects active-origin state for the
targeted Firefox page: cookies, localStorage, and sessionStorage. State files
contain secrets and should not be committed or shared. `state show`,
`state inspect`, and `state list` are metadata-only; they do not print cookie or
storage values. Management commands operate on `.pire-state` for bare names.
By default, `state save` writes plaintext files for compatibility. Set
PIRE_BROWSER_ENCRYPTION_KEY, or the agent-browser-compatible
AGENT_BROWSER_ENCRYPTION_KEY, to a 64-character hex AES-256 key to write and
load AES-256-GCM encrypted state files. Encrypted files still expose metadata
needed for list/show/inspect, but cookie and storage values stay encrypted.
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
For agent-browser-style project QA persistence, prefer
`--session <name> --restore <command>` with a name from `session id`; the named
Firefox profile preserves full browser state. Use state files when you need a
portable active-origin cookie/storage artifact.
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
  pire-browser session [--json]
  pire-browser session list [--json]
  pire-browser session info [--json]
  pire-browser session id [--scope worktree|cwd|global] [--prefix <name>] [--json]
  pire-browser session attach <id> [--json]
  pire-browser session cleanup [--json]
  pire-browser --session <uuid> snapshot -i
  pire-browser --session <name> open <url>
  pire-browser --session <name> --restore open <url>
  pire-browser --restore <name> open <url>
  pire-browser --session-name <name> open <url>
  pire-browser --profile <name-or-path> open <url>
  pire-browser --session-name <name> close

`session` is an agent-browser-compatible alias for `session info`: it reports
the current/default target, live session, managed Firefox profile, restore
interpretation, and next actions without launching Firefox. `session list`
lists all live Firefox extension sessions. This command also prints the
`--session <id>` prefix for a chosen session, derives a stable
agent-browser-style named session id for the current project, or removes stale
session files. `session id --scope worktree --prefix my-app` prints a
deterministic name that can be passed directly to `--session <name>` for project
QA loops.
`worktree` uses the nearest `.git` root and falls back to the current directory;
`cwd` uses the current directory; `global` returns the sanitized prefix without
a path hash.

`--session <uuid>` is strict live-id targeting. `--session <name>` reuses a
managed named Firefox profile; `--session-name <name>` is the explicit
named-profile spelling.
`--restore` is accepted for agent-browser-style persistent-session recipes.
With a named session, persistence is the managed Firefox profile itself, so
cookies, tabs, IndexedDB, service workers, saved passwords, and other Firefox
profile data survive browser restarts. `--restore <name>` may be used as a
short spelling for `--session <name> --restore` when no session/profile target
is already present. `--restore-save auto|always|never` is accepted for
compatibility; named Firefox profiles persist automatically.
`--profile <name-or-path>` is an alias for a reusable managed
Firefox profile. Path-like profile values are converted to stable managed names.
Close targets an existing named session only. Profile names may contain letters,
numbers, internal spaces, `_`, `-`, and `.`.
"##;

const PROFILES_HELP: &str = r##"
Usage:
  pire-browser profiles [--json]
  pire-browser profiles list [--json]
  pire-browser profiles import <firefox-profile-dir> --name <managed-name> [--overwrite] [--json]

Lists managed Firefox profiles known to pire-browser, including the default
profile path, launch metadata, and any live session id. This is best-effort
Firefox profile management under the local pire-browser data directory.
Path-like `--profile` values are mapped to stable managed names rather than
used as raw browser profile paths.

`profiles import` copies an existing Firefox profile directory into a managed
pire-browser profile. It never mutates the source profile and future changes in
the source do not sync. Close Firefox before importing so lock files and
partially-written profile data are not copied. Pass `--overwrite` to replace an
existing stopped managed profile.
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
`screenshots/` directory and the resolved path is printed. Native scrollbars
are hidden during screenshot capture by default for agent-browser-style stable
evidence; pass `--hide-scrollbars false` to keep them visible.
"##;

const TABS_HELP: &str = r##"
Usage:
  pire-browser tab
  pire-browser tab <tN-or-label>
  pire-browser tab new <url> [--label <name>]
  pire-browser tab list
  pire-browser tab close [tN-or-label]
  pire-browser tab label <tN> <label>
  pire-browser tabs list
  pire-browser tabs new <url> [--label <name>]
  pire-browser tabs select <tN-or-label>
  pire-browser tabs close [tN-or-label]
  pire-browser tabs label <tN> <label>

`tab` and `tabs` are aliases. Bare `tab` lists tracked tabs, matching
agent-browser. `tab <tN-or-label>` switches to a tab, and `tab close` closes the
active tab. Use this for new tabs inside the current managed Firefox window.
"##;

const FRAME_HELP: &str = r##"
Usage:
  pire-browser frame <selector-or-ref>
  pire-browser frame '@e3'
  pire-browser frame payment-frame
  pire-browser frame https://checkout.example/frame
  pire-browser frame main

Selects an iframe context for subsequent snapshots and selector-based actions
in the active Firefox tab. Use an iframe ref from `snapshot -i`, a selector
that targets an iframe element, or a frame name/id/title/label/URL. Refs inside
iframes carry frame context and usually work directly without switching first.
Run `frame main` to return to the main page. Re-run `snapshot -i` after
switching frames and use fresh refs.
"##;

const WINDOW_HELP: &str = r##"
Usage:
  pire-browser window
  pire-browser window list
  pire-browser window new
  pire-browser window switch <wN>
  pire-browser window close [wN]

Lists, opens, focuses, or closes Firefox windows in the active managed session.
Window ids are stable strings such as `w1` and `w2`. To follow a user request
such as "open a new window and go to a site", run `pire-browser window new`,
then `pire-browser open <url>`. Use `window list`, `window switch <wN>`, and
`window close <wN>` for popup-style OAuth, checkout, or SSO flows that escape
the original tab.
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
  pire-browser install [--with-deps] [--firefox-path <path>]

First-run setup command. Registers the Firefox Native Messaging host for the
current user. Normal path:

  npm install -g pire-browser
  pire-browser install
  pire-browser open https://example.com
  pire-browser snapshot

`--firefox-path` accepts the Firefox executable, a directory containing the
executable, or a macOS Firefox.app bundle. Use `pire-browser doctor` for
read-only diagnostics. Use `--with-deps` only when Firefox is missing or setup
fails: on Windows it tries winget or Chocolatey, on macOS it tries Homebrew, and
on Linux it reports non-Snap/non-Flatpak Firefox guidance without running sudo
package managers.
"##;

const UPDATE_HELP: &str = r##"
Usage:
  pire-browser upgrade
  pire-browser update check [--json]
  pire-browser update apply [--json]
  pire-browser update configure --mode off|notify|patch

`upgrade` is the agent-browser-style foreground update path. In npm/Pi installs,
the JavaScript launcher checks npm, then updates global npm or Pi-managed
installs to the latest package when no managed Firefox session is active. Local
project installs print the exact npm install command to run in that project.
Background auto-update and lower-level `update apply` stay patch-only.
"##;

const SETUP_HELP: &str = r##"
Usage:
  pire-browser setup [--with-deps] [--firefox-path <path>]
  pire-browser setup --windows [--with-deps] [--firefox-path <path>]

Registers the Firefox Native Messaging host for the current user. `--windows`
is a deprecated compatibility alias and is ignored on non-Windows platforms.
`--firefox-path` accepts the Firefox executable, a directory containing the
executable, or a macOS Firefox.app bundle. `pire-browser install` is a public
alias for this setup step and is preferred for first-run setup. After setup,
run `pire-browser open https://example.com` and `pire-browser snapshot`.
`--with-deps` prints platform dependency guidance and, on Windows/macOS only,
can try the supported userland Firefox installer when Firefox is missing.
"##;

const LAUNCH_HELP: &str = r##"
Usage:
  pire-browser launch [--profile Default] [--url <url>] [--firefox-path <path>] [--headless]
  pire-browser --args "-private-window" launch --url <url>
  pire-browser --user-agent "qa-bot/1.0" launch --url <url>

Lower-level launcher diagnostic. Prefer `pire-browser open` or
`pire-browser open <url>` for normal launch/navigation workflows.
Starts the managed Firefox profile and waits for the extension to connect.
`--headless` starts Firefox headlessly when creating a new managed session;
the default is visible/headed Firefox through web-ext.
Global `--args <list>` passes comma- or newline-separated Firefox arguments,
and global `--user-agent <value>` writes a Firefox User-Agent override when a
new managed session is launched. Existing live sessions keep their current
launch context.
For reusable named command workflows, use `--profile <name-or-path> <command>`,
`--session <name> <command>`, or `--session-name <name> <command>`.
`launch --profile <name-or-path>` only starts or reuses the profile.
"##;

const DASHBOARD_HELP: &str = r##"
Usage:
  pire-browser dashboard
  pire-browser dashboard start
  pire-browser dashboard start --port 4848
  pire-browser dashboard start --background
  pire-browser dashboard start --port 0 --json
  pire-browser dashboard status [--json]
  pire-browser dashboard stop [--json]

Starts a local dashboard server bound to 127.0.0.1. Without `--background`, it
runs in the foreground and stops with Ctrl+C. With `--background`, it records a
dashboard process state file so `dashboard status` and `dashboard stop` can
inspect or stop it later.

The dashboard shows setup status, live sessions, managed profiles, a live
viewport preview, optional AI Gateway chat, recent redacted command activity,
and current capability notes. The built-in preview polls Firefox
visible-viewport screenshots. Agent clients can connect to
ws://127.0.0.1:<port>/api/stream for screenshot-frame WebSocket streaming and
basic mouse/keyboard/touch-shaped input events. Dashboard chat uses the same
bounded command loop as `pire-browser chat` and is non-streaming. Native WebM
video and Chrome DevTools screencast output are not implemented.
"##;

const STREAM_HELP: &str = r##"
Usage:
  pire-browser stream enable [--port 4848] [--json]
  pire-browser stream status [--json]
  pire-browser stream disable [--json]

Agent-browser-style stream controls for the Firefox backend. `stream enable`
starts the same local dashboard server in the background and exposes
ws://127.0.0.1:<port>/api/stream for visible-viewport screenshot frames plus
basic mouse/keyboard/touch-shaped input events. `stream status` reports the
dashboard URL, WebSocket URL, transport, and live preview capabilities. `stream
disable` stops that background dashboard process.

This is screenshot-frame WebSocket streaming, not native WebM video or Chrome
DevTools screencast output.
"##;

const MCP_HELP: &str = r##"
Usage:
  pire-browser mcp
  pire-browser mcp --tools core
  pire-browser mcp --tools core,network
  pire-browser mcp --tools core,state
  pire-browser mcp --tools core,debug
  pire-browser mcp --tools core,tabs
  pire-browser mcp --tools all

Starts a Model Context Protocol server over stdio. Use the smallest tools
profile that fits the task. `core` is the default inspect-before-act workflow:
open/goto/navigate, inspect, interact, typed get/check state, semantic find, typed waits, navigation
helpers, screenshots/PDFs, diffs, eval/evaluate, status, tab list/new/switch/close, profiles, close, and
installed skill guidance. Add comma-separated profiles when needed: `network`,
`state`, `debug`, `tabs`, `mobile`, or `react`. The `state` profile includes
auth/state tools, plugin discovery, clipboard helpers, and profile import. The `debug` profile includes
lower-level launch, install/repair, user-requested package upgrade, typed batch, doctor/activity
diagnostics, console/errors, dialogs, highlight, trace/profiler/record evidence,
and vitals. Agent-browser-style action/tab/frame aliases are available alongside
older compatible names. The `react` profile exposes best-effort Firefox React
Fiber tree/inspect/render recording/Suspense tools and vitals.
Use `all` for every currently implemented MCP tool. The server defaults to MCP
protocol 2025-11-25 and accepts older supported client protocol versions during
initialization. Tool discovery is paginated for large profiles.

MCP client config:
{
  "mcpServers": {
    "pire-browser": {
      "command": "pire-browser",
      "args": ["mcp", "--tools", "core"]
    }
  }
}

If a needed tool is missing from the active profile, restart the MCP server with
the smallest combined profile that adds it, such as `--tools core,network`,
`--tools core,state`, `--tools core,tabs`, `--tools core,debug`, or
`--tools core,react`.
"##;

const SKILLS_HELP: &str = r##"
Usage:
  pire-browser skills [list] [--json]
  pire-browser skills list [--json]
  pire-browser skills cat core [--json]
  pire-browser skills get core [--full] [--json]
  pire-browser skills get dogfood [--full] [--json]
  pire-browser skills get --all [--json]
  pire-browser skills path [core] [--json]

Lists or prints installed agent skill guidance. `get` is an agent-browser-style
alias for `cat`; `--full` is accepted for compatibility because bundled skill
content is self-contained. `path` prints the installed skill directory when the
skill is filesystem-backed; native embedded skills report an `embedded:<name>`
source. The `skill` root is accepted as a compatibility alias, but public docs
prefer `skills`.
"##;

pub fn build_command_request(args: Vec<String>) -> RpcRequest {
    let invocation_cwd = env::current_dir()
        .ok()
        .map(|path| path.to_string_lossy().to_string());
    let mut params = json!({ "args": args, "invocationCwd": invocation_cwd });
    if let Some(auto_dialog) = effective_auto_dialog_from_env() {
        if let Some(object) = params.as_object_mut() {
            object.insert("autoDialog".to_string(), json!(auto_dialog));
        }
    }
    if let Some(hide_scrollbars) = effective_hide_scrollbars_from_env() {
        if let Some(object) = params.as_object_mut() {
            object.insert("hideScrollbars".to_string(), json!(hide_scrollbars));
        }
    }
    RpcRequest {
        id: Uuid::new_v4().to_string(),
        method: "command".to_string(),
        params,
    }
}

fn effective_auto_dialog_from_env() -> Option<bool> {
    env::var("PIRE_BROWSER_AUTO_DIALOG_EFFECTIVE")
        .ok()
        .and_then(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
}

fn effective_hide_scrollbars_from_env() -> Option<bool> {
    env::var("PIRE_BROWSER_HIDE_SCROLLBARS_EFFECTIVE")
        .ok()
        .and_then(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
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
    fn parses_chat_command_shape() {
        let command = parse_cli_args(&s(&[
            "--json",
            "-q",
            "--model",
            "anthropic/claude-sonnet-4.6",
            "chat",
            "--max-steps",
            "8",
            "open example.com",
        ]))
        .unwrap();
        assert_eq!(
            command,
            LocalCommand::Chat {
                json: true,
                ignored_global_flags: vec![],
                instruction: Some("open example.com".to_string()),
                max_steps: 8,
            }
        );
        assert!(matches!(
            parse_cli_args(&s(&["chat", "--max-steps", "0"])),
            Err(_)
        ));
    }

    #[test]
    fn help_includes_chat_command() {
        let top = help_text(None).unwrap();
        assert!(top.contains("chat \"open example.com"));
        let chat = help_text(Some("chat")).unwrap();
        assert!(chat.contains("AI_GATEWAY_API_KEY"));
        assert!(chat.contains("anthropic/claude-sonnet-4.6"));
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
    fn applies_launch_args_and_user_agent_config_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("pire-browser.json");
        fs::write(
            &config,
            r#"{
              "args": "-private-window,--disable-features=Example",
              "userAgent": "pire-test/1.0"
            }"#,
        )
        .unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&["open", "https://example.com"]),
            config_options(Some(config)),
        )
        .unwrap();
        assert_eq!(
            expanded.args[0..4],
            s(&[
                "--args",
                "-private-window,--disable-features=Example",
                "--user-agent",
                "pire-test/1.0"
            ])
        );
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Default,
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
    fn applies_restore_config_default_as_named_target() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("agent-browser.json");
        fs::write(&config, r#"{ "restore": "Work", "restoreSave": "auto" }"#).unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&["open", "https://example.com"]),
            config_options(Some(config)),
        )
        .unwrap();
        assert_eq!(
            expanded.args[0..4],
            s(&["--restore", "Work", "--restore-save", "auto"])
        );
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

        let config = dir.path().join("pire-browser-bool.json");
        fs::write(&config, r#"{ "restore": true }"#).unwrap();
        let expanded = apply_config_defaults_with_options(
            &s(&["--session", "work", "snapshot", "-i"]),
            config_options(Some(config)),
        )
        .unwrap();
        assert_eq!(expanded.args[0], "--restore");
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("work".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot", "-i"])
            }
        );

        let config = dir.path().join("pire-browser-explicit.json");
        fs::write(&config, r#"{ "restore": "ConfigName" }"#).unwrap();
        let expanded = apply_config_defaults_with_options(
            &s(&["--session", "explicit", "open", "https://example.com"]),
            config_options(Some(config)),
        )
        .unwrap();
        assert_eq!(expanded.args[0], "--restore");
        assert_eq!(expanded.args[1], "--session");
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("explicit".to_string()),
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
    fn applies_state_config_default_to_browser_commands_only() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("pire-browser.json");
        fs::write(&config, r#"{ "state": "./.pire-state/app.json" }"#).unwrap();

        let expanded = apply_config_defaults_with_options(
            &s(&["open", "https://example.com"]),
            config_options(Some(config.clone())),
        )
        .unwrap();
        assert_eq!(
            expanded.args[0..2],
            s(&["--state", "./.pire-state/app.json"])
        );
        assert!(matches!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::StateShortcut { .. }
        ));

        let explicit = apply_config_defaults_with_options(
            &s(&[
                "--state",
                "./.pire-state/explicit.json",
                "open",
                "https://example.com",
            ]),
            config_options(Some(config.clone())),
        )
        .unwrap();
        assert_eq!(
            explicit.args,
            s(&[
                "--state",
                "./.pire-state/explicit.json",
                "open",
                "https://example.com"
            ])
        );

        let status = apply_config_defaults_with_options(
            &s(&["status"]),
            config_options(Some(config.clone())),
        )
        .unwrap();
        assert_eq!(status.args, s(&["status"]));

        let unknown = apply_config_defaults_with_options(
            &s(&["made-up-command"]),
            config_options(Some(config)),
        )
        .unwrap();
        assert_eq!(unknown.args, s(&["made-up-command"]));
    }

    #[test]
    fn read_url_parses_as_local_no_browser_fetch() {
        assert_eq!(
            parse_cli_args(&s(&[
                "--allowed-domains",
                "example.com",
                "read",
                "https://example.com/docs",
                "--filter",
                "auth",
                "--outline",
                "--llms",
                "index",
                "--timeout",
                "2000",
                "--json",
            ]))
            .unwrap(),
            LocalCommand::ReadUrl {
                json: true,
                ignored_global_flags: vec![],
                domain_policy: DomainPolicyArgs {
                    allowed_domains: Some("example.com".to_string()),
                    no_allowed_domains: false,
                },
                options: ReadCommandOptions {
                    url: "https://example.com/docs".to_string(),
                    raw: false,
                    require_md: false,
                    outline: true,
                    llms: Some("index".to_string()),
                    filter: Some("auth".to_string()),
                    timeout_ms: 2000,
                }
            }
        );
    }

    #[test]
    fn read_without_url_parses_as_active_tab_remote_command() {
        assert_eq!(
            parse_cli_args(&s(&["read", "--filter", "auth"])).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["read", "--filter", "auth"])
            }
        );
    }

    #[test]
    fn read_llms_without_url_uses_active_tab_url_fetch() {
        assert_eq!(
            parse_cli_args(&s(&[
                "--session-name",
                "Docs",
                "read",
                "--llms",
                "index",
                "--filter",
                "auth",
                "--json",
            ]))
            .unwrap(),
            LocalCommand::ReadActiveUrl {
                target: SessionTarget::Name("Docs".to_string()),
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                options: ReadActiveUrlOptions {
                    raw: false,
                    require_md: false,
                    outline: false,
                    llms: Some("index".to_string()),
                    filter: Some("auth".to_string()),
                    timeout_ms: READ_TIMEOUT_MS,
                }
            }
        );
    }

    #[test]
    fn read_require_md_without_url_uses_active_tab_url_fetch() {
        assert_eq!(
            parse_cli_args(&s(&["read", "--require-md", "--timeout", "3000"])).unwrap(),
            LocalCommand::ReadActiveUrl {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                options: ReadActiveUrlOptions {
                    raw: false,
                    require_md: true,
                    outline: false,
                    llms: None,
                    filter: None,
                    timeout_ms: 3000,
                }
            }
        );
    }

    #[test]
    fn read_timeout_without_url_uses_active_tab_url_fetch() {
        assert_eq!(
            parse_cli_args(&s(&["read", "--timeout", "3000", "--filter", "auth"])).unwrap(),
            LocalCommand::ReadActiveUrl {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                options: ReadActiveUrlOptions {
                    raw: false,
                    require_md: false,
                    outline: false,
                    llms: None,
                    filter: Some("auth".to_string()),
                    timeout_ms: 3000,
                }
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
              "plugins": [{ "name": "vault", "command": "agent-browser-plugin-vault", "capabilities": ["credential.read"] }],
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
        assert!(expanded.config.get("plugins").is_some());
        assert!(expanded.config.get("unknownFutureKey").is_some());
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
                ignored_global_flags: vec![],
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
                ignored_global_flags: vec![],
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
                with_deps: false,
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
                firefox_path: Some("C:/Firefox/firefox.exe".to_string()),
                with_deps: false,
            }
        );

        let install = parse_cli_args(&s(&["install"])).unwrap();
        assert_eq!(
            install,
            LocalCommand::Setup {
                windows: false,
                firefox_path: None,
                with_deps: false,
            }
        );

        let install_with_deps = parse_cli_args(&s(&["install", "--with-deps"])).unwrap();
        assert_eq!(
            install_with_deps,
            LocalCommand::Setup {
                windows: false,
                firefox_path: None,
                with_deps: true,
            }
        );

        let install_with_path = parse_cli_args(&s(&[
            "install",
            "--with-deps",
            "--firefox-path",
            "/Applications/Firefox.app",
        ]))
        .unwrap();
        assert_eq!(
            install_with_path,
            LocalCommand::Setup {
                windows: false,
                firefox_path: Some("/Applications/Firefox.app".to_string()),
                with_deps: true,
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
        assert_eq!(
            parse_cli_args(&s(&["mcp", "--help"])).unwrap(),
            LocalCommand::Help {
                topic: Some("mcp".to_string())
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["plugin", "--help"])).unwrap(),
            LocalCommand::Help {
                topic: Some("plugin".to_string())
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
    fn parses_agent_browser_restore_flags_as_session_persistence_compat() {
        assert_eq!(
            parse_cli_args(&s(&[
                "--session",
                "work",
                "--restore",
                "--restore-save",
                "auto",
                "open",
                "https://example.com"
            ]))
            .unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("work".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );

        assert_eq!(
            parse_cli_args(&s(&["--restore", "work", "open", "https://example.com"])).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("work".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );

        assert_eq!(
            parse_cli_args(&s(&[
                "--session",
                "work",
                "--restore",
                "--restore-check-text",
                "Dashboard",
                "snapshot",
                "-i"
            ]))
            .unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("work".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot", "-i"])
            }
        );

        assert!(parse_cli_args(&s(&[
            "--restore-save",
            "sometimes",
            "open",
            "https://example.com"
        ]))
        .is_err());
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
    fn applies_agent_browser_restore_env_default_as_named_session() {
        let mut args = Vec::new();
        push_restore_env_defaults_from_value(
            &mut args,
            &s(&["open", "https://example.com"]),
            Some("work".to_string()),
        );
        assert_eq!(args, s(&["--restore", "work"]));
        assert_eq!(
            parse_cli_args(&[args, s(&["open", "https://example.com"])].concat()).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Name("work".to_string()),
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open", "https://example.com"])
            }
        );

        let mut args = Vec::new();
        push_restore_env_defaults_from_value(
            &mut args,
            &s(&["open", "https://example.com"]),
            Some("1".to_string()),
        );
        assert_eq!(args, s(&["--restore"]));

        let mut args = Vec::new();
        push_restore_env_defaults_from_value(
            &mut args,
            &s(&["--session", "explicit", "open", "https://example.com"]),
            Some("work".to_string()),
        );
        assert_eq!(args, s(&["--restore"]));

        let mut args = Vec::new();
        push_restore_env_defaults_from_value(
            &mut args,
            &s(&["open", "https://example.com"]),
            Some("false".to_string()),
        );
        assert!(args.is_empty());
    }

    #[test]
    fn applies_state_env_default_to_browser_commands_only() {
        let mut args = Vec::new();
        push_state_env_defaults_from_value(
            &mut args,
            &s(&["open", "https://example.com"]),
            Some("./.pire-state/env.json".to_string()),
        );
        assert_eq!(args, s(&["--state", "./.pire-state/env.json"]));

        let mut args = s(&["--state", "./.pire-state/config.json"]);
        push_state_env_defaults_from_value(
            &mut args,
            &s(&["open", "https://example.com"]),
            Some("./.pire-state/env.json".to_string()),
        );
        assert_eq!(args, s(&["--state", "./.pire-state/config.json"]));

        let mut args = Vec::new();
        push_state_env_defaults_from_value(
            &mut args,
            &s(&["state", "list"]),
            Some("./.pire-state/env.json".to_string()),
        );
        assert!(args.is_empty());

        let mut args = Vec::new();
        push_state_env_defaults_from_value(
            &mut args,
            &s(&["close"]),
            Some("./.pire-state/env.json".to_string()),
        );
        assert!(args.is_empty());

        let mut args = Vec::new();
        push_state_env_defaults_from_value(
            &mut args,
            &s(&["made-up-command"]),
            Some("./.pire-state/env.json".to_string()),
        );
        assert!(args.is_empty());
    }

    #[test]
    fn applies_init_script_env_defaults_to_navigation_commands_with_urls() {
        let mut args = s(&["open", "https://example.com"]);
        push_init_script_env_defaults_from_value(&mut args, Some("before-load.js".to_string()));
        assert_eq!(
            args,
            s(&[
                "open",
                "--init-script",
                "before-load.js",
                "https://example.com"
            ])
        );

        let mut args = s(&[
            "--profile",
            "Work",
            "open",
            "--label",
            "docs",
            "https://example.com",
        ]);
        push_init_script_env_defaults_from_value(&mut args, Some("init-a.js".to_string()));
        assert_eq!(
            args,
            s(&[
                "--profile",
                "Work",
                "open",
                "--init-script",
                "init-a.js",
                "--label",
                "docs",
                "https://example.com"
            ])
        );

        let mut args = s(&["open"]);
        push_init_script_env_defaults_from_value(&mut args, Some("before-load.js".to_string()));
        assert_eq!(args, s(&["open"]));

        let mut args = s(&[
            "open",
            "--init-script",
            "explicit.js",
            "https://example.com",
        ]);
        push_init_script_env_defaults_from_value(&mut args, Some("before-load.js".to_string()));
        assert_eq!(
            args,
            s(&[
                "open",
                "--init-script",
                "explicit.js",
                "https://example.com"
            ])
        );

        let mut args = s(&["snapshot", "-i"]);
        push_init_script_env_defaults_from_value(&mut args, Some("before-load.js".to_string()));
        assert_eq!(args, s(&["snapshot", "-i"]));
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
    fn parses_bare_open_as_remote_launch_command() {
        let parsed = parse_cli_args(&s(&["open"])).unwrap();
        assert_eq!(
            parsed,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open"])
            }
        );
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
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["snapshot", "-i"])
            }
        );
    }

    #[test]
    fn accepts_proxy_global_flags_before_command() {
        let parsed = parse_cli_args(&s(&[
            "--proxy",
            "http://proxy.example:8080",
            "--proxy-bypass",
            "localhost,*.internal",
            "open",
            "https://example.com",
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
                args: s(&["open", "https://example.com"])
            }
        );
    }

    #[test]
    fn accepts_launch_args_and_user_agent_as_global_flags() {
        let parsed = parse_cli_args(&s(&[
            "--args",
            "-private-window,--disable-features=Example",
            "--user-agent",
            "pire-test/1.0",
            "open",
            "https://example.com",
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
                args: s(&["open", "https://example.com"])
            }
        );
    }

    #[test]
    fn headless_global_flag_is_a_launch_preference_without_ignored_warning() {
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
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["get", "title"])
            }
        );
    }

    #[test]
    fn no_auto_dialog_global_flag_is_a_launch_preference_without_ignored_warning() {
        let parsed = parse_cli_args(&s(&[
            "--no-auto-dialog",
            "--color-scheme",
            "dark",
            "open",
            "https://example.com",
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
                args: s(&["open", "https://example.com"])
            }
        );

        let parsed_false =
            parse_cli_args(&s(&["--no-auto-dialog", "false", "snapshot", "--json"])).unwrap();
        assert_eq!(
            parsed_false,
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
    fn hide_scrollbars_global_flag_is_screenshot_preference_without_ignored_warning() {
        let parsed = parse_cli_args(&s(&[
            "--hide-scrollbars",
            "false",
            "screenshot",
            "page.png",
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
                args: s(&["screenshot", "page.png"])
            }
        );

        let parsed_zero =
            parse_cli_args(&s(&["--hide-scrollbars", "0", "screenshot", "--json"])).unwrap();
        assert_eq!(
            parsed_zero,
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: true,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["screenshot"])
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
    fn applies_no_auto_dialog_config_default() {
        let dir = tempfile::tempdir().unwrap();
        let enabled = dir.path().join("enabled.json");
        fs::write(&enabled, r#"{ "noAutoDialog": true }"#).unwrap();
        let expanded =
            apply_config_defaults_with_options(&s(&["open"]), config_options(Some(enabled)))
                .unwrap();
        assert!(expanded.args.contains(&"--no-auto-dialog".to_string()));
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["open"])
            }
        );
    }

    #[test]
    fn applies_hide_scrollbars_config_default_with_false_opt_out() {
        let dir = tempfile::tempdir().unwrap();
        let disabled = dir.path().join("disabled.json");
        fs::write(&disabled, r#"{ "hideScrollbars": false }"#).unwrap();
        let expanded =
            apply_config_defaults_with_options(&s(&["screenshot"]), config_options(Some(disabled)))
                .unwrap();
        assert_eq!(
            &expanded.args[..2],
            &["--hide-scrollbars".to_string(), "false".to_string()]
        );
        assert_eq!(
            parse_cli_args(&expanded.args).unwrap(),
            LocalCommand::Remote {
                target: SessionTarget::Default,
                json: false,
                ignored_global_flags: vec![],
                domain_policy: default_domain_policy(),
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                args: s(&["screenshot"])
            }
        );

        let enabled = dir.path().join("enabled.json");
        fs::write(&enabled, r#"{ "hideScrollbars": true }"#).unwrap();
        let expanded =
            apply_config_defaults_with_options(&s(&["screenshot"]), config_options(Some(enabled)))
                .unwrap();
        assert_eq!(
            &expanded.args[..2],
            &["--hide-scrollbars".to_string(), "true".to_string()]
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
            "--download-path",
            "downloads",
            "wait",
            "--download",
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
                action_policy: default_action_policy(),
                confirmation_policy: default_confirmation_policy(),
                path: None,
                timeout_ms: DOWNLOAD_TIMEOUT_MS,
            }
        );

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
            parse_cli_args(&s(&["session", "--json"])).unwrap(),
            LocalCommand::SessionInfo {
                target: SessionTarget::Default,
                restore: RestoreCliOptions::default(),
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["session"])).unwrap(),
            LocalCommand::SessionInfo {
                target: SessionTarget::Default,
                restore: RestoreCliOptions::default(),
                json: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["session", "info", "--json"])).unwrap(),
            LocalCommand::SessionInfo {
                target: SessionTarget::Default,
                restore: RestoreCliOptions::default(),
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "--session",
                "work",
                "--restore",
                "--restore-save",
                "auto",
                "session",
                "info",
                "--json"
            ]))
            .unwrap(),
            LocalCommand::SessionInfo {
                target: SessionTarget::Name("work".to_string()),
                restore: RestoreCliOptions {
                    requested: true,
                    name: None,
                    save: Some("auto".to_string()),
                    check_text: None,
                },
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["--restore", "work", "session", "info"])).unwrap(),
            LocalCommand::SessionInfo {
                target: SessionTarget::Name("work".to_string()),
                restore: RestoreCliOptions {
                    requested: true,
                    name: Some("work".to_string()),
                    save: None,
                    check_text: None,
                },
                json: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["session", "attach", "abc", "--json"])).unwrap(),
            LocalCommand::SessionAttach {
                session: "abc".to_string(),
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["session", "id"])).unwrap(),
            LocalCommand::SessionId {
                options: SessionIdOptions {
                    scope: SessionIdScope::Worktree,
                    prefix: "pire-browser".to_string(),
                    json: false
                }
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "session", "id", "--scope", "worktree", "--prefix", "my-app", "--json"
            ]))
            .unwrap(),
            LocalCommand::SessionId {
                options: SessionIdOptions {
                    scope: SessionIdScope::Worktree,
                    prefix: "my-app".to_string(),
                    json: true
                }
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["session", "cleanup"])).unwrap(),
            LocalCommand::SessionCleanup { json: false }
        );
        assert!(parse_cli_args(&s(&["session", "id", "--scope", "branch"])).is_err());
        assert!(parse_cli_args(&s(&["session", "rename", "abc"])).is_err());
    }

    #[test]
    fn derives_stable_worktree_session_id() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("repo");
        let child = root.join("app").join("web");
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(&child).unwrap();

        let options = SessionIdOptions {
            scope: SessionIdScope::Worktree,
            prefix: "My App".to_string(),
            json: true,
        };
        let value = session_id_value_for_cwd(&options, &child).unwrap();
        let session = value["session"].as_str().unwrap();
        assert!(session.starts_with("my-app-"));
        assert_eq!(value["text"].as_str(), Some(session));
        assert_eq!(value["scope"].as_str(), Some("worktree"));
        assert_eq!(
            value["root"].as_str(),
            Some(session_path_string(&fs::canonicalize(&root).unwrap()).as_str())
        );
        assert_eq!(
            session_id_value_for_cwd(&options, &child).unwrap()["session"],
            value["session"]
        );

        let cwd_options = SessionIdOptions {
            scope: SessionIdScope::Cwd,
            prefix: "My App".to_string(),
            json: true,
        };
        let cwd_value = session_id_value_for_cwd(&cwd_options, &child).unwrap();
        assert_ne!(cwd_value["session"], value["session"]);
        assert_eq!(
            cwd_value["root"].as_str(),
            Some(session_path_string(&fs::canonicalize(&child).unwrap()).as_str())
        );
    }

    #[test]
    fn derives_global_session_id_from_sanitized_prefix() {
        let dir = tempfile::tempdir().unwrap();
        let options = SessionIdOptions {
            scope: SessionIdScope::Global,
            prefix: " My App! ".to_string(),
            json: false,
        };
        let value = session_id_value_for_cwd(&options, dir.path()).unwrap();
        assert_eq!(value["session"].as_str(), Some("my-app"));
        assert_eq!(value["text"].as_str(), Some("my-app"));
        assert_eq!(value["prefix"].as_str(), Some("my-app"));
        assert_eq!(value["scope"].as_str(), Some("global"));
        assert!(value["root"].is_null());
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
        assert_eq!(
            parse_cli_args(&s(&["profiles", "list", "--json"])).unwrap(),
            LocalCommand::ProfilesList { json: true }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "profiles",
                "import",
                "C:/Users/me/AppData/Roaming/Mozilla/Firefox/Profiles/abc.default",
                "--name",
                "Work",
                "--overwrite",
                "--json",
            ]))
            .unwrap(),
            LocalCommand::ProfilesImport {
                json: true,
                source: "C:/Users/me/AppData/Roaming/Mozilla/Firefox/Profiles/abc.default"
                    .to_string(),
                name: "Work".to_string(),
                overwrite: true,
            }
        );
        assert!(parse_cli_args(&s(&["profiles", "import", "--name", "Work"])).is_err());
        assert!(parse_cli_args(&s(&["profiles", "import", "profile-dir"])).is_err());
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
            parse_cli_args(&s(&["skills", "get", "dogfood", "--json"])).unwrap(),
            LocalCommand::SkillsCat {
                name: "dogfood".to_string(),
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
        assert_eq!(
            parse_cli_args(&s(&["skills", "path"])).unwrap(),
            LocalCommand::SkillsPath {
                name: "core".to_string(),
                json: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["skills", "path", "core", "--json"])).unwrap(),
            LocalCommand::SkillsPath {
                name: "core".to_string(),
                json: true
            }
        );
        assert!(parse_cli_args(&s(&["skills", "cat"])).is_err());
        assert!(parse_cli_args(&s(&["skills", "path", "--bad"])).is_err());
        assert!(parse_cli_args(&s(&["skills", "show", "core"])).is_err());
    }

    #[test]
    fn parses_plugin_commands() {
        assert_eq!(
            parse_cli_args(&s(&["plugin"])).unwrap(),
            LocalCommand::PluginList { json: false }
        );
        assert_eq!(
            parse_cli_args(&s(&["plugins", "list", "--json"])).unwrap(),
            LocalCommand::PluginList { json: true }
        );
        assert_eq!(
            parse_cli_args(&s(&["--json", "plugin", "list"])).unwrap(),
            LocalCommand::PluginList { json: true }
        );
        assert_eq!(
            parse_cli_args(&s(&["plugin", "show", "vault"])).unwrap(),
            LocalCommand::PluginShow {
                name: "vault".to_string(),
                json: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["plugin", "show", "vault", "--json"])).unwrap(),
            LocalCommand::PluginShow {
                name: "vault".to_string(),
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "plugin",
                "add",
                "agent-browser-plugin-captcha",
                "--json"
            ]))
            .unwrap(),
            LocalCommand::PluginAdd {
                reference: "agent-browser-plugin-captcha".to_string(),
                name: None,
                capabilities: vec![],
                no_manifest: false,
                global: false,
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "plugin",
                "add",
                "@company/agent-browser-plugin-vault",
                "--name",
                "vault",
                "--global"
            ]))
            .unwrap(),
            LocalCommand::PluginAdd {
                reference: "@company/agent-browser-plugin-vault".to_string(),
                name: Some("vault".to_string()),
                capabilities: vec![],
                no_manifest: false,
                global: true,
                json: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "plugins",
                "add",
                "org/agent-browser-plugin-cloud-browser",
                "--no-manifest",
                "--capability",
                "command.run",
                "--capability",
                "cloud.launch"
            ]))
            .unwrap(),
            LocalCommand::PluginAdd {
                reference: "org/agent-browser-plugin-cloud-browser".to_string(),
                name: None,
                capabilities: s(&["command.run", "cloud.launch"]),
                no_manifest: true,
                global: false,
                json: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "--confirm-actions",
                "plugin:captcha:captcha.solve",
                "plugin",
                "run",
                "captcha",
                "captcha.solve",
                "--payload",
                r#"{"siteKey":"abc","url":"https://example.com"}"#,
                "--json"
            ]))
            .unwrap(),
            LocalCommand::PluginRun {
                name: "captcha".to_string(),
                capability: "captcha.solve".to_string(),
                payload: json!({"siteKey": "abc", "url": "https://example.com"}),
                json: true,
                ignored_global_flags: vec![],
                confirmation_policy: ConfirmationPolicyArgs {
                    confirm_actions: Some("plugin:captcha:captcha.solve".to_string()),
                    confirm_interactive: false,
                }
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["plugins", "run", "echo", "command.run"])).unwrap(),
            LocalCommand::PluginRun {
                name: "echo".to_string(),
                capability: "command.run".to_string(),
                payload: json!({}),
                json: false,
                ignored_global_flags: vec![],
                confirmation_policy: default_confirmation_policy()
            }
        );
        assert!(parse_cli_args(&s(&["plugin", "show"])).is_err());
        assert!(parse_cli_args(&s(&["plugin", "add"])).is_err());
        assert!(parse_cli_args(&s(&[
            "plugin",
            "add",
            "agent-browser-plugin-vault",
            "--name"
        ]))
        .is_err());
        assert!(parse_cli_args(&s(&[
            "plugin",
            "add",
            "agent-browser-plugin-vault",
            "--capability"
        ]))
        .is_err());
        assert!(parse_cli_args(&s(&["plugin", "run", "vault"])).is_err());
        assert!(parse_cli_args(&s(&["plugin", "run", "vault", "x", "--payload"])).is_err());
        assert!(parse_cli_args(&s(&["plugin", "run", "vault", "x", "--payload", "{"])).is_err());
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
        assert_eq!(
            parse_cli_args(&s(&["mcp", "--tools", "core,network"])).unwrap(),
            LocalCommand::Mcp {
                tools: "core,network".to_string()
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["mcp", "--tools", "tabs"])).unwrap(),
            LocalCommand::Mcp {
                tools: "tabs".to_string()
            }
        );
        assert!(parse_cli_args(&s(&["mcp", "--tools"])).is_err());
        assert!(parse_cli_args(&s(&["mcp", "--bad"])).is_err());
    }

    #[test]
    fn parses_dashboard_command() {
        assert_eq!(
            parse_cli_args(&s(&["dashboard"])).unwrap(),
            LocalCommand::Dashboard {
                action: DashboardAction::Start,
                port: 4848,
                json: false,
                background: false,
                background_worker: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["dashboard", "start", "--port", "0", "--json"])).unwrap(),
            LocalCommand::Dashboard {
                action: DashboardAction::Start,
                port: 0,
                json: true,
                background: false,
                background_worker: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["--json", "dashboard", "--port", "9223"])).unwrap(),
            LocalCommand::Dashboard {
                action: DashboardAction::Start,
                port: 9223,
                json: true,
                background: false,
                background_worker: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["dashboard", "start", "--background"])).unwrap(),
            LocalCommand::Dashboard {
                action: DashboardAction::Start,
                port: 4848,
                json: false,
                background: true,
                background_worker: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["dashboard", "status", "--json"])).unwrap(),
            LocalCommand::Dashboard {
                action: DashboardAction::Status,
                port: 4848,
                json: true,
                background: false,
                background_worker: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["dashboard", "stop"])).unwrap(),
            LocalCommand::Dashboard {
                action: DashboardAction::Stop,
                port: 4848,
                json: false,
                background: false,
                background_worker: false
            }
        );
        assert!(parse_cli_args(&s(&["dashboard", "status", "--port", "9223"])).is_err());
        assert!(parse_cli_args(&s(&["dashboard", "--port", "nope"])).is_err());
    }

    #[test]
    fn parses_stream_command() {
        assert_eq!(
            parse_cli_args(&s(&["stream"])).unwrap(),
            LocalCommand::Stream {
                action: StreamAction::Status,
                port: 4848,
                json: false
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["stream", "status", "--json"])).unwrap(),
            LocalCommand::Stream {
                action: StreamAction::Status,
                port: 4848,
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["--json", "stream", "enable", "--port", "9223"])).unwrap(),
            LocalCommand::Stream {
                action: StreamAction::Enable,
                port: 9223,
                json: true
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["stream", "disable"])).unwrap(),
            LocalCommand::Stream {
                action: StreamAction::Disable,
                port: 4848,
                json: false
            }
        );
        assert!(parse_cli_args(&s(&["stream", "status", "--port", "9223"])).is_err());
        assert!(parse_cli_args(&s(&["stream", "enable", "--port", "nope"])).is_err());
        assert!(parse_cli_args(&s(&["stream", "restart"])).is_err());
    }

    #[test]
    fn parses_activity_command() {
        assert_eq!(
            parse_cli_args(&s(&["activity"])).unwrap(),
            LocalCommand::ActivityList {
                json: false,
                limit: 20
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["activity", "list", "--limit", "3", "--json"])).unwrap(),
            LocalCommand::ActivityList {
                json: true,
                limit: 3
            }
        );
        assert_eq!(
            parse_cli_args(&s(&["--json", "activity", "--limit", "250"])).unwrap(),
            LocalCommand::ActivityList {
                json: true,
                limit: 100
            }
        );
        assert!(parse_cli_args(&s(&["activity", "--limit", "0"])).is_err());
        assert!(parse_cli_args(&s(&["activity", "clear"])).is_err());
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
                ignored_global_flags: vec![],
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
        assert_eq!(
            parsed,
            LocalCommand::DoctorFix {
                json: true,
                firefox_path: None,
                with_deps: false,
            }
        );
        let parsed = parse_cli_args(&s(&[
            "doctor",
            "--fix",
            "--with-deps",
            "--firefox-path",
            "/Applications/Firefox.app/Contents/MacOS/firefox",
            "--json",
        ]))
        .unwrap();
        assert_eq!(
            parsed,
            LocalCommand::DoctorFix {
                json: true,
                firefox_path: Some("/Applications/Firefox.app/Contents/MacOS/firefox".to_string()),
                with_deps: true,
            }
        );
    }

    #[test]
    fn help_text_includes_ref_quoting_guidance() {
        let text = help_text(None).unwrap();
        assert!(text
            .contains("open                            Launch/reuse Firefox without navigating"));
        assert!(text.contains("snapshot                        Inspect the active page and print refs"));
        assert!(text.contains("click '@e4'"));
        assert!(text.contains("tap '@e4'"));
        assert!(text.contains("dblclick '@e4'"));
        assert!(text.contains("keyboard type \"hello\""));
        assert!(text.contains("keyboard inserttext \"hello\""));
        assert!(text.contains("keydown Shift"));
        assert!(text.contains("keyup Shift"));
        assert!(text.contains("hover '@e4'"));
        assert!(text.contains("focus '@e2'"));
        assert!(text.contains("select '#country' US"));
        assert!(text.contains("check '#terms'"));
        assert!(text.contains("uncheck '#terms'"));
        assert!(text.contains("scroll down 500"));
        assert!(text.contains("scrollintoview '@e4'"));
        assert!(text.contains("skills cat core"));
        assert!(text.contains("pushstate /dashboard"));
        assert!(text.contains("--session work --restore open <url>"));
        assert!(help_text(Some("session"))
            .unwrap()
            .contains("session info [--json]"));
        assert!(text.contains("get text '@e1'"));
        assert!(text.contains("is visible '@e1'"));
        assert!(text.contains("console"));
        assert!(text.contains("errors"));
        assert!(text.contains("dialog status"));
        assert!(text.contains("dialog accept [text]"));
        assert!(text.contains("dialog dismiss"));
        assert!(text.contains("cookies"));
        assert!(text.contains("storage local [key]"));
        assert!(text.contains("network requests"));
        assert!(text.contains("network wait-for-response"));
        assert!(text.contains("network route"));
        assert!(text.contains("network har"));
        assert!(text.contains("stream enable [--port 4848]"));
        assert!(text.contains("stream status|disable"));
        assert!(text.contains("diff snapshot"));
        assert!(text.contains("highlight '#submit'"));
        assert!(text.contains("record restart recording-dir"));
        assert!(text.contains("device \"iPhone 14\""));
        assert!(text.contains("open <url> --device \"iPhone 14\""));
        assert!(text.contains("install [--with-deps] [--firefox-path <path>]"));
        assert!(text.contains("upgrade"));
        assert!(text.contains("--config ./ci-config.json open <url>"));
        assert!(text.contains("open <url> --headers"));
        assert!(text.contains("back"));
        assert!(text.contains("forward"));
        assert!(text.contains("reload"));
        assert!(text.contains("--proxy http://proxy.example:8080 open <url>"));
        assert!(text.contains("tab new <url>"));
        assert!(text.contains("frame '@e3'"));
        assert!(text.contains("window new"));
        assert!(text.contains("close"));
        assert!(text.contains("close --all"));
        assert!(text.contains("--profile Work open <url>"));
        assert!(text.contains("profiles [--json]"));
        assert!(text.contains("profiles import <dir> --name Work"));
        assert!(text.contains("set viewport"));
        assert!(text.contains("mouse move"));
        assert!(text.contains("mouse down [left]"));
        assert!(text.contains("mouse up [left]"));
        assert!(text.contains("mouse wheel 400"));
        assert!(text.contains("swipe up 500"));
        assert!(text.contains("drag '@e1' '@e2'"));
        assert!(text.contains("batch \"open <url>\""));
        assert!(text.contains("addinitscript <js>"));
        assert!(text.contains("setcontent '<h1>Hello</h1>'"));
        assert!(text.contains("--allow-file-access open file:///path/to/page.html"));
        assert!(text.contains("auth login"));
        assert!(text.contains("auth login app --credential-provider vault"));
        assert!(text.contains("plugin add agent-browser-plugin-captcha"));
        assert!(text.contains("plugin list"));
        assert!(text.contains("plugin show vault"));
        assert!(text.contains("plugin run captcha captcha.solve"));
        assert!(text.contains("skills [list]"));
        assert_eq!(help_text(Some("commands")), Some(text));
        assert!(help_text(Some("status")).unwrap().contains("status"));
        assert!(help_text(Some("install"))
            .unwrap()
            .contains("First-run setup command"));
        assert!(help_text(Some("install")).unwrap().contains("Firefox.app"));
        assert!(help_text(Some("install")).unwrap().contains("--with-deps"));
        assert!(help_text(Some("install"))
            .unwrap()
            .contains("pire-browser open https://example.com"));
        assert!(help_text(Some("install"))
            .unwrap()
            .contains("pire-browser snapshot"));
        assert!(help_text(Some("tap"))
            .unwrap()
            .contains("pire-browser tap '@e4'"));
        assert!(help_text(Some("setup"))
            .unwrap()
            .contains("directory containing the"));
        assert!(help_text(Some("upgrade"))
            .unwrap()
            .contains("agent-browser-style"));
        assert!(help_text(Some("update")).unwrap().contains("update check"));
        assert!(help_text(Some("screenshot"))
            .unwrap()
            .contains("--hide-scrollbars false"));
        assert!(help_text(Some("config"))
            .unwrap()
            .contains("PIRE_BROWSER_CONFIG"));
        assert!(help_text(Some("config"))
            .unwrap()
            .contains("hideScrollbars"));
        assert!(help_text(Some("config"))
            .unwrap()
            .contains("AGENT_BROWSER_CONFIG"));
        assert!(help_text(Some("config"))
            .unwrap()
            .contains("agent-browser.json"));
        assert!(help_text(Some("config")).unwrap().contains("state"));
        assert!(help_text(Some("config")).unwrap().contains("restoreSave"));
        assert!(help_text(Some("config")).unwrap().contains("plugins"));
        assert!(help_text(Some("auth"))
            .unwrap()
            .contains("credential-provider"));
        assert!(help_text(Some("plugin"))
            .unwrap()
            .contains("plugin add <package-or-repo>"));
        assert!(help_text(Some("plugin")).unwrap().contains("--no-manifest"));
        assert!(help_text(Some("plugin"))
            .unwrap()
            .contains("plugin show <name>"));
        assert!(help_text(Some("plugin"))
            .unwrap()
            .contains("plugin run <name> <capability>"));
        assert!(help_text(Some("plugins")).unwrap().contains("command.run"));
        assert!(help_text(Some("plugin"))
            .unwrap()
            .contains("launch.initScripts"));
        assert!(help_text(Some("config")).unwrap().contains("autoConnect"));
        assert!(help_text(Some("config")).unwrap().contains("proxyBypass"));
        assert!(help_text(Some("back"))
            .unwrap()
            .contains("pire-browser back"));
        assert!(help_text(Some("forward"))
            .unwrap()
            .contains("pire-browser forward"));
        assert!(help_text(Some("reload")).unwrap().contains("fresh"));
        assert!(help_text(Some("state"))
            .unwrap()
            .contains("--auto-connect state save"));
        assert!(help_text(Some("state"))
            .unwrap()
            .contains("--state ./.pire-state"));
        assert!(help_text(Some("open"))
            .unwrap()
            .contains("pire-browser open"));
        assert!(help_text(Some("open"))
            .unwrap()
            .contains("launches Firefox without navigating"));
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
        assert!(help_text(Some("open")).unwrap().contains("--proxy <url>"));
        let launch_help = help_text(Some("launch")).unwrap();
        assert!(launch_help.contains("Lower-level launcher diagnostic"));
        assert!(launch_help.contains("Prefer `pire-browser open`"));
        assert!(launch_help.contains("normal launch/navigation workflows"));
        assert!(help_text(Some("read")).unwrap().contains("active tab URL"));
        let snapshot_help = help_text(Some("snapshot")).unwrap();
        assert!(snapshot_help.contains("pire-browser snapshot"));
        assert!(snapshot_help.contains("snapshot -i"));
        assert!(snapshot_help.contains("agent-browser-compatible default"));
        assert!(snapshot_help.contains("legacy ref-list format"));
        assert!(snapshot_help.contains("snapshot -i -c"));
        assert!(snapshot_help.contains("snapshot -i -C"));
        assert!(snapshot_help.contains("snapshot -d 3"));
        assert!(snapshot_help.contains("snapshot --depth 5"));
        assert!(snapshot_help.contains("snapshot -i -c -C -d 5"));
        assert!(snapshot_help.contains("--cursor-interactive"));
        assert!(snapshot_help.contains("-s"));
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
        assert!(help_text(Some("wait")).unwrap().contains("wait --fn"));
        assert!(help_text(Some("wait"))
            .unwrap()
            .contains("page-world JavaScript expression"));
        assert!(help_text(Some("pushstate"))
            .unwrap()
            .contains("history.pushState"));
        assert!(help_text(Some("console"))
            .unwrap()
            .contains("console --clear"));
        assert!(help_text(Some("errors"))
            .unwrap()
            .contains("unhandled promise"));
        assert!(help_text(Some("dialog"))
            .unwrap()
            .contains("dialog accept [text]"));
        assert!(help_text(Some("dialog")).unwrap().contains("PAGE_DIALOG"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network request <requestId>"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network wait-for-request <pattern>"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network wait-for-response <pattern>"));
        assert!(help_text(Some("network")).unwrap().contains("network har"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network har stop [output.har]"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("bounded text-like response previews"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network route <pattern> --body"));
        assert!(help_text(Some("network"))
            .unwrap()
            .contains("network unroute [pattern-or-route-id]"));
        assert!(help_text(Some("stream"))
            .unwrap()
            .contains("ws://127.0.0.1:<port>/api/stream"));
        assert!(help_text(Some("stream"))
            .unwrap()
            .contains("screenshot-frame WebSocket streaming"));
        assert!(help_text(Some("trace"))
            .unwrap()
            .contains("pire-browser trace stop [output.json]"));
        assert!(help_text(Some("trace"))
            .unwrap()
            .contains("not a Chrome DevTools performance trace"));
        assert!(help_text(None).unwrap().contains("trace start"));
        assert!(help_text(Some("profiler"))
            .unwrap()
            .contains("pire-browser profiler stop [output.json]"));
        assert!(help_text(Some("profiler"))
            .unwrap()
            .contains("not a Chrome DevTools CPU profile"));
        assert!(help_text(None).unwrap().contains("profiler start"));
        assert!(help_text(Some("record"))
            .unwrap()
            .contains("pire-browser record stop [output-dir]"));
        assert!(help_text(Some("record"))
            .unwrap()
            .contains("pire-browser record restart [output-dir] [url]"));
        assert!(help_text(Some("record"))
            .unwrap()
            .contains("not native WebM video"));
        assert!(help_text(None).unwrap().contains("record start"));
        assert!(help_text(Some("vitals"))
            .unwrap()
            .contains("pire-browser vitals https://example.com"));
        assert!(help_text(None).unwrap().contains("vitals [url]"));
        assert!(help_text(Some("react"))
            .unwrap()
            .contains("pire-browser react tree"));
        assert!(help_text(Some("react"))
            .unwrap()
            .contains("pire-browser react inspect r1"));
        assert!(help_text(Some("react"))
            .unwrap()
            .contains("pire-browser react renders start"));
        assert!(help_text(Some("react"))
            .unwrap()
            .contains("pire-browser react renders stop [--json]"));
        assert!(help_text(Some("react"))
            .unwrap()
            .contains("pire-browser react suspense --only-dynamic"));
        assert!(help_text(Some("react")).unwrap().contains("best-effort"));
        assert!(help_text(None).unwrap().contains("react tree"));
        assert!(help_text(None).unwrap().contains("react renders start"));
        assert!(help_text(None).unwrap().contains("react suspense"));
        assert!(help_text(Some("highlight"))
            .unwrap()
            .contains("Draws a visible overlay"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set viewport <w> <h> [scale]"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("device \"iPhone 14\""));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set device \"iPhone 14\""));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("User-Agent override for future requests"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("open <url> --device <name>"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set geo <lat> <lng>"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set headers <json>"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set credentials <username> <password>"));
        assert!(help_text(Some("set"))
            .unwrap()
            .contains("set offline on|off"));
        assert!(help_text(Some("device"))
            .unwrap()
            .contains("agent-browser-style"));
        assert!(help_text(Some("device"))
            .unwrap()
            .contains("page-visible navigator values"));
        assert!(help_text(Some("find"))
            .unwrap()
            .contains("find text \"Save\" --exact"));
        assert!(help_text(Some("click"))
            .unwrap()
            .contains("click '@link-ref' --new-tab"));
        assert!(help_text(Some("click"))
            .unwrap()
            .contains("Use `--new-tab` or `--new`"));
        assert!(help_text(Some("dblclick"))
            .unwrap()
            .contains("pire-browser dblclick '@e4'"));
        assert!(help_text(Some("type"))
            .unwrap()
            .contains("keyboard type <text>"));
        assert!(help_text(Some("press")).unwrap().contains("keydown <key>"));
        assert!(help_text(Some("key"))
            .unwrap()
            .contains("pire-browser key Enter"));
        assert!(help_text(Some("keyboard"))
            .unwrap()
            .contains("keyboard inserttext"));
        assert!(help_text(Some("keydown"))
            .unwrap()
            .contains("pire-browser keydown Shift"));
        assert!(help_text(Some("keyup"))
            .unwrap()
            .contains("pire-browser keyup Shift"));
        assert!(help_text(Some("hover"))
            .unwrap()
            .contains("cannot force native browser `:hover`"));
        assert!(help_text(Some("focus"))
            .unwrap()
            .contains("preferred setup step before `keyboard type`"));
        assert!(help_text(Some("select"))
            .unwrap()
            .contains("pire-browser select <sel> <value>"));
        assert!(help_text(Some("check"))
            .unwrap()
            .contains("pire-browser check <sel>"));
        assert!(help_text(Some("uncheck"))
            .unwrap()
            .contains("radio buttons usually remain selected"));
        assert!(help_text(Some("scroll"))
            .unwrap()
            .contains("scroll down 500 --selector"));
        assert!(help_text(Some("scrollintoview"))
            .unwrap()
            .contains("pire-browser scrollintoview <sel>"));
        assert!(help_text(Some("scrollinto"))
            .unwrap()
            .contains("pire-browser scrollinto <sel>"));
        assert!(help_text(Some("find"))
            .unwrap()
            .contains("find role combobox"));
        assert!(help_text(Some("get"))
            .unwrap()
            .contains("get attr <sel> <attr>"));
        assert!(help_text(Some("get")).unwrap().contains("get title"));
        assert!(help_text(Some("is")).unwrap().contains("is visible <sel>"));
        assert!(help_text(Some("eval")).unwrap().contains("eval -b"));
        assert!(help_text(Some("evaluate"))
            .unwrap()
            .contains("eval --base64"));
        assert!(help_text(Some("mouse")).unwrap().contains("mouse wheel"));
        assert!(help_text(Some("swipe")).unwrap().contains("swipe down 500"));
        assert!(help_text(Some("swipe"))
            .unwrap()
            .contains("swipe up scrolls down"));
        assert!(help_text(Some("drag"))
            .unwrap()
            .contains("drag <src> <dst>"));
        assert!(help_text(Some("batch"))
            .unwrap()
            .contains("JSON array from"));
        assert!(help_text(Some("addinitscript"))
            .unwrap()
            .contains("removeinitscript <identifier>"));
        assert!(help_text(Some("setcontent"))
            .unwrap()
            .contains("setcontent <html>"));
        assert!(help_text(Some("auth"))
            .unwrap()
            .contains("--username-selector"));
        assert!(help_text(Some("auth")).unwrap().contains("auth login"));
        assert!(help_text(Some("auth"))
            .unwrap()
            .contains("--password-stdin"));
        assert!(help_text(Some("tabs")).unwrap().contains("pire-browser tab"));
        assert!(help_text(Some("tabs"))
            .unwrap()
            .contains("tab <tN-or-label>"));
        assert!(help_text(Some("tabs"))
            .unwrap()
            .contains("tab close [tN-or-label]"));
        assert!(help_text(Some("tabs"))
            .unwrap()
            .contains("Bare `tab` lists tracked tabs"));
        assert!(help_text(Some("window")).unwrap().contains("window new"));
        assert!(help_text(Some("window"))
            .unwrap()
            .contains("window switch <wN>"));
        assert!(help_text(Some("window"))
            .unwrap()
            .contains("window close [wN]"));
        assert!(help_text(Some("window"))
            .unwrap()
            .contains("popup-style OAuth"));
        assert!(help_text(Some("close")).unwrap().contains("quit"));
        assert!(help_text(Some("quit")).unwrap().contains("close --all"));
        assert!(help_text(Some("clipboard"))
            .unwrap()
            .contains("clipboard read"));
        assert!(help_text(Some("state")).unwrap().contains("state save"));
        assert!(help_text(Some("state")).unwrap().contains("state list"));
        assert!(help_text(Some("state")).unwrap().contains("state show"));
        assert!(help_text(Some("state"))
            .unwrap()
            .contains("PIRE_BROWSER_ENCRYPTION_KEY"));
        assert!(help_text(Some("state"))
            .unwrap()
            .contains("AGENT_BROWSER_ENCRYPTION_KEY"));
        assert!(help_text(Some("mcp"))
            .unwrap()
            .contains("Model Context Protocol server"));
        assert!(help_text(None).unwrap().contains("dashboard start"));
        assert!(help_text(None).unwrap().contains("activity list"));
        assert!(help_text(Some("activity"))
            .unwrap()
            .contains("redacted pire-browser command activity"));
        assert!(help_text(Some("dashboard"))
            .unwrap()
            .contains("local dashboard server"));
        assert!(help_text(Some("dashboard"))
            .unwrap()
            .contains("optional AI Gateway chat"));
        assert!(help_text(Some("dashboard"))
            .unwrap()
            .contains("non-streaming"));
        assert!(help_text(Some("streaming"))
            .unwrap()
            .contains("screenshot-frame WebSocket streaming"));
        assert!(help_text(Some("mcp")).unwrap().contains("smallest tools"));
        assert!(help_text(Some("mcp")).unwrap().contains("core,network"));
        assert!(help_text(Some("mcp")).unwrap().contains("network"));
        assert!(help_text(Some("mcp")).unwrap().contains("state"));
        assert!(help_text(Some("mcp")).unwrap().contains("debug"));
        assert!(help_text(Some("mcp")).unwrap().contains("tabs"));
        assert!(help_text(Some("mcp")).unwrap().contains("mobile"));
        assert!(help_text(Some("mcp")).unwrap().contains("react"));
        assert!(help_text(Some("mcp")).unwrap().contains("semantic find"));
        assert!(help_text(Some("mcp")).unwrap().contains("2025-11-25"));
        assert!(help_text(Some("mcp")).unwrap().contains("paginated"));
        assert!(help_text(Some("mcp")).unwrap().contains("\"mcpServers\""));
        assert!(help_text(Some("mcp"))
            .unwrap()
            .contains("\"args\": [\"mcp\", \"--tools\", \"core\"]"));
        assert!(help_text(Some("mcp"))
            .unwrap()
            .contains("--tools core,debug"));
        assert!(help_text(Some("mcp"))
            .unwrap()
            .contains("trace/profiler/record evidence"));
        assert!(help_text(Some("mcp")).unwrap().contains("Fiber tree"));
        assert!(help_text(Some("cookies"))
            .unwrap()
            .contains("cookies set <name> <value>"));
        assert!(help_text(Some("cookies"))
            .unwrap()
            .contains("cookies set --curl <file-or-cookie-data>"));
        assert!(help_text(Some("storage"))
            .unwrap()
            .contains("storage session set <key> <value>"));
        assert!(help_text(Some("frame")).unwrap().contains("frame main"));
        assert!(help_text(Some("frame"))
            .unwrap()
            .contains("frame payment-frame"));
        assert!(help_text(Some("frame"))
            .unwrap()
            .contains("name/id/title/label/URL"));
        assert!(help_text(Some("skills"))
            .unwrap()
            .contains("skills get core"));
        assert!(help_text(Some("skills"))
            .unwrap()
            .contains("skills get dogfood"));
        assert!(help_text(Some("skills"))
            .unwrap()
            .contains("skills path [core]"));
        assert!(help_text(Some("session"))
            .unwrap()
            .contains("session attach"));
        assert!(help_text(Some("session")).unwrap().contains("session id"));
        assert!(help_text(Some("session"))
            .unwrap()
            .contains("--restore <name>"));
        assert!(help_text(None)
            .unwrap()
            .contains("session id --scope worktree"));
        assert!(help_text(Some("profiles"))
            .unwrap()
            .contains("managed Firefox profiles"));
        assert!(help_text(Some("profiles"))
            .unwrap()
            .contains("profiles import <firefox-profile-dir>"));
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

        let parsed = parse_cli_args(&s(&["launch", "--headless", "--headed", "false"])).unwrap();
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
