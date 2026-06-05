use serde_json::Value;

const REDACTED: &str = "[REDACTED]";

const SENSITIVE_KEYS: &[&str] = &[
    "access_token",
    "apikey",
    "api-key",
    "api_key",
    "auth",
    "authorization",
    "client_secret",
    "code",
    "cookie",
    "id_token",
    "key",
    "one_time_code",
    "otp",
    "password",
    "refresh_token",
    "secret",
    "session",
    "token",
];

pub fn redact_text(input: &str) -> String {
    let mut text = input.to_string();
    text = redact_cookie_headers(&text);
    text = redact_bearer_tokens(&text);
    text = redact_url_query_values(&text);
    text = redact_key_value_assignments(&text);
    text = redact_jwt_like_tokens(&text);
    text
}

pub fn redact_json_value(value: &mut Value) {
    match value {
        Value::String(text) => {
            *text = redact_text(text);
        }
        Value::Array(values) => {
            for value in values {
                redact_json_value(value);
            }
        }
        Value::Object(values) => {
            for (key, value) in values.iter_mut() {
                if is_sensitive_key(key) {
                    *value = Value::String(REDACTED.to_string());
                } else {
                    redact_json_value(value);
                }
            }
        }
        _ => {}
    }
}

fn redact_cookie_headers(input: &str) -> String {
    input
        .lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            if lower.trim_start().starts_with("cookie:")
                || lower.trim_start().starts_with("set-cookie:")
            {
                if let Some(index) = line.find(':') {
                    return format!("{}: {REDACTED}", &line[..index]);
                }
            }
            line.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn redact_bearer_tokens(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut index = 0;
    let lower = input.to_ascii_lowercase();
    while let Some(offset) = lower[index..].find("bearer ") {
        let start = index + offset;
        out.push_str(&input[index..start + "bearer ".len()]);
        let value_start = start + "bearer ".len();
        let value_end = input[value_start..]
            .find(is_value_delimiter)
            .map(|end| value_start + end)
            .unwrap_or(input.len());
        out.push_str(REDACTED);
        index = value_end;
    }
    out.push_str(&input[index..]);
    out
}

fn redact_url_query_values(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut index = 0;
    while index < input.len() {
        let ch = input[index..].chars().next().unwrap_or_default();
        if ch != '?' && ch != '&' {
            out.push(ch);
            index += ch.len_utf8();
            continue;
        }

        let key_start = index + 1;
        let Some(relative_equals) = input[key_start..].find('=') else {
            out.push(ch);
            index += ch.len_utf8();
            continue;
        };
        let equals = key_start + relative_equals;
        let key = &input[key_start..equals];
        if key.is_empty()
            || key
                .chars()
                .any(|value| value.is_whitespace() || value == '/' || value == '?')
        {
            out.push(ch);
            index += ch.len_utf8();
            continue;
        }

        out.push(ch);
        out.push_str(key);
        out.push('=');
        let value_start = equals + 1;
        let value_end = input[value_start..]
            .find(|value| {
                matches!(value, '&' | '#' | '"' | '\'' | ')' | ']' | '}' | '<' | '>')
                    || value.is_whitespace()
            })
            .map(|end| value_start + end)
            .unwrap_or(input.len());
        if is_sensitive_key(key) {
            out.push_str(REDACTED);
        } else {
            out.push_str(&input[value_start..value_end]);
        }
        index = value_end;
    }
    out
}

fn redact_key_value_assignments(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for token in split_keep_delimiters(input) {
        if let Some(redacted) = redact_assignment_token(&token) {
            out.push_str(&redacted);
        } else {
            out.push_str(&token);
        }
    }
    out
}

fn split_keep_delimiters(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in input.chars() {
        if ch.is_whitespace() || matches!(ch, ',' | ';') {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
            tokens.push(ch.to_string());
        } else {
            current.push(ch);
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn redact_assignment_token(token: &str) -> Option<String> {
    if token.contains("://") || token.contains('?') || token.contains('&') {
        return None;
    }
    let separator = token.find('=').or_else(|| token.find(':'))?;
    let raw_key = token[..separator].trim_matches(|value| matches!(value, '"' | '\'' | '{' | '['));
    if !is_sensitive_key(raw_key) {
        return None;
    }
    let mut end = token.len();
    while end > separator + 1 && matches!(token.as_bytes()[end - 1] as char, '"' | '\'' | '}' | ']')
    {
        end -= 1;
    }
    let suffix = &token[end..];
    Some(format!("{}{}{}", &token[..separator + 1], REDACTED, suffix))
}

fn redact_jwt_like_tokens(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for token in split_keep_delimiters(input) {
        let trimmed = token
            .trim_matches(|value| matches!(value, '"' | '\'' | ')' | '(' | '[' | ']' | '{' | '}'));
        if is_jwt_like(trimmed) {
            out.push_str(&token.replace(trimmed, REDACTED));
        } else {
            out.push_str(&token);
        }
    }
    out
}

fn is_jwt_like(value: &str) -> bool {
    let parts: Vec<_> = value.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| part.len() >= 8 && part.chars().all(is_base64_url_char))
}

fn is_base64_url_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'
}

fn is_value_delimiter(ch: char) -> bool {
    ch.is_whitespace() || matches!(ch, '"' | '\'' | ',' | ';' | ')' | ']' | '}')
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key
        .trim_matches(|value| matches!(value, '"' | '\'' | '-' | '_' | '[' | ']'))
        .to_ascii_lowercase()
        .replace('-', "_");
    let compact = normalized.replace('_', "");
    SENSITIVE_KEYS.iter().any(|sensitive| {
        let sensitive = sensitive.replace('-', "_");
        let sensitive_compact = sensitive.replace('_', "");
        let allow_compact_suffix = sensitive_compact.len() > 3;
        normalized == sensitive
            || normalized.ends_with(&format!("_{sensitive}"))
            || compact == sensitive_compact
            || (allow_compact_suffix && compact.ends_with(&sensitive_compact))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn redacts_common_secret_shapes() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        let input = format!(
            "GET https://example.test/callback?code=oauth-code-123&state=ok\nAuthorization: Bearer abc123SECRET\nCookie: session=abc; token=def\npassword=hunter2 api_key=sk-test {jwt}"
        );

        let redacted = redact_text(&input);

        assert!(!redacted.contains("oauth-code-123"));
        assert!(!redacted.contains("abc123SECRET"));
        assert!(!redacted.contains("session=abc"));
        assert!(!redacted.contains("hunter2"));
        assert!(!redacted.contains("sk-test"));
        assert!(!redacted.contains(jwt));
        assert!(redacted.contains("state=ok"));
        assert!(redacted.contains(REDACTED));
    }

    #[test]
    fn redacts_nested_json_sensitive_keys() {
        let mut value = json!({
            "message": "failed with token=abc",
            "data": {
                "accessToken": "raw",
                "safe": "hello"
            }
        });

        redact_json_value(&mut value);

        assert_eq!(value["data"]["accessToken"], REDACTED);
        assert_eq!(value["data"]["safe"], "hello");
        assert!(!value["message"].as_str().unwrap().contains("abc"));
    }
}
