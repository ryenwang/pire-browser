use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::redaction::redact_text;

pub const ACTION_POLICY_ENV_VAR: &str = "PIRE_BROWSER_ACTION_POLICY";
pub const LEGACY_ACTION_POLICY_ENV_VAR: &str = "AGENT_BROWSER_ACTION_POLICY";
pub const ACTION_POLICY_MAX_BYTES: u64 = 1024 * 1024;

const ACTION_CATEGORIES: &[&str] = &[
    "navigate", "click", "fill", "eval", "snapshot", "scroll", "wait", "get", "interact", "state",
    "network", "download", "upload",
];

const RESERVED_NOT_AVAILABLE_ROOTS: &[&str] = &[
    "connect",
    "dashboard",
    "install",
    "profiles",
    "skill",
    "skills",
    "stream",
    "upgrade",
];

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ActionPolicyArgs {
    pub action_policy_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionPolicyDiagnostic {
    pub enabled: bool,
    pub source: String,
    pub env_var: String,
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub default: String,
    pub allow: Vec<String>,
    pub deny: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionPolicyRequestContext {
    pub enabled: bool,
    pub default: String,
    pub allow: Vec<String>,
    pub deny: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionPolicyDecision {
    pub diagnostic: ActionPolicyDiagnostic,
    pub policy: Option<ActionPolicy>,
}

impl ActionPolicyDecision {
    pub fn enabled(&self) -> bool {
        self.policy.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionPolicy {
    pub default: PolicyDefault,
    pub allow: BTreeSet<String>,
    pub deny: BTreeSet<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyDefault {
    Allow,
    Deny,
}

impl PolicyDefault {
    fn as_str(self) -> &'static str {
        match self {
            PolicyDefault::Allow => "allow",
            PolicyDefault::Deny => "deny",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommandPolicyResolution {
    Category(String),
    Compound,
    Meta,
    NotAvailable,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionPolicyEvaluation {
    pub category: Option<String>,
    pub decision: String,
}

#[derive(Debug, Deserialize)]
struct RawPolicy {
    #[serde(default)]
    default: Option<String>,
    #[serde(default)]
    allow: Option<Vec<String>>,
    #[serde(default)]
    deny: Option<Vec<String>>,
}

pub fn action_categories() -> &'static [&'static str] {
    ACTION_CATEGORIES
}

pub fn collect_action_policy() -> ActionPolicyDiagnostic {
    let env_value = action_policy_env_value();
    action_policy_from_env_value(env_value.as_deref())
}

pub fn action_policy_text(policy: &ActionPolicyDiagnostic) -> String {
    format!("Action policy: {}", policy.message)
}

pub fn action_policy_from_env_value(value: Option<&str>) -> ActionPolicyDiagnostic {
    match value {
        None => disabled_diagnostic(
            "default",
            None,
            format!(
                "action policy is disabled by default; set {ACTION_POLICY_ENV_VAR}=policy.json to enable it"
            ),
        ),
        Some(raw) => diagnostic_from_source("env", raw),
    }
}

pub fn action_policy_diagnostic_from_args(args: &ActionPolicyArgs) -> ActionPolicyDiagnostic {
    if let Some(raw) = &args.action_policy_path {
        return diagnostic_from_source("flag", raw);
    }
    collect_action_policy()
}

pub fn resolve_action_policy(args: &ActionPolicyArgs) -> Result<ActionPolicyDecision> {
    let env_value = action_policy_env_value();
    resolve_action_policy_from_env_value(env_value.as_deref(), args)
}

fn action_policy_env_value() -> Option<String> {
    env_var_nonempty(ACTION_POLICY_ENV_VAR)
        .or_else(|| env_var_nonempty(LEGACY_ACTION_POLICY_ENV_VAR))
}

fn env_var_nonempty(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn resolve_action_policy_from_env_value(
    env_value: Option<&str>,
    args: &ActionPolicyArgs,
) -> Result<ActionPolicyDecision> {
    if let Some(raw) = &args.action_policy_path {
        return resolve_from_source("flag", raw);
    }
    let Some(raw) = env_value else {
        return Ok(ActionPolicyDecision {
            diagnostic: action_policy_from_env_value(None),
            policy: None,
        });
    };
    resolve_from_source("env", raw)
}

pub fn request_context(decision: &ActionPolicyDecision) -> Option<ActionPolicyRequestContext> {
    let policy = decision.policy.as_ref()?;
    Some(ActionPolicyRequestContext {
        enabled: true,
        default: policy.default.as_str().to_string(),
        allow: policy.allow.iter().cloned().collect(),
        deny: policy.deny.iter().cloned().collect(),
    })
}

pub fn decision_from_request_context(
    context: Option<&ActionPolicyRequestContext>,
) -> Result<ActionPolicyDecision> {
    let Some(context) = context.filter(|context| context.enabled) else {
        return Ok(ActionPolicyDecision {
            diagnostic: disabled_diagnostic(
                "record",
                None,
                "action policy was disabled when this confirmation was recorded",
            ),
            policy: None,
        });
    };
    let default = match context.default.as_str() {
        "allow" => PolicyDefault::Allow,
        "deny" => PolicyDefault::Deny,
        other => bail!("invalid_args: stored action policy default is invalid: `{other}`"),
    };
    let policy = ActionPolicy {
        default,
        allow: parse_category_list(context.allow.clone(), "allow")?,
        deny: parse_category_list(context.deny.clone(), "deny")?,
    };
    Ok(ActionPolicyDecision {
        diagnostic: enabled_diagnostic("record", "<confirmation-record>", &policy),
        policy: Some(policy),
    })
}

pub fn ensure_action_allowed(decision: &ActionPolicyDecision, args: &[String]) -> Result<()> {
    let evaluation = evaluate_action(decision, args);
    if evaluation.decision == "deny" {
        let category = evaluation.category.unwrap_or_else(|| "unknown".to_string());
        bail!(
            "ActionPolicyError: action category `{category}` is denied by the active action policy"
        );
    }
    Ok(())
}

pub fn evaluate_action(decision: &ActionPolicyDecision, args: &[String]) -> ActionPolicyEvaluation {
    let resolution = resolve_command_policy(args);
    let category = match &resolution {
        CommandPolicyResolution::Category(category) => Some(category.clone()),
        _ => None,
    };
    let decision_text = match resolution {
        CommandPolicyResolution::Category(category) => match &decision.policy {
            None => "allow",
            Some(policy) if policy.deny.contains(&category) => "deny",
            Some(policy) if policy.allow.contains(&category) => "allow",
            Some(policy) if policy.default == PolicyDefault::Allow => "allow",
            Some(_) => "deny",
        },
        CommandPolicyResolution::Meta => "meta",
        CommandPolicyResolution::NotAvailable => "not_available",
        CommandPolicyResolution::Unsupported => "unsupported",
        CommandPolicyResolution::Compound => "allow",
    };
    ActionPolicyEvaluation {
        category,
        decision: decision_text.to_string(),
    }
}

pub fn resolve_command_policy(args: &[String]) -> CommandPolicyResolution {
    let Some(root) = args.first().map(String::as_str) else {
        return CommandPolicyResolution::Unsupported;
    };
    let subcommand = args.get(1).map(String::as_str);

    match root {
        "status" | "doctor" | "install-status" | "help" | "setup" | "session" | "sessions"
        | "confirm" | "deny" | "close" | "quit" | "exit" => return CommandPolicyResolution::Meta,
        "launch" if !args.iter().any(|arg| arg == "--url") => return CommandPolicyResolution::Meta,
        "state" if subcommand == Some("inspect") => return CommandPolicyResolution::Meta,
        "tab" | "tabs" if subcommand == Some("label") => return CommandPolicyResolution::Meta,
        _ => {}
    }

    if RESERVED_NOT_AVAILABLE_ROOTS.contains(&root) {
        return CommandPolicyResolution::NotAvailable;
    }

    let category = match root {
        "open" | "goto" | "navigate" if args.iter().any(|arg| arg == "--headers") => "network",
        "open" | "goto" | "navigate" => "navigate",
        "launch" => "navigate",
        "tab" | "tabs" => match subcommand {
            None | Some("list") => "get",
            Some("new") | Some("select") | Some("close") => "navigate",
            _ => return CommandPolicyResolution::Unsupported,
        },
        "back" | "forward" | "reload" => "navigate",
        "pushstate" => "navigate",
        "window" if subcommand == Some("new") => "navigate",
        "click" | "dblclick" | "tap" => "click",
        "fill" | "type" | "select" | "check" | "uncheck" => "fill",
        "keyboard" if matches!(subcommand, Some("type" | "inserttext")) => "fill",
        "clipboard" if subcommand == Some("paste") => "fill",
        "eval" | "setcontent" => "eval",
        "snapshot" | "screenshot" | "pdf" => "snapshot",
        "read" => "get",
        "diff" if matches!(subcommand, Some("snapshot" | "screenshot")) => "snapshot",
        "diff" if subcommand == Some("url") => "navigate",
        "trace" => match subcommand {
            Some("start") => "state",
            Some("status") => "get",
            Some("stop") => "snapshot",
            _ => return CommandPolicyResolution::NotAvailable,
        },
        "profiler" => match subcommand {
            Some("start") => "state",
            Some("status") => "get",
            Some("stop") => "snapshot",
            _ => return CommandPolicyResolution::NotAvailable,
        },
        "record" => match subcommand {
            Some("start") => "state",
            Some("status") | None => "get",
            Some("stop" | "restart") => "snapshot",
            _ => return CommandPolicyResolution::NotAvailable,
        },
        "highlight" => "snapshot",
        "vitals" if has_vitals_url_arg(args) => "navigate",
        "vitals" => "get",
        "react" if matches!(subcommand, Some("tree" | "inspect")) => "get",
        "addinitscript" | "removeinitscript" => "eval",
        "scroll" | "scrollintoview" | "scrollinto" | "swipe" => "scroll",
        "mouse" if subcommand == Some("wheel") => "scroll",
        "mouse" => "interact",
        "drag" => "interact",
        "wait" if args.iter().any(|arg| arg == "--download") => "download",
        "wait" => "wait",
        "find" => return resolve_find_policy(args),
        "get" | "is" | "frame" => "get",
        "console" | "errors" => {
            if args.iter().any(|arg| arg == "--clear") || subcommand == Some("clear") {
                "state"
            } else {
                "get"
            }
        }
        "network" => match subcommand {
            None
            | Some("requests")
            | Some("request")
            | Some("wait-for-request")
            | Some("wait-for-response") => {
                if args.iter().any(|arg| arg == "--clear") {
                    "state"
                } else {
                    "get"
                }
            }
            Some("route" | "unroute" | "har") => "network",
            _ => return CommandPolicyResolution::Unsupported,
        },
        "cookies" => match subcommand {
            Some("set" | "clear") => "state",
            _ => "get",
        },
        "storage" => match (subcommand, args.get(2).map(String::as_str)) {
            (Some("local" | "session"), Some("set" | "clear")) => "state",
            _ => "get",
        },
        "dialog" => match subcommand {
            Some("accept" | "dismiss") => "interact",
            _ => "get",
        },
        "hover" | "focus" | "press" | "key" | "keydown" | "keyup" => "interact",
        "state" => match subcommand {
            Some("save" | "load") => "state",
            _ => return CommandPolicyResolution::NotAvailable,
        },
        "set" => match subcommand {
            Some("headers" | "offline" | "credentials") => "network",
            Some("viewport" | "device" | "media" | "geo") => "state",
            _ => return CommandPolicyResolution::NotAvailable,
        },
        "device" => "state",
        "clipboard" => match subcommand {
            Some("read") => "get",
            Some("write" | "copy") => "state",
            _ => return CommandPolicyResolution::Unsupported,
        },
        "auth" => match subcommand {
            Some("save" | "delete") => "state",
            Some("list" | "show") => "get",
            Some("login") => "fill",
            _ => return CommandPolicyResolution::Unsupported,
        },
        "download" => "download",
        "upload" => "upload",
        "batch" => return CommandPolicyResolution::Compound,
        _ => return CommandPolicyResolution::Unsupported,
    };
    CommandPolicyResolution::Category(category.to_string())
}

pub fn is_cli_action_precheckable(args: &[String]) -> bool {
    !matches!(args.first().map(String::as_str), Some("find" | "batch"))
}

pub fn policy_command_sequences(args: &[String]) -> Result<Vec<Vec<String>>> {
    if args.first().map(String::as_str) == Some("diff") {
        return diff_policy_command_sequences(args);
    }
    if args.first().map(String::as_str) == Some("vitals") {
        return vitals_policy_command_sequences(args);
    }
    if args.first().map(String::as_str) != Some("batch") {
        return Ok(vec![args.to_vec()]);
    }
    let mut sequences = Vec::new();
    for item in &args[1..] {
        if item == "--bail" {
            continue;
        }
        sequences.push(split_command_text(item)?);
    }
    Ok(sequences)
}

fn diff_policy_command_sequences(args: &[String]) -> Result<Vec<Vec<String>>> {
    match args.get(1).map(String::as_str) {
        Some("snapshot") => Ok(vec![args.to_vec()]),
        Some("screenshot") => Ok(vec![vec!["screenshot".to_string()]]),
        Some("url") => {
            let Some(first_url) = args.get(2) else {
                return Ok(vec![args.to_vec()]);
            };
            let Some(second_url) = args.get(3) else {
                return Ok(vec![args.to_vec()]);
            };
            let mut sequences = vec![
                vec!["open".to_string(), first_url.clone()],
                vec!["snapshot".to_string()],
                vec!["open".to_string(), second_url.clone()],
                vec!["snapshot".to_string()],
            ];
            if args.iter().any(|arg| arg == "--screenshot") {
                sequences.push(vec!["screenshot".to_string()]);
            }
            Ok(sequences)
        }
        _ => Ok(vec![args.to_vec()]),
    }
}

fn vitals_policy_command_sequences(args: &[String]) -> Result<Vec<Vec<String>>> {
    let Some(url) = first_vitals_url_arg(args) else {
        return Ok(vec![args.to_vec()]);
    };
    Ok(vec![
        vec!["open".to_string(), url],
        vec!["vitals".to_string()],
    ])
}

pub fn split_command_text(command: &str) -> Result<Vec<String>> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for ch in command.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if let Some(active_quote) = quote {
            if ch == active_quote {
                quote = None;
            } else {
                current.push(ch);
            }
            continue;
        }
        if ch == '"' || ch == '\'' {
            quote = Some(ch);
            continue;
        }
        if ch.is_whitespace() {
            if !current.is_empty() {
                args.push(std::mem::take(&mut current));
            }
            continue;
        }
        current.push(ch);
    }
    if escaped {
        current.push('\\');
    }
    if let Some(active_quote) = quote {
        bail!("invalid_args: unterminated {active_quote} quote in batch subcommand");
    }
    if !current.is_empty() {
        args.push(current);
    }
    if args.is_empty() {
        bail!("invalid_args: batch subcommand cannot be empty");
    }
    Ok(args)
}

fn resolve_find_policy(args: &[String]) -> CommandPolicyResolution {
    // Runtime enforcement for `find` happens in the extension because chained
    // find actions are parsed there; this mirror keeps the shared verdict
    // fixture checking Rust and extension category resolution together.
    let action = find_action(args);
    let Some(action) = action.as_deref() else {
        return CommandPolicyResolution::Category("get".to_string());
    };
    let category = match action {
        "click" | "dblclick" => "click",
        "fill" | "type" | "select" | "check" | "uncheck" => "fill",
        "text" | "html" | "value" | "attr" | "box" | "styles" => "get",
        "scroll" | "scrollintoview" | "scrollinto" | "swipe" => "scroll",
        "press" | "key" | "hover" | "focus" => "interact",
        "eval" => "eval",
        _ => "interact",
    };
    CommandPolicyResolution::Category(category.to_string())
}

fn find_action(args: &[String]) -> Option<String> {
    let kind = args.get(1)?.as_str();
    let rest = &args[2..];
    match kind {
        "role" => action_tail(
            rest.get(1..).unwrap_or(&[]),
            &["--name", "--index"],
            &["--exact"],
        ),
        "label" | "text" | "placeholder" | "alt" | "title" | "testid" => {
            action_tail(rest.get(1..).unwrap_or(&[]), &["--index"], &["--exact"])
        }
        "first" | "last" => action_tail(rest.get(1..).unwrap_or(&[]), &[], &["--exact"]),
        "nth" => action_tail(rest.get(2..).unwrap_or(&[]), &[], &["--exact"]),
        _ => None,
    }
}

fn action_tail(args: &[String], value_flags: &[&str], bool_flags: &[&str]) -> Option<String> {
    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        if value_flags.contains(&arg) {
            i += 2;
            continue;
        }
        if bool_flags.contains(&arg) {
            i += 1;
            continue;
        }
        if arg.starts_with("--") {
            i += 1;
            continue;
        }
        return Some(args[i].clone());
    }
    None
}

fn has_vitals_url_arg(args: &[String]) -> bool {
    first_vitals_url_arg(args).is_some()
}

fn first_vitals_url_arg(args: &[String]) -> Option<String> {
    let mut index = 1;
    while index < args.len() {
        let arg = &args[index];
        if arg == "--json" {
            index += 1;
            continue;
        }
        if arg.starts_with('-') {
            index += 1;
            continue;
        }
        return Some(arg.clone());
    }
    None
}

fn diagnostic_from_source(source: &str, raw: &str) -> ActionPolicyDiagnostic {
    match read_action_policy(raw) {
        Ok(policy) => enabled_diagnostic(source, raw, &policy),
        Err(err) => invalid_diagnostic(source, raw, err.to_string()),
    }
}

fn resolve_from_source(source: &str, raw: &str) -> Result<ActionPolicyDecision> {
    let policy = read_action_policy(raw)?;
    Ok(ActionPolicyDecision {
        diagnostic: enabled_diagnostic(source, raw, &policy),
        policy: Some(policy),
    })
}

fn read_action_policy(raw_path: &str) -> Result<ActionPolicy> {
    let path = resolve_policy_path(raw_path)?;
    let metadata = fs::metadata(&path).with_context(|| {
        format!(
            "invalid_args: action policy file not found: {}",
            redact_path(&path)
        )
    })?;
    if !metadata.is_file() {
        bail!(
            "invalid_args: action policy path is not a file: {}",
            redact_path(&path)
        );
    }
    if metadata.len() > ACTION_POLICY_MAX_BYTES {
        bail!(
            "invalid_args: action policy file is too large ({} bytes; max {ACTION_POLICY_MAX_BYTES})",
            metadata.len()
        );
    }
    let text = fs::read_to_string(&path).with_context(|| {
        format!(
            "invalid_args: action policy file is not UTF-8: {}",
            redact_path(&path)
        )
    })?;
    parse_action_policy_json(&text)
}

fn resolve_policy_path(raw_path: &str) -> Result<PathBuf> {
    if raw_path.trim().is_empty() {
        bail!("invalid_args: action policy path cannot be empty");
    }
    let path = PathBuf::from(raw_path);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(std::env::current_dir()?.join(path))
    }
}

fn parse_action_policy_json(text: &str) -> Result<ActionPolicy> {
    let value: serde_json::Value =
        serde_json::from_str(text).context("invalid_args: action policy file is not valid JSON")?;
    let object = value
        .as_object()
        .context("invalid_args: action policy file must be a JSON object")?;
    for key in object.keys() {
        if key == "confirm" {
            bail!("invalid_args: policy-file `confirm` is not supported; confirmation will be implemented through `--confirm-actions`");
        }
        if !matches!(key.as_str(), "default" | "allow" | "deny") {
            bail!("invalid_args: unsupported action policy key `{key}`");
        }
    }
    let raw: RawPolicy = serde_json::from_value(value)
        .context("invalid_args: action policy file has invalid field types")?;
    let default = match raw.default.as_deref().unwrap_or("allow") {
        "allow" => PolicyDefault::Allow,
        "deny" => PolicyDefault::Deny,
        other => {
            bail!("invalid_args: action policy default must be `allow` or `deny`, got `{other}`")
        }
    };
    Ok(ActionPolicy {
        default,
        allow: parse_category_list(raw.allow.unwrap_or_default(), "allow")?,
        deny: parse_category_list(raw.deny.unwrap_or_default(), "deny")?,
    })
}

fn parse_category_list(values: Vec<String>, field: &str) -> Result<BTreeSet<String>> {
    let mut out = BTreeSet::new();
    for value in values {
        if !ACTION_CATEGORIES.contains(&value.as_str()) {
            bail!("invalid_args: action policy {field} contains unknown category `{value}`");
        }
        out.insert(value);
    }
    Ok(out)
}

fn enabled_diagnostic(
    source: &str,
    raw_path: &str,
    policy: &ActionPolicy,
) -> ActionPolicyDiagnostic {
    ActionPolicyDiagnostic {
        enabled: true,
        source: source.to_string(),
        env_var: ACTION_POLICY_ENV_VAR.to_string(),
        valid: true,
        path: Some(redact_text(raw_path)),
        default: policy.default.as_str().to_string(),
        allow: policy.allow.iter().cloned().collect(),
        deny: policy.deny.iter().cloned().collect(),
        message: format!(
            "action policy is active from {source}: default={}, allow=[{}], deny=[{}]",
            policy.default.as_str(),
            policy.allow.iter().cloned().collect::<Vec<_>>().join(", "),
            policy.deny.iter().cloned().collect::<Vec<_>>().join(", ")
        ),
    }
}

fn disabled_diagnostic(
    source: &str,
    path: Option<String>,
    message: impl Into<String>,
) -> ActionPolicyDiagnostic {
    ActionPolicyDiagnostic {
        enabled: false,
        source: source.to_string(),
        env_var: ACTION_POLICY_ENV_VAR.to_string(),
        valid: true,
        path,
        default: "allow".to_string(),
        allow: Vec::new(),
        deny: Vec::new(),
        message: message.into(),
    }
}

fn invalid_diagnostic(source: &str, raw_path: &str, message: String) -> ActionPolicyDiagnostic {
    ActionPolicyDiagnostic {
        enabled: false,
        source: source.to_string(),
        env_var: ACTION_POLICY_ENV_VAR.to_string(),
        valid: false,
        path: Some(redact_text(raw_path)),
        default: "allow".to_string(),
        allow: Vec::new(),
        deny: Vec::new(),
        message: redact_text(&message),
    }
}

fn redact_path(path: &Path) -> String {
    redact_text(&path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VerdictFixture {
        cases: Vec<VerdictCase>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct VerdictCase {
        name: String,
        args: Vec<String>,
        policy: serde_json::Value,
        expected_category: Option<String>,
        expected_decision: String,
    }

    fn args(path: Option<&str>) -> ActionPolicyArgs {
        ActionPolicyArgs {
            action_policy_path: path.map(ToString::to_string),
        }
    }

    fn write_temp_policy(text: &str) -> tempfile::NamedTempFile {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), text).unwrap();
        file
    }

    #[test]
    fn parses_valid_policy_files() {
        let file = write_temp_policy(r#"{"default":"deny","allow":["navigate"],"deny":["eval"]}"#);
        let decision =
            resolve_action_policy_from_env_value(None, &args(file.path().to_str())).unwrap();
        assert!(decision.enabled());
        assert_eq!(decision.diagnostic.default, "deny");
        assert_eq!(decision.diagnostic.allow, vec!["navigate"]);
        assert_eq!(decision.diagnostic.deny, vec!["eval"]);
    }

    #[test]
    fn env_is_used_when_flag_is_absent_and_flag_wins_when_present() {
        let env_file = write_temp_policy(r#"{"default":"deny","allow":["snapshot"]}"#);
        let flag_file = write_temp_policy(r#"{"default":"allow","deny":["eval"]}"#);
        let env_path = env_file.path().to_str().unwrap();
        let flag_path = flag_file.path().to_str().unwrap();
        let env_decision =
            resolve_action_policy_from_env_value(Some(env_path), &args(None)).unwrap();
        assert_eq!(env_decision.diagnostic.source, "env");
        assert_eq!(env_decision.diagnostic.default, "deny");
        let flag_decision =
            resolve_action_policy_from_env_value(Some(env_path), &args(Some(flag_path))).unwrap();
        assert_eq!(flag_decision.diagnostic.source, "flag");
        assert_eq!(flag_decision.diagnostic.default, "allow");
    }

    #[test]
    fn invalid_policies_fail_strict_resolution() {
        for text in [
            "not json",
            "[]",
            r#"{"default":"maybe"}"#,
            r#"{"allow":["made-up"]}"#,
            r#"{"allow":"eval"}"#,
            r#"{"confirm":["eval"]}"#,
            r#"{"denny":["eval"]}"#,
        ] {
            let file = write_temp_policy(text);
            assert!(
                resolve_action_policy_from_env_value(None, &args(file.path().to_str())).is_err(),
                "{text}"
            );
        }
    }

    #[test]
    fn confirm_key_gets_targeted_error() {
        let file = write_temp_policy(r#"{"confirm":["eval"]}"#);
        let err = resolve_action_policy_from_env_value(None, &args(file.path().to_str()))
            .unwrap_err()
            .to_string();
        assert!(err.contains("policy-file `confirm` is not supported"));
        assert!(err.contains("--confirm-actions"));
    }

    #[test]
    fn diagnostics_are_lenient_for_invalid_policy() {
        let file = write_temp_policy(r#"{"allow":["made-up"]}"#);
        let diagnostic = action_policy_diagnostic_from_args(&args(file.path().to_str()));
        assert!(!diagnostic.enabled);
        assert!(!diagnostic.valid);
        assert!(diagnostic.message.contains("unknown category"));
    }

    #[test]
    fn decisions_follow_deny_then_allow_then_default() {
        let file =
            write_temp_policy(r#"{"default":"deny","allow":["eval","snapshot"],"deny":["eval"]}"#);
        let decision =
            resolve_action_policy_from_env_value(None, &args(file.path().to_str())).unwrap();
        assert_eq!(
            evaluate_action(
                &decision,
                &["eval".to_string(), "document.title".to_string()]
            )
            .decision,
            "deny"
        );
        assert_eq!(
            evaluate_action(&decision, &["snapshot".to_string()]).decision,
            "allow"
        );
        assert_eq!(
            evaluate_action(&decision, &["click".to_string(), "@e1".to_string()]).decision,
            "deny"
        );
    }

    #[test]
    fn verdict_fixture_matches_rust_resolver() {
        let fixture: VerdictFixture = serde_json::from_str(include_str!(
            "../../../tests/fixtures/action-policy-command-verdicts.json"
        ))
        .unwrap();
        for test_case in fixture.cases {
            let policy = parse_action_policy_json(&test_case.policy.to_string()).unwrap();
            let decision = ActionPolicyDecision {
                diagnostic: enabled_diagnostic("fixture", "<fixture>", &policy),
                policy: Some(policy),
            };
            let actual = evaluate_action(&decision, &test_case.args);
            assert_eq!(
                actual.category, test_case.expected_category,
                "{}",
                test_case.name
            );
            assert_eq!(
                actual.decision, test_case.expected_decision,
                "{}",
                test_case.name
            );
        }
    }

    #[test]
    fn executable_roots_are_classified() {
        for args in [
            vec!["status"],
            vec!["open", "https://example.com"],
            vec!["goto", "https://example.com"],
            vec!["navigate", "https://example.com"],
            vec!["snapshot"],
            vec!["find", "label", "Email"],
            vec!["click", "@e1"],
            vec!["tap", "@e1"],
            vec!["dblclick", "@e1"],
            vec!["fill", "@e1", "x"],
            vec!["type", "@e1", "x"],
            vec!["press", "Enter"],
            vec!["key", "Enter"],
            vec!["keyboard", "type", "x"],
            vec!["keydown", "Enter"],
            vec!["keyup", "Enter"],
            vec!["hover", "@e1"],
            vec!["focus", "@e1"],
            vec!["mouse", "move", "80", "80"],
            vec!["mouse", "wheel", "200"],
            vec!["drag", "@e1", "@e2"],
            vec!["select", "@e1", "x"],
            vec!["check", "@e1"],
            vec!["uncheck", "@e1"],
            vec!["scroll"],
            vec!["scrollintoview", "@e1"],
            vec!["scrollinto", "@e1"],
            vec!["swipe", "up"],
            vec!["wait"],
            vec!["wait", "--download", "file.txt"],
            vec!["screenshot"],
            vec!["pdf", "page.pdf"],
            vec!["set", "viewport", "1280", "720"],
            vec!["set", "device", "iPhone 14"],
            vec!["set", "geo", "37.7749", "-122.4194"],
            vec!["set", "media", "dark"],
            vec!["set", "headers", "{\"X-Custom-Header\":\"value\"}"],
            vec!["set", "offline", "on"],
            vec!["set", "credentials", "user", "pass"],
            vec!["get", "title"],
            vec!["is", "visible", "@e1"],
            vec!["eval", "document.title"],
            vec!["addinitscript", "window.__flag=true"],
            vec!["removeinitscript", "init1"],
            vec!["console"],
            vec!["console", "--clear"],
            vec!["errors"],
            vec!["errors", "--clear"],
            vec!["highlight", "#target"],
            vec!["vitals"],
            vec!["vitals", "https://example.com"],
            vec!["trace", "start"],
            vec!["trace", "status"],
            vec!["trace", "stop"],
            vec!["profiler", "start"],
            vec!["profiler", "status"],
            vec!["profiler", "stop"],
            vec!["record", "start"],
            vec!["record", "status"],
            vec!["record", "stop"],
            vec!["record", "restart", "recording-dir"],
            vec!["react", "tree"],
            vec!["react", "inspect", "r1"],
            vec!["network"],
            vec!["network", "requests"],
            vec!["network", "requests", "--clear"],
            vec!["network", "request", "1"],
            vec!["network", "wait-for-request", "**/api/**"],
            vec!["network", "wait-for-response", "**/api/**"],
            vec!["network", "route", "*", "--abort"],
            vec!["tab"],
            vec!["tabs"],
            vec!["back"],
            vec!["forward"],
            vec!["reload"],
            vec!["pushstate", "/dashboard"],
            vec!["window", "new"],
            vec!["frame"],
            vec!["dialog"],
            vec!["batch", "get url"],
            vec!["cookies"],
            vec!["storage", "local"],
            vec!["clipboard", "read"],
            vec!["auth", "save", "fixture"],
            vec!["auth", "login", "fixture"],
            vec!["auth", "list"],
            vec!["auth", "show", "fixture"],
            vec!["auth", "delete", "fixture"],
            vec!["download", "@e1", "file.txt"],
            vec!["upload", "#file", "fixture.txt"],
            vec!["session"],
            vec!["confirm", "c_1234abcd"],
            vec!["deny", "c_1234abcd"],
            vec!["close"],
            vec!["quit"],
            vec!["exit"],
        ] {
            let command_args = args
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>();
            assert_ne!(
                resolve_command_policy(&command_args),
                CommandPolicyResolution::Unsupported,
                "{args:?}"
            );
        }
    }

    #[test]
    fn batch_policy_sequences_split_subcommands_for_preflight() {
        let sequences = policy_command_sequences(&[
            "batch".to_string(),
            "--bail".to_string(),
            "get url".to_string(),
            "eval \"document.title\"".to_string(),
        ])
        .unwrap();
        assert_eq!(
            sequences,
            vec![
                vec!["get".to_string(), "url".to_string()],
                vec!["eval".to_string(), "document.title".to_string()]
            ]
        );
        assert!(
            policy_command_sequences(&["batch".to_string(), "\"unterminated".to_string()]).is_err()
        );
    }

    #[test]
    fn diff_url_policy_sequences_expose_composite_actions() {
        let args = vec![
            "diff".to_string(),
            "url".to_string(),
            "https://before.example".to_string(),
            "https://after.example".to_string(),
            "--screenshot".to_string(),
        ];

        assert_eq!(
            resolve_command_policy(&args),
            CommandPolicyResolution::Category("navigate".to_string())
        );
        assert_eq!(
            policy_command_sequences(&args).unwrap(),
            vec![
                vec!["open".to_string(), "https://before.example".to_string()],
                vec!["snapshot".to_string()],
                vec!["open".to_string(), "https://after.example".to_string()],
                vec!["snapshot".to_string()],
                vec!["screenshot".to_string()],
            ]
        );
    }

    #[test]
    fn vitals_url_policy_sequences_expose_navigation_then_read() {
        let args = vec!["vitals".to_string(), "https://example.com".to_string()];

        assert_eq!(
            resolve_command_policy(&args),
            CommandPolicyResolution::Category("navigate".to_string())
        );
        assert_eq!(
            policy_command_sequences(&args).unwrap(),
            vec![
                vec!["open".to_string(), "https://example.com".to_string()],
                vec!["vitals".to_string()],
            ]
        );
        assert_eq!(
            resolve_command_policy(&["vitals".to_string()]),
            CommandPolicyResolution::Category("get".to_string())
        );
    }
}
