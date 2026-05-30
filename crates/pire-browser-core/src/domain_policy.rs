use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

pub const DOMAIN_POLICY_ENV_VAR: &str = "AGENT_BROWSER_ALLOWED_DOMAINS";
pub const DOMAIN_POLICY_OVERRIDE_WARNING_CODE: &str = "DOMAIN_POLICY_OVERRIDDEN";

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DomainPolicyArgs {
    pub allowed_domains: Option<String>,
    pub no_allowed_domains: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainPolicyDiagnostic {
    pub enabled: bool,
    pub source: String,
    pub env_var: String,
    pub valid: bool,
    pub patterns: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainPolicyWarning {
    pub code: String,
    pub feature: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DomainPolicyDecision {
    pub diagnostic: DomainPolicyDiagnostic,
    pub patterns: Vec<DomainPattern>,
    pub warnings: Vec<DomainPolicyWarning>,
}

impl DomainPolicyDecision {
    pub fn enabled(&self) -> bool {
        !self.patterns.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainPolicyRequestContext {
    pub enabled: bool,
    pub patterns: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UrlPolicyCheck {
    Allowed,
    Denied { host: String },
    NonHttp { scheme: String },
    Invalid(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DomainPattern {
    Exact(String),
    Wildcard(String),
}

impl DomainPattern {
    pub fn text(&self) -> String {
        match self {
            DomainPattern::Exact(host) => host.clone(),
            DomainPattern::Wildcard(suffix) => format!("*.{suffix}"),
        }
    }

    fn matches(&self, host: &str) -> bool {
        match self {
            DomainPattern::Exact(pattern) => host == pattern,
            DomainPattern::Wildcard(suffix) => {
                host != suffix && host.ends_with(&format!(".{suffix}"))
            }
        }
    }
}

pub fn collect_domain_policy() -> DomainPolicyDiagnostic {
    domain_policy_from_env_value(std::env::var(DOMAIN_POLICY_ENV_VAR).ok().as_deref())
}

pub fn domain_policy_text(policy: &DomainPolicyDiagnostic) -> String {
    format!("Domain policy: {}", policy.message)
}

pub fn domain_policy_from_env_value(value: Option<&str>) -> DomainPolicyDiagnostic {
    match value {
        None => diagnostic(
            false,
            "default",
            true,
            Vec::new(),
            format!("domain allowlist is disabled by default; set {DOMAIN_POLICY_ENV_VAR}=example.com to enable it"),
        ),
        Some(raw) => match parse_domain_patterns(raw) {
            Ok(patterns) => diagnostic(
                true,
                "env",
                true,
                pattern_texts(&patterns),
                format!(
                    "domain allowlist is active from {DOMAIN_POLICY_ENV_VAR}: {}",
                    pattern_texts(&patterns).join(", ")
                ),
            ),
            Err(err) => diagnostic(false, "env", false, Vec::new(), err.to_string()),
        },
    }
}

pub fn domain_policy_diagnostic_from_args(args: &DomainPolicyArgs) -> DomainPolicyDiagnostic {
    if args.no_allowed_domains {
        return diagnostic(
            false,
            "flag",
            true,
            Vec::new(),
            "`--no-allowed-domains` disables domain allowlist checks for this command",
        );
    }
    if let Some(raw) = &args.allowed_domains {
        return match parse_domain_patterns(raw) {
            Ok(patterns) => diagnostic(
                true,
                "flag",
                true,
                pattern_texts(&patterns),
                format!(
                    "domain allowlist is active from --allowed-domains: {}",
                    pattern_texts(&patterns).join(", ")
                ),
            ),
            Err(err) => diagnostic(false, "flag", false, Vec::new(), err.to_string()),
        };
    }
    collect_domain_policy()
}

pub fn resolve_domain_policy(args: &DomainPolicyArgs) -> Result<DomainPolicyDecision> {
    resolve_domain_policy_from_env_value(std::env::var(DOMAIN_POLICY_ENV_VAR).ok().as_deref(), args)
}

pub fn resolve_domain_policy_from_env_value(
    env_value: Option<&str>,
    args: &DomainPolicyArgs,
) -> Result<DomainPolicyDecision> {
    if args.no_allowed_domains {
        let mut warnings = Vec::new();
        if env_value
            .map(|value| parse_domain_patterns(value).is_ok())
            .unwrap_or(false)
        {
            warnings.push(DomainPolicyWarning {
                code: DOMAIN_POLICY_OVERRIDE_WARNING_CODE.to_string(),
                feature: "domain allowlist".to_string(),
                message: format!(
                    "`--no-allowed-domains` skipped the allowlist set by {DOMAIN_POLICY_ENV_VAR}; this is a cooperative operator override, not a sandbox boundary."
                ),
            });
        }
        return Ok(DomainPolicyDecision {
            diagnostic: diagnostic(
                false,
                "flag",
                true,
                Vec::new(),
                "`--no-allowed-domains` disables domain allowlist checks for this command",
            ),
            patterns: Vec::new(),
            warnings,
        });
    }

    if let Some(raw) = &args.allowed_domains {
        let patterns = parse_domain_patterns(raw)?;
        return Ok(DomainPolicyDecision {
            diagnostic: diagnostic(
                true,
                "flag",
                true,
                pattern_texts(&patterns),
                format!(
                    "domain allowlist is active from --allowed-domains: {}",
                    pattern_texts(&patterns).join(", ")
                ),
            ),
            patterns,
            warnings: Vec::new(),
        });
    }

    let Some(raw) = env_value else {
        return Ok(DomainPolicyDecision {
            diagnostic: domain_policy_from_env_value(None),
            patterns: Vec::new(),
            warnings: Vec::new(),
        });
    };
    let patterns = parse_domain_patterns(raw)?;
    Ok(DomainPolicyDecision {
        diagnostic: diagnostic(
            true,
            "env",
            true,
            pattern_texts(&patterns),
            format!(
                "domain allowlist is active from {DOMAIN_POLICY_ENV_VAR}: {}",
                pattern_texts(&patterns).join(", ")
            ),
        ),
        patterns,
        warnings: Vec::new(),
    })
}

pub fn request_context(decision: &DomainPolicyDecision) -> Option<DomainPolicyRequestContext> {
    decision.enabled().then(|| DomainPolicyRequestContext {
        enabled: true,
        patterns: pattern_texts(&decision.patterns),
    })
}

pub fn decision_from_request_context(
    context: Option<&DomainPolicyRequestContext>,
) -> Result<DomainPolicyDecision> {
    let Some(context) = context.filter(|context| context.enabled) else {
        return Ok(DomainPolicyDecision {
            diagnostic: diagnostic(
                false,
                "record",
                true,
                Vec::new(),
                "domain allowlist was disabled when this confirmation was recorded",
            ),
            patterns: Vec::new(),
            warnings: Vec::new(),
        });
    };
    let patterns = parse_domain_patterns(&context.patterns.join(","))?;
    Ok(DomainPolicyDecision {
        diagnostic: diagnostic(
            true,
            "record",
            true,
            pattern_texts(&patterns),
            format!(
                "domain allowlist restored from pending confirmation: {}",
                pattern_texts(&patterns).join(", ")
            ),
        ),
        patterns,
        warnings: Vec::new(),
    })
}

pub fn ensure_url_allowed(decision: &DomainPolicyDecision, input: &str) -> Result<()> {
    match check_url_allowed(decision, input) {
        UrlPolicyCheck::Allowed => Ok(()),
        UrlPolicyCheck::Denied { host } => bail!(
            "DomainPolicyError: host `{host}` is outside the active domain allowlist ({})",
            pattern_texts(&decision.patterns).join(", ")
        ),
        UrlPolicyCheck::NonHttp { scheme } => bail!(
            "DomainPolicyError: {scheme}: URLs are not allowed when a domain allowlist is active"
        ),
        UrlPolicyCheck::Invalid(message) => bail!("invalid_args: {message}"),
    }
}

pub fn check_url_allowed(decision: &DomainPolicyDecision, input: &str) -> UrlPolicyCheck {
    if !decision.enabled() {
        return UrlPolicyCheck::Allowed;
    }
    let url = match parse_policy_url(input) {
        Ok(url) => url,
        Err(check) => return check,
    };
    if url.scheme != "http" && url.scheme != "https" {
        return UrlPolicyCheck::NonHttp { scheme: url.scheme };
    }
    if decision
        .patterns
        .iter()
        .any(|pattern| pattern.matches(&url.host))
    {
        UrlPolicyCheck::Allowed
    } else {
        UrlPolicyCheck::Denied { host: url.host }
    }
}

pub fn parse_domain_patterns(raw: &str) -> Result<Vec<DomainPattern>> {
    let mut patterns = Vec::new();
    for part in raw.split(',') {
        let value = part.trim().trim_end_matches('.').to_ascii_lowercase();
        if value.is_empty() {
            bail!("invalid_args: {DOMAIN_POLICY_ENV_VAR} contains an empty domain pattern");
        }
        if value.starts_with("http://")
            || value.starts_with("https://")
            || value.contains('/')
            || value.contains(':')
            || value.chars().any(char::is_whitespace)
        {
            bail!("invalid_args: invalid domain allowlist pattern `{value}`; use hosts like example.com or *.example.com");
        }
        if let Some(suffix) = value.strip_prefix("*.") {
            validate_host_pattern(suffix, true)?;
            patterns.push(DomainPattern::Wildcard(suffix.to_string()));
        } else {
            validate_host_pattern(&value, false)?;
            patterns.push(DomainPattern::Exact(value));
        }
    }
    if patterns.is_empty() {
        bail!("invalid_args: domain allowlist must contain at least one pattern");
    }
    Ok(patterns)
}

fn validate_host_pattern(value: &str, wildcard: bool) -> Result<()> {
    if value.is_empty() || value.starts_with('.') || value.ends_with('.') || value.contains("..") {
        bail!("invalid_args: invalid domain allowlist pattern `{value}`");
    }
    if value == "localhost" && !wildcard {
        return Ok(());
    }
    if value.parse::<std::net::Ipv4Addr>().is_ok() && !wildcard {
        return Ok(());
    }
    if value.split('.').all(|label| {
        !label.is_empty()
            && label
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
            && !label.starts_with('-')
            && !label.ends_with('-')
    }) && value.contains('.')
    {
        return Ok(());
    }
    bail!("invalid_args: invalid domain allowlist pattern `{value}`; use hosts like example.com or *.example.com")
}

fn parse_policy_url(input: &str) -> Result<PolicyUrl, UrlPolicyCheck> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(UrlPolicyCheck::Invalid(
            "empty URL cannot be checked against domain allowlist".to_string(),
        ));
    }
    if let Some(scheme) = explicit_non_http_scheme(trimmed) {
        return Err(UrlPolicyCheck::NonHttp { scheme });
    }
    let normalized = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let Some(scheme_end) = normalized.find("://") else {
        return Err(UrlPolicyCheck::Invalid(format!(
            "invalid URL `{trimmed}` for domain allowlist"
        )));
    };
    let scheme = normalized[..scheme_end].to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err(UrlPolicyCheck::NonHttp { scheme });
    }
    let rest = &normalized[scheme_end + 3..];
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.is_empty() {
        return Err(UrlPolicyCheck::Invalid(format!(
            "invalid URL `{trimmed}` for domain allowlist"
        )));
    }
    let authority = authority.rsplit('@').next().unwrap_or(authority);
    let host = if let Some(stripped) = authority.strip_prefix('[') {
        let Some(end) = stripped.find(']') else {
            return Err(UrlPolicyCheck::Invalid(format!(
                "invalid URL `{trimmed}` for domain allowlist"
            )));
        };
        stripped[..end].to_ascii_lowercase()
    } else {
        authority
            .split(':')
            .next()
            .unwrap_or(authority)
            .trim_end_matches('.')
            .to_ascii_lowercase()
    };
    if host.is_empty() || host.chars().any(char::is_whitespace) {
        return Err(UrlPolicyCheck::Invalid(format!(
            "invalid URL `{trimmed}` for domain allowlist"
        )));
    }
    Ok(PolicyUrl { scheme, host })
}

fn explicit_non_http_scheme(input: &str) -> Option<String> {
    let lower = input.to_ascii_lowercase();
    if lower.contains("://") {
        return None;
    }
    let scheme_end = lower.find(':')?;
    let scheme = &lower[..scheme_end];
    let known_non_http = [
        "about",
        "blob",
        "chrome",
        "data",
        "file",
        "javascript",
        "mailto",
        "moz-extension",
        "resource",
    ];
    known_non_http.contains(&scheme).then(|| scheme.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PolicyUrl {
    scheme: String,
    host: String,
}

fn diagnostic(
    enabled: bool,
    source: impl Into<String>,
    valid: bool,
    patterns: Vec<String>,
    message: impl Into<String>,
) -> DomainPolicyDiagnostic {
    DomainPolicyDiagnostic {
        enabled,
        source: source.into(),
        env_var: DOMAIN_POLICY_ENV_VAR.to_string(),
        valid,
        patterns,
        message: message.into(),
    }
}

fn pattern_texts(patterns: &[DomainPattern]) -> Vec<String> {
    patterns.iter().map(DomainPattern::text).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json::json;

    #[derive(Debug, Deserialize)]
    struct UrlVerdictFixture {
        cases: Vec<UrlVerdictCase>,
    }

    #[derive(Debug, Deserialize)]
    struct UrlVerdictCase {
        name: String,
        patterns: Vec<String>,
        input: String,
        verdict: String,
    }

    fn args(value: Option<&str>, no_allowed_domains: bool) -> DomainPolicyArgs {
        DomainPolicyArgs {
            allowed_domains: value.map(ToString::to_string),
            no_allowed_domains,
        }
    }

    #[test]
    fn parses_domain_policy_precedence() {
        let unset = resolve_domain_policy_from_env_value(None, &args(None, false)).unwrap();
        assert!(!unset.enabled());
        assert_eq!(unset.diagnostic.source, "default");

        let env =
            resolve_domain_policy_from_env_value(Some("example.com"), &args(None, false)).unwrap();
        assert!(env.enabled());
        assert_eq!(env.diagnostic.source, "env");

        let flag = resolve_domain_policy_from_env_value(
            Some("bad value"),
            &args(Some("github.com"), false),
        )
        .unwrap();
        assert!(flag.enabled());
        assert_eq!(flag.diagnostic.source, "flag");
        assert_eq!(flag.diagnostic.patterns, vec!["github.com"]);

        let override_policy =
            resolve_domain_policy_from_env_value(Some("example.com"), &args(None, true)).unwrap();
        assert!(!override_policy.enabled());
        assert_eq!(override_policy.diagnostic.source, "flag");
        assert_eq!(
            override_policy.warnings[0].code,
            DOMAIN_POLICY_OVERRIDE_WARNING_CODE
        );

        let invalid = resolve_domain_policy_from_env_value(Some("bad value"), &args(None, false));
        assert!(invalid.unwrap_err().to_string().contains("invalid_args"));
    }

    #[test]
    fn serializes_domain_policy_diagnostic_shape() {
        let policy =
            resolve_domain_policy_from_env_value(Some("example.com"), &args(None, false)).unwrap();
        let value = serde_json::to_value(policy.diagnostic).unwrap();
        assert_eq!(
            value,
            json!({
                "enabled": true,
                "source": "env",
                "envVar": DOMAIN_POLICY_ENV_VAR,
                "valid": true,
                "patterns": ["example.com"],
                "message": format!("domain allowlist is active from {DOMAIN_POLICY_ENV_VAR}: example.com"),
            })
        );
    }

    #[test]
    fn matches_exact_wildcard_ports_case_and_scheme_less_inputs() {
        let decision = resolve_domain_policy_from_env_value(
            None,
            &args(Some("example.com,*.example.org,localhost,127.0.0.1"), false),
        )
        .unwrap();
        assert_eq!(
            check_url_allowed(&decision, "https://example.com/path"),
            UrlPolicyCheck::Allowed
        );
        assert_eq!(
            check_url_allowed(&decision, "HTTPS://EXAMPLE.COM:8443/path"),
            UrlPolicyCheck::Allowed
        );
        assert_eq!(
            check_url_allowed(&decision, "https://example.com./path"),
            UrlPolicyCheck::Allowed
        );
        assert_eq!(
            check_url_allowed(&decision, "sub.example.org"),
            UrlPolicyCheck::Allowed
        );
        assert_eq!(
            check_url_allowed(&decision, "deep.sub.example.org"),
            UrlPolicyCheck::Allowed
        );
        assert_eq!(
            check_url_allowed(&decision, "http://localhost:8765"),
            UrlPolicyCheck::Allowed
        );
        assert_eq!(
            check_url_allowed(&decision, "http://127.0.0.1:8765"),
            UrlPolicyCheck::Allowed
        );
        assert!(matches!(
            check_url_allowed(&decision, "https://example.org"),
            UrlPolicyCheck::Denied { .. }
        ));
        assert!(matches!(
            check_url_allowed(&decision, "file:///tmp/x.html"),
            UrlPolicyCheck::NonHttp { .. }
        ));
        assert!(matches!(
            check_url_allowed(&decision, "about:blank"),
            UrlPolicyCheck::NonHttp { .. }
        ));
    }

    #[test]
    fn shared_url_verdict_fixture_matches_rust_policy() {
        let fixture: UrlVerdictFixture = serde_json::from_str(include_str!(
            "../../../fixtures/domain-policy-url-verdicts.json"
        ))
        .unwrap();
        for case in fixture.cases {
            let raw_patterns = case.patterns.join(",");
            let decision =
                resolve_domain_policy_from_env_value(None, &args(Some(&raw_patterns), false))
                    .unwrap_or_else(|error| panic!("{}: {error:#}", case.name));
            let actual = match check_url_allowed(&decision, &case.input) {
                UrlPolicyCheck::Allowed => "allowed",
                UrlPolicyCheck::Denied { .. } => "denied",
                UrlPolicyCheck::NonHttp { .. } => "non_http",
                UrlPolicyCheck::Invalid(_) => "invalid",
            };
            assert_eq!(actual, case.verdict, "{}", case.name);
        }
    }

    #[test]
    fn rejects_bad_patterns() {
        for value in [
            "",
            "example.com,",
            "https://example.com",
            "bad value",
            "*.localhost",
            "example.com:443",
        ] {
            assert!(parse_domain_patterns(value).is_err(), "{value}");
        }
    }
}
