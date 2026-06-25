use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::action_policy::{action_categories, ActionPolicyRequestContext};
use crate::domain_policy::DomainPolicyRequestContext;
use crate::session::data_dir;

pub const CONFIRM_ACTIONS_ENV_VAR: &str = "PIRE_BROWSER_CONFIRM_ACTIONS";
pub const CONFIRM_INTERACTIVE_ENV_VAR: &str = "PIRE_BROWSER_CONFIRM_INTERACTIVE";
pub const LEGACY_CONFIRM_ACTIONS_ENV_VAR: &str = "AGENT_BROWSER_CONFIRM_ACTIONS";
pub const LEGACY_CONFIRM_INTERACTIVE_ENV_VAR: &str = "AGENT_BROWSER_CONFIRM_INTERACTIVE";
pub const CONFIRMATION_TTL_MS: u64 = 60_000;
pub const CONFIRMATION_REQUIRED_EXIT_CODE: i32 = 75;
pub const INTERACTIVE_CONFIRMATION_APPROVAL_ID: &str = "interactive";

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ConfirmationPolicyArgs {
    pub confirm_actions: Option<String>,
    pub confirm_interactive: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmationPolicyDiagnostic {
    pub enabled: bool,
    pub source: String,
    pub env_var: String,
    pub interactive_env_var: String,
    pub valid: bool,
    pub categories: Vec<String>,
    pub interactive: bool,
    pub ttl_ms: u64,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfirmationPolicyDecision {
    pub diagnostic: ConfirmationPolicyDiagnostic,
    pub categories: BTreeSet<String>,
    pub interactive: bool,
}

impl ConfirmationPolicyDecision {
    pub fn enabled(&self) -> bool {
        !self.categories.is_empty()
    }

    pub fn requires(&self, category: &str) -> bool {
        self.categories.contains(category)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmationPolicyRequestContext {
    pub enabled: bool,
    pub categories: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_confirmation_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingConfirmation {
    pub schema_version: u8,
    pub kind: String,
    pub id: String,
    pub created_at: u64,
    pub expires_at: u64,
    pub category: String,
    pub command_root: String,
    pub target: PendingConfirmationTarget,
    pub args: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_policy: Option<DomainPolicyRequestContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_policy: Option<ActionPolicyRequestContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmation_policy: Option<ConfirmationPolicyRequestContext>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PendingConfirmationTarget {
    Default,
    SessionId { value: String },
    SessionName { value: String },
}

pub fn collect_confirmation_policy() -> ConfirmationPolicyDiagnostic {
    let actions = env_var_nonempty_alias(CONFIRM_ACTIONS_ENV_VAR, LEGACY_CONFIRM_ACTIONS_ENV_VAR);
    let interactive = env_var_nonempty_alias(
        CONFIRM_INTERACTIVE_ENV_VAR,
        LEGACY_CONFIRM_INTERACTIVE_ENV_VAR,
    );
    confirmation_policy_from_env_values(actions.as_deref(), interactive.as_deref())
}

pub fn confirmation_policy_text(policy: &ConfirmationPolicyDiagnostic) -> String {
    format!("Confirmation policy: {}", policy.message)
}

pub fn confirmation_policy_diagnostic_from_args(
    args: &ConfirmationPolicyArgs,
) -> ConfirmationPolicyDiagnostic {
    let actions = env_var_nonempty_alias(CONFIRM_ACTIONS_ENV_VAR, LEGACY_CONFIRM_ACTIONS_ENV_VAR);
    let interactive = env_var_nonempty_alias(
        CONFIRM_INTERACTIVE_ENV_VAR,
        LEGACY_CONFIRM_INTERACTIVE_ENV_VAR,
    );
    match resolve_confirmation_policy_from_env_values(
        actions.as_deref(),
        interactive.as_deref(),
        args,
    ) {
        Ok(decision) => decision.diagnostic,
        Err(err) => invalid_diagnostic("flag/env", err.to_string()),
    }
}

pub fn confirmation_policy_from_env_values(
    actions: Option<&str>,
    interactive: Option<&str>,
) -> ConfirmationPolicyDiagnostic {
    match resolve_confirmation_policy_from_env_values(
        actions,
        interactive,
        &ConfirmationPolicyArgs::default(),
    ) {
        Ok(decision) => decision.diagnostic,
        Err(err) => invalid_diagnostic("env", err.to_string()),
    }
}

pub fn resolve_confirmation_policy(
    args: &ConfirmationPolicyArgs,
) -> Result<ConfirmationPolicyDecision> {
    let actions = env_var_nonempty_alias(CONFIRM_ACTIONS_ENV_VAR, LEGACY_CONFIRM_ACTIONS_ENV_VAR);
    let interactive = env_var_nonempty_alias(
        CONFIRM_INTERACTIVE_ENV_VAR,
        LEGACY_CONFIRM_INTERACTIVE_ENV_VAR,
    );
    resolve_confirmation_policy_from_env_values(actions.as_deref(), interactive.as_deref(), args)
}

fn env_var_nonempty_alias(primary: &str, legacy: &str) -> Option<String> {
    env_var_nonempty(primary).or_else(|| env_var_nonempty(legacy))
}

fn env_var_nonempty(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn resolve_confirmation_policy_from_env_values(
    env_actions: Option<&str>,
    env_interactive: Option<&str>,
    args: &ConfirmationPolicyArgs,
) -> Result<ConfirmationPolicyDecision> {
    let (source, raw_actions) = if let Some(raw) = args.confirm_actions.as_deref() {
        ("flag", Some(raw))
    } else {
        ("env", env_actions)
    };
    let categories = match raw_actions {
        Some(raw) => parse_confirmation_categories(raw)?,
        None => BTreeSet::new(),
    };
    let env_interactive = parse_bool_env(env_interactive, CONFIRM_INTERACTIVE_ENV_VAR)?;
    let interactive = args.confirm_interactive || env_interactive;
    let diagnostic = if categories.is_empty() {
        disabled_diagnostic(interactive)
    } else {
        enabled_diagnostic(source, &categories, interactive)
    };
    Ok(ConfirmationPolicyDecision {
        diagnostic,
        categories,
        interactive,
    })
}

pub fn request_context(
    decision: &ConfirmationPolicyDecision,
) -> Option<ConfirmationPolicyRequestContext> {
    decision
        .enabled()
        .then(|| ConfirmationPolicyRequestContext {
            enabled: true,
            categories: decision.categories.iter().cloned().collect(),
            approved_confirmation_id: None,
        })
}

pub fn request_context_with_approval_id(
    decision: &ConfirmationPolicyDecision,
    approval_id: impl Into<String>,
) -> Option<ConfirmationPolicyRequestContext> {
    let mut context = request_context(decision)?;
    context.approved_confirmation_id = Some(approval_id.into());
    Some(context)
}

pub fn request_context_with_approval(
    record: &PendingConfirmation,
) -> Option<ConfirmationPolicyRequestContext> {
    let mut context = record.confirmation_policy.clone()?;
    context.approved_confirmation_id = Some(record.id.clone());
    Some(context)
}

pub fn decision_from_context(
    context: Option<&ConfirmationPolicyRequestContext>,
) -> ConfirmationPolicyDecision {
    let categories: BTreeSet<String> = context
        .filter(|context| context.enabled)
        .map(|context| context.categories.iter().cloned().collect())
        .unwrap_or_default();
    let diagnostic = if categories.is_empty() {
        disabled_diagnostic(false)
    } else {
        enabled_diagnostic("record", &categories, false)
    };
    ConfirmationPolicyDecision {
        diagnostic,
        categories,
        interactive: false,
    }
}

pub fn parse_confirmation_categories(raw: &str) -> Result<BTreeSet<String>> {
    let mut categories = BTreeSet::new();
    for part in raw.split(',') {
        let category = part.trim().to_ascii_lowercase();
        if category.is_empty() {
            bail!("invalid_args: {CONFIRM_ACTIONS_ENV_VAR} contains an empty action category");
        }
        if !valid_confirmation_category(&category) {
            bail!("invalid_args: unknown confirmation action category `{category}`");
        }
        categories.insert(category);
    }
    if categories.is_empty() {
        bail!("invalid_args: confirmation action list must contain at least one category");
    }
    Ok(categories)
}

pub fn new_confirmation_id() -> String {
    let hex = Uuid::new_v4().simple().to_string();
    format!("c_{}", &hex[..8])
}

pub fn confirmation_id_is_valid(id: &str) -> bool {
    id.len() == 10 && id.starts_with("c_") && id[2..].chars().all(|ch| ch.is_ascii_hexdigit())
}

pub fn confirmations_dir() -> Result<PathBuf> {
    Ok(data_dir()?.join("confirmations"))
}

pub fn confirmation_path(id: &str) -> Result<PathBuf> {
    confirmation_path_in_dir(&confirmations_dir()?, id)
}

pub fn confirmation_path_in_dir(dir: &Path, id: &str) -> Result<PathBuf> {
    if !confirmation_id_is_valid(id) {
        bail!("invalid_args: invalid confirmation id `{id}`");
    }
    Ok(dir.join(format!("{id}.json")))
}

pub fn write_pending_confirmation(record: &PendingConfirmation) -> Result<PathBuf> {
    let dir = confirmations_dir()?;
    write_pending_confirmation_in_dir(&dir, record)
}

pub fn write_pending_confirmation_in_dir(
    dir: &Path,
    record: &PendingConfirmation,
) -> Result<PathBuf> {
    fs::create_dir_all(dir)?;
    let final_path = confirmation_path_in_dir(dir, &record.id)?;
    let tmp_path = final_path.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(record)?;
    fs::write(&tmp_path, body)
        .with_context(|| format!("failed to write {}", tmp_path.display()))?;
    fs::rename(&tmp_path, &final_path)
        .with_context(|| format!("failed to publish {}", final_path.display()))?;
    Ok(final_path)
}

pub fn read_pending_confirmation(id: &str, now: u64) -> Result<PendingConfirmation> {
    let dir = confirmations_dir()?;
    read_pending_confirmation_in_dir(&dir, id, now)
}

pub fn read_pending_confirmation_in_dir(
    dir: &Path,
    id: &str,
    now: u64,
) -> Result<PendingConfirmation> {
    let path = confirmation_path_in_dir(dir, id)?;
    let body = fs::read_to_string(&path)
        .with_context(|| format!("confirmation_not_found: no pending confirmation `{id}`"))?;
    let record: PendingConfirmation = serde_json::from_str(&body)
        .context("invalid_args: pending confirmation record is malformed")?;
    validate_pending_confirmation(&record)?;
    if record.expires_at <= now {
        let _ = fs::remove_file(path);
        bail!("ConfirmationExpired: pending confirmation `{id}` expired before approval");
    }
    Ok(record)
}

pub fn consume_pending_confirmation(id: &str, now: u64) -> Result<PendingConfirmation> {
    let dir = confirmations_dir()?;
    consume_pending_confirmation_in_dir(&dir, id, now)
}

pub fn consume_pending_confirmation_in_dir(
    dir: &Path,
    id: &str,
    now: u64,
) -> Result<PendingConfirmation> {
    let record = read_pending_confirmation_in_dir(dir, id, now)?;
    let path = confirmation_path_in_dir(dir, id)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(record),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            bail!("confirmation_not_found: no pending confirmation `{id}`")
        }
        Err(err) => Err(err).with_context(|| format!("failed to consume {}", path.display())),
    }
}

pub fn deny_pending_confirmation(id: &str, now: u64) -> Result<PendingConfirmation> {
    consume_pending_confirmation(id, now)
}

pub fn sweep_expired_confirmations(now: u64) -> Result<usize> {
    let dir = confirmations_dir()?;
    sweep_expired_confirmations_in_dir(&dir, now)
}

pub fn sweep_expired_confirmations_in_dir(dir: &Path, now: u64) -> Result<usize> {
    if !dir.exists() {
        return Ok(0);
    }
    let mut removed = 0;
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let expired = fs::read_to_string(&path)
            .ok()
            .and_then(|body| serde_json::from_str::<PendingConfirmation>(&body).ok())
            .map(|record| record.expires_at <= now)
            .unwrap_or(true);
        if expired && fs::remove_file(path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

pub fn validate_pending_confirmation(record: &PendingConfirmation) -> Result<()> {
    if record.schema_version != 1 {
        bail!("invalid_args: unsupported confirmation record schema");
    }
    if record.kind != "action-confirmation" {
        bail!("invalid_args: unsupported confirmation record kind");
    }
    if !confirmation_id_is_valid(&record.id) {
        bail!("invalid_args: invalid confirmation id in record");
    }
    if !valid_confirmation_category(&record.category) {
        bail!("invalid_args: invalid confirmation category in record");
    }
    if record.command_root.is_empty() || record.args.is_empty() {
        bail!("invalid_args: confirmation record is missing command metadata");
    }
    Ok(())
}

fn valid_confirmation_category(category: &str) -> bool {
    action_categories().contains(&category) || valid_plugin_confirmation_category(category)
}

fn valid_plugin_confirmation_category(category: &str) -> bool {
    let mut parts = category.split(':');
    let Some("plugin") = parts.next() else {
        return false;
    };
    let Some(name) = parts.next() else {
        return false;
    };
    let Some(capability) = parts.next() else {
        return false;
    };
    if parts.next().is_some() || name.is_empty() || capability.is_empty() {
        return false;
    }
    name.chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        && capability
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
}

fn parse_bool_env(value: Option<&str>, env_var: &str) -> Result<bool> {
    let Some(value) = value else {
        return Ok(false);
    };
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Ok(true),
        "0" | "false" | "no" | "off" | "" => Ok(false),
        other => bail!(
            "invalid_args: {env_var}={other:?} is not valid; expected one of 1/true/yes/on or 0/false/no/off"
        ),
    }
}

fn enabled_diagnostic(
    source: &str,
    categories: &BTreeSet<String>,
    interactive: bool,
) -> ConfirmationPolicyDiagnostic {
    let categories: Vec<_> = categories.iter().cloned().collect();
    ConfirmationPolicyDiagnostic {
        enabled: true,
        source: source.to_string(),
        env_var: CONFIRM_ACTIONS_ENV_VAR.to_string(),
        interactive_env_var: CONFIRM_INTERACTIVE_ENV_VAR.to_string(),
        valid: true,
        categories: categories.clone(),
        interactive,
        ttl_ms: CONFIRMATION_TTL_MS,
        message: format!(
            "confirmation is required for action categories [{}]{}",
            categories.join(", "),
            if interactive {
                " with interactive prompts enabled"
            } else {
                ""
            }
        ),
    }
}

fn disabled_diagnostic(interactive: bool) -> ConfirmationPolicyDiagnostic {
    ConfirmationPolicyDiagnostic {
        enabled: false,
        source: "default".to_string(),
        env_var: CONFIRM_ACTIONS_ENV_VAR.to_string(),
        interactive_env_var: CONFIRM_INTERACTIVE_ENV_VAR.to_string(),
        valid: true,
        categories: Vec::new(),
        interactive,
        ttl_ms: CONFIRMATION_TTL_MS,
        message: format!(
            "action confirmation is disabled by default; set {CONFIRM_ACTIONS_ENV_VAR}=eval,download to enable it"
        ),
    }
}

fn invalid_diagnostic(source: &str, message: String) -> ConfirmationPolicyDiagnostic {
    ConfirmationPolicyDiagnostic {
        enabled: false,
        source: source.to_string(),
        env_var: CONFIRM_ACTIONS_ENV_VAR.to_string(),
        interactive_env_var: CONFIRM_INTERACTIVE_ENV_VAR.to_string(),
        valid: false,
        categories: Vec::new(),
        interactive: false,
        ttl_ms: CONFIRMATION_TTL_MS,
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn target() -> PendingConfirmationTarget {
        PendingConfirmationTarget::Default
    }

    fn record(id: &str, now: u64) -> PendingConfirmation {
        PendingConfirmation {
            schema_version: 1,
            kind: "action-confirmation".to_string(),
            id: id.to_string(),
            created_at: now,
            expires_at: now + CONFIRMATION_TTL_MS,
            category: "eval".to_string(),
            command_root: "eval".to_string(),
            target: target(),
            args: vec!["eval".to_string(), "document.title".to_string()],
            domain_policy: None,
            action_policy: None,
            confirmation_policy: Some(ConfirmationPolicyRequestContext {
                enabled: true,
                categories: vec!["eval".to_string()],
                approved_confirmation_id: None,
            }),
            metadata: None,
        }
    }

    #[test]
    fn parses_confirmation_policy_from_flag_env_and_interactive() {
        let args = ConfirmationPolicyArgs {
            confirm_actions: Some("eval, download".to_string()),
            confirm_interactive: true,
        };
        let decision =
            resolve_confirmation_policy_from_env_values(Some("click"), Some("0"), &args).unwrap();
        assert!(decision.requires("eval"));
        assert!(decision.requires("download"));
        assert!(!decision.requires("click"));
        assert!(decision.interactive);
        assert_eq!(decision.diagnostic.source, "flag");

        let plugin_decision = resolve_confirmation_policy_from_env_values(
            None,
            None,
            &ConfirmationPolicyArgs {
                confirm_actions: Some("plugin:vault:credential.read".to_string()),
                confirm_interactive: false,
            },
        )
        .unwrap();
        assert!(plugin_decision.requires("plugin:vault:credential.read"));

        let env_decision = resolve_confirmation_policy_from_env_values(
            Some("snapshot"),
            Some("yes"),
            &ConfirmationPolicyArgs::default(),
        )
        .unwrap();
        assert!(env_decision.requires("snapshot"));
        assert!(env_decision.interactive);
        assert_eq!(env_decision.diagnostic.source, "env");
    }

    #[test]
    fn rejects_invalid_confirmation_policy_values() {
        assert!(resolve_confirmation_policy_from_env_values(
            Some("eval,unknown"),
            None,
            &ConfirmationPolicyArgs::default()
        )
        .is_err());
        assert!(resolve_confirmation_policy_from_env_values(
            Some("eval"),
            Some("maybe"),
            &ConfirmationPolicyArgs::default()
        )
        .is_err());
        assert!(!confirmation_policy_from_env_values(Some("bad"), None).valid);
    }

    #[test]
    fn confirmation_records_write_consume_and_sweep() {
        let temp = TempDir::new().unwrap();
        let first = record("c_1234abcd", 1000);
        let path = write_pending_confirmation_in_dir(temp.path(), &first).unwrap();
        assert!(path.exists());
        assert_eq!(
            read_pending_confirmation_in_dir(temp.path(), "c_1234abcd", 1001)
                .unwrap()
                .category,
            "eval"
        );
        let consumed =
            consume_pending_confirmation_in_dir(temp.path(), "c_1234abcd", 1001).unwrap();
        assert_eq!(consumed.id, "c_1234abcd");
        assert!(consume_pending_confirmation_in_dir(temp.path(), "c_1234abcd", 1001).is_err());

        let expired = record("c_deadbeef", 1000);
        write_pending_confirmation_in_dir(temp.path(), &expired).unwrap();
        assert_eq!(
            sweep_expired_confirmations_in_dir(temp.path(), 1000 + CONFIRMATION_TTL_MS + 1)
                .unwrap(),
            1
        );
    }

    #[test]
    fn validates_confirmation_ids_and_records() {
        assert!(confirmation_id_is_valid("c_1234abcd"));
        assert!(!confirmation_id_is_valid("c_123"));
        assert!(!confirmation_id_is_valid("../bad"));
        let mut bad = record("c_1234abcd", 0);
        bad.category = "unknown".to_string();
        assert!(validate_pending_confirmation(&bad).is_err());
    }

    #[test]
    fn request_context_with_approval_id_marks_interactive_approval() {
        let decision = decision_from_context(Some(&ConfirmationPolicyRequestContext {
            enabled: true,
            categories: vec!["eval".to_string()],
            approved_confirmation_id: None,
        }));
        let context =
            request_context_with_approval_id(&decision, INTERACTIVE_CONFIRMATION_APPROVAL_ID)
                .unwrap();
        assert_eq!(
            context.approved_confirmation_id.as_deref(),
            Some(INTERACTIVE_CONFIRMATION_APPROVAL_ID)
        );
    }
}
