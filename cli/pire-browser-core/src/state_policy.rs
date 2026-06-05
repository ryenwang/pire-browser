use anyhow::{bail, Result};
use serde::Serialize;

use crate::state_file::STATE_RECEIPT_TTL_MS;

pub const STATE_POLICY_ENV_VAR: &str = "PIRE_BROWSER_REQUIRE_INSPECTED_STATE";
pub const STATE_POLICY_OVERRIDE_WARNING_CODE: &str = "STATE_POLICY_OVERRIDDEN";

const ENABLED_VALUES: &[&str] = &["1", "true", "yes", "on"];
const DISABLED_VALUES: &[&str] = &["0", "false", "no", "off"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StateLoadPolicyFlag {
    Unspecified,
    RequireInspected,
    NoRequireInspected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatePolicyDiagnostic {
    pub require_inspected_state_loads: bool,
    pub source: String,
    pub env_var: String,
    pub valid: bool,
    pub message: String,
    pub receipt_ttl_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatePolicyWarning {
    pub code: String,
    pub feature: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StateLoadPolicyDecision {
    pub diagnostic: StatePolicyDiagnostic,
    pub require_inspected: bool,
    pub warnings: Vec<StatePolicyWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum EnvPolicyValue {
    Default,
    Disabled,
    Enabled,
    Invalid(String),
}

pub fn collect_state_policy() -> StatePolicyDiagnostic {
    state_policy_from_env_value(std::env::var(STATE_POLICY_ENV_VAR).ok().as_deref())
}

pub fn state_policy_text(policy: &StatePolicyDiagnostic) -> String {
    format!("State policy: {}", policy.message)
}

pub fn state_policy_from_env_value(value: Option<&str>) -> StatePolicyDiagnostic {
    match parse_env_policy_value(value) {
        EnvPolicyValue::Default => diagnostic(
            false,
            "default",
            true,
            format!(
                "state load does not require inspection receipts by default; set {STATE_POLICY_ENV_VAR}=1 to require them"
            ),
        ),
        EnvPolicyValue::Disabled => diagnostic(
            false,
            "env",
            true,
            format!(
                "state load does not require inspection receipts because {STATE_POLICY_ENV_VAR} is disabled"
            ),
        ),
        EnvPolicyValue::Enabled => diagnostic(
            true,
            "env",
            true,
            format!(
                "state load requires a fresh `state inspect --record` receipt because {STATE_POLICY_ENV_VAR} is enabled"
            ),
        ),
        EnvPolicyValue::Invalid(received) => diagnostic(
            false,
            "env",
            false,
            invalid_env_message(&received),
        ),
    }
}

pub fn resolve_state_load_policy(flag: StateLoadPolicyFlag) -> Result<StateLoadPolicyDecision> {
    resolve_state_load_policy_from_env_value(
        std::env::var(STATE_POLICY_ENV_VAR).ok().as_deref(),
        flag,
    )
}

pub fn resolve_state_load_policy_from_env_value(
    value: Option<&str>,
    flag: StateLoadPolicyFlag,
) -> Result<StateLoadPolicyDecision> {
    let env_value = parse_env_policy_value(value);
    match flag {
        StateLoadPolicyFlag::RequireInspected => Ok(StateLoadPolicyDecision {
            diagnostic: diagnostic(
                true,
                "flag",
                true,
                "`--require-inspected` requires a fresh `state inspect --record` receipt for this state load",
            ),
            require_inspected: true,
            warnings: Vec::new(),
        }),
        StateLoadPolicyFlag::NoRequireInspected => {
            let mut warnings = Vec::new();
            if matches!(env_value, EnvPolicyValue::Enabled) {
                warnings.push(StatePolicyWarning {
                    code: STATE_POLICY_OVERRIDE_WARNING_CODE.to_string(),
                    feature: "state load".to_string(),
                    message: format!(
                        "`--no-require-inspected` skipped the receipt requirement set by {STATE_POLICY_ENV_VAR}; this is a cooperative operator override, not a sandbox boundary."
                    ),
                });
            }
            Ok(StateLoadPolicyDecision {
                diagnostic: diagnostic(
                    false,
                    "flag",
                    true,
                    "`--no-require-inspected` disables the inspected-state receipt requirement for this state load",
                ),
                require_inspected: false,
                warnings,
            })
        }
        StateLoadPolicyFlag::Unspecified => match env_value {
            EnvPolicyValue::Invalid(received) => bail!("invalid_args: {}", invalid_env_message(&received)),
            _ => {
                let diagnostic = state_policy_from_env_value(value);
                Ok(StateLoadPolicyDecision {
                    require_inspected: diagnostic.require_inspected_state_loads,
                    diagnostic,
                    warnings: Vec::new(),
                })
            }
        },
    }
}

fn diagnostic(
    require_inspected_state_loads: bool,
    source: impl Into<String>,
    valid: bool,
    message: impl Into<String>,
) -> StatePolicyDiagnostic {
    StatePolicyDiagnostic {
        require_inspected_state_loads,
        source: source.into(),
        env_var: STATE_POLICY_ENV_VAR.to_string(),
        valid,
        message: message.into(),
        receipt_ttl_ms: STATE_RECEIPT_TTL_MS,
    }
}

fn parse_env_policy_value(value: Option<&str>) -> EnvPolicyValue {
    let Some(value) = value else {
        return EnvPolicyValue::Default;
    };
    let normalized = value.trim().to_ascii_lowercase();
    if ENABLED_VALUES.contains(&normalized.as_str()) {
        return EnvPolicyValue::Enabled;
    }
    if DISABLED_VALUES.contains(&normalized.as_str()) {
        return EnvPolicyValue::Disabled;
    }
    EnvPolicyValue::Invalid(value.to_string())
}

fn invalid_env_message(received: &str) -> String {
    format!(
        "{STATE_POLICY_ENV_VAR}=\"{received}\" is not a valid policy value; expected one of 1/true/yes/on or 0/false/no/off"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_policy_diagnostics_from_env_values() {
        let unset = state_policy_from_env_value(None);
        assert!(!unset.require_inspected_state_loads);
        assert_eq!(unset.source, "default");
        assert!(unset.valid);

        for value in ["1", "true", "TRUE", "yes", "on", " On "] {
            let policy = state_policy_from_env_value(Some(value));
            assert!(policy.require_inspected_state_loads, "{value}");
            assert_eq!(policy.source, "env");
            assert!(policy.valid);
        }

        for value in ["0", "false", "FALSE", "no", "off", " off "] {
            let policy = state_policy_from_env_value(Some(value));
            assert!(!policy.require_inspected_state_loads, "{value}");
            assert_eq!(policy.source, "env");
            assert!(policy.valid);
        }

        let invalid = state_policy_from_env_value(Some("tru"));
        assert!(!invalid.require_inspected_state_loads);
        assert_eq!(invalid.source, "env");
        assert!(!invalid.valid);
        assert!(invalid.message.contains("tru"));
        assert!(invalid.message.contains("1/true/yes/on"));
    }

    #[test]
    fn serializes_state_policy_contract_shape() {
        let policy = state_policy_from_env_value(Some("on"));
        let value = serde_json::to_value(policy).unwrap();
        assert_eq!(
            value,
            json!({
                "requireInspectedStateLoads": true,
                "source": "env",
                "envVar": STATE_POLICY_ENV_VAR,
                "valid": true,
                "message": format!("state load requires a fresh `state inspect --record` receipt because {STATE_POLICY_ENV_VAR} is enabled"),
                "receiptTtlMs": STATE_RECEIPT_TTL_MS,
            })
        );
    }

    #[test]
    fn resolves_full_state_load_precedence_table() {
        let rows = [
            (None, StateLoadPolicyFlag::Unspecified, false, false, false),
            (
                Some("off"),
                StateLoadPolicyFlag::Unspecified,
                false,
                false,
                false,
            ),
            (
                None,
                StateLoadPolicyFlag::RequireInspected,
                true,
                false,
                false,
            ),
            (
                Some("0"),
                StateLoadPolicyFlag::RequireInspected,
                true,
                false,
                false,
            ),
            (
                None,
                StateLoadPolicyFlag::NoRequireInspected,
                false,
                false,
                false,
            ),
            (
                Some("false"),
                StateLoadPolicyFlag::NoRequireInspected,
                false,
                false,
                false,
            ),
            (
                Some("true"),
                StateLoadPolicyFlag::Unspecified,
                true,
                false,
                false,
            ),
            (
                Some("yes"),
                StateLoadPolicyFlag::RequireInspected,
                true,
                false,
                false,
            ),
            (
                Some("on"),
                StateLoadPolicyFlag::NoRequireInspected,
                false,
                true,
                false,
            ),
            (
                Some("tru"),
                StateLoadPolicyFlag::Unspecified,
                false,
                false,
                true,
            ),
            (
                Some("tru"),
                StateLoadPolicyFlag::RequireInspected,
                true,
                false,
                false,
            ),
            (
                Some("tru"),
                StateLoadPolicyFlag::NoRequireInspected,
                false,
                false,
                false,
            ),
        ];

        for (env, flag, require, warn, err) in rows {
            let result = resolve_state_load_policy_from_env_value(env, flag);
            if err {
                let message = result.unwrap_err().to_string();
                assert!(message.contains("invalid_args"), "{env:?} {flag:?}");
                assert!(message.contains("tru"), "{message}");
                continue;
            }
            let decision = result.unwrap();
            assert_eq!(decision.require_inspected, require, "{env:?} {flag:?}");
            assert_eq!(
                decision
                    .warnings
                    .iter()
                    .any(|warning| warning.code == STATE_POLICY_OVERRIDE_WARNING_CODE),
                warn,
                "{env:?} {flag:?}"
            );
        }
    }

    #[test]
    fn explicit_flags_use_flag_source_and_ignore_invalid_env() {
        let require = resolve_state_load_policy_from_env_value(
            Some("not-valid"),
            StateLoadPolicyFlag::RequireInspected,
        )
        .unwrap();
        assert_eq!(require.diagnostic.source, "flag");
        assert!(require.diagnostic.valid);
        assert!(require.require_inspected);

        let no_require = resolve_state_load_policy_from_env_value(
            Some("not-valid"),
            StateLoadPolicyFlag::NoRequireInspected,
        )
        .unwrap();
        assert_eq!(no_require.diagnostic.source, "flag");
        assert!(no_require.diagnostic.valid);
        assert!(!no_require.require_inspected);
        assert!(no_require.warnings.is_empty());
    }
}
