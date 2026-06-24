use anyhow::{bail, Context, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::process::Command;

const MAX_READ_BYTES: usize = 2_000_000;
const USER_AGENT_VALUE: &str = concat!("pire-browser/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadUrlOptions {
    pub url: String,
    pub raw: bool,
    pub require_md: bool,
    pub outline: bool,
    pub llms: Option<String>,
    pub filter: Option<String>,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone)]
struct ReadResponse {
    requested_url: String,
    final_url: String,
    status: u16,
    content_type: String,
    body: String,
}

pub fn read_url(options: &ReadUrlOptions) -> Result<Value> {
    let response = if let Some(mode) = options.llms.as_deref() {
        read_llms(options, mode)?
    } else {
        fetch_text(&normalize_read_url(&options.url)?, options.timeout_ms)?
    };
    let content_type = response.content_type.to_ascii_lowercase();
    let markdown = is_markdown_content(&content_type, &response.final_url);
    if options.require_md && !markdown {
        bail!(
            "read_failed: {} did not return markdown content (content-type: {})",
            response.final_url,
            response.content_type
        );
    }

    let kind = if options.llms.is_some() {
        "llms"
    } else if options.raw {
        "raw"
    } else if markdown {
        "markdown"
    } else if content_type.contains("html") || looks_like_html(&response.body) {
        "html"
    } else {
        "text"
    };
    let mut text = if options.raw || kind == "markdown" || kind == "text" || kind == "llms" {
        normalize_text(&response.body)
    } else {
        extract_text_from_html(&response.body)
    };

    let outline = if options.outline {
        let outline = if kind == "html" {
            html_outline(&response.body)
        } else {
            markdown_outline(&text)
        };
        text = outline.join("\n");
        Some(outline)
    } else {
        None
    };

    if let Some(filter) = normalized_filter(options.filter.as_deref()) {
        text = filter_text(&text, &filter);
    }

    Ok(json!({
        "text": text,
        "read": {
            "source": "url",
            "kind": kind,
            "url": response.final_url,
            "requestedUrl": response.requested_url,
            "status": response.status,
            "contentType": response.content_type,
            "bytes": response.body.len(),
            "filter": options.filter,
            "outline": outline,
            "llms": options.llms,
        }
    }))
}

fn read_llms(options: &ReadUrlOptions, mode: &str) -> Result<ReadResponse> {
    let file_name = match mode {
        "index" => "llms.txt",
        "full" => "llms-full.txt",
        other => bail!("invalid_args: --llms must be index or full, got {other}"),
    };
    let mut errors = Vec::new();
    for url in llms_candidates(&options.url, file_name)? {
        match fetch_text(&url, options.timeout_ms) {
            Ok(response) => return Ok(response),
            Err(error) => errors.push(format!("{url} ({error})")),
        }
    }
    bail!(
        "read_failed: could not find {file_name} near {}; tried {}",
        options.url,
        errors.join(", ")
    )
}

fn fetch_text(url: &str, timeout_ms: u64) -> Result<ReadResponse> {
    let normalized = normalize_read_url(url)?;
    let node = std::env::var("NODE").unwrap_or_else(|_| "node".to_string());
    let output = Command::new(&node)
        .arg("-e")
        .arg(NODE_FETCH_SCRIPT)
        .arg(&normalized)
        .arg(timeout_ms.max(1).to_string())
        .arg(MAX_READ_BYTES.to_string())
        .arg(USER_AGENT_VALUE)
        .output()
        .with_context(|| {
            format!(
                "read_failed: read <url> requires Node.js with fetch support on PATH; failed to run `{node}`"
            )
        })?;
    if !output.stderr.is_empty() && output.stdout.is_empty() {
        if let Ok(error) = serde_json::from_slice::<Value>(&output.stderr) {
            let message = error
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| error.get("error").and_then(Value::as_str))
                .unwrap_or("Node fetch failed");
            bail!("read_failed: {message}");
        }
    }
    let mut value: Value = serde_json::from_slice(&output.stdout).with_context(|| {
        format!(
            "read_failed: failed to parse Node fetch output for {normalized}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
    })?;
    if !output.status.success() {
        let status = value.get("status").and_then(Value::as_u64).unwrap_or(0);
        let final_url = value
            .get("finalUrl")
            .and_then(Value::as_str)
            .unwrap_or(&normalized);
        if status > 0 {
            bail!("read_failed: {final_url} returned HTTP {status}");
        }
        let message = value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Node fetch failed");
        bail!("read_failed: {message}");
    }
    let body = value
        .get_mut("body")
        .and_then(|value| value.take_string())
        .unwrap_or_default();
    if body.len() > MAX_READ_BYTES {
        bail!(
            "read_failed: response from {normalized} is too large ({} bytes, max {MAX_READ_BYTES})",
            body.len()
        );
    }
    Ok(ReadResponse {
        requested_url: value
            .get("requestedUrl")
            .and_then(Value::as_str)
            .unwrap_or(&normalized)
            .to_string(),
        final_url: value
            .get("finalUrl")
            .and_then(Value::as_str)
            .unwrap_or(&normalized)
            .to_string(),
        status: value.get("status").and_then(Value::as_u64).unwrap_or(200) as u16,
        content_type: value
            .get("contentType")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        body,
    })
}

pub fn normalize_read_url(input: &str) -> Result<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        bail!("invalid_args: read requires a URL");
    }
    let normalized = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let lower = normalized.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        bail!("invalid_args: read only supports http(s) URLs");
    }
    let (origin, _) = split_origin_path(&normalized)?;
    if origin.trim_end_matches('/').ends_with("://") {
        bail!("invalid_args: read URL is invalid: {trimmed}");
    }
    Ok(normalized)
}

const NODE_FETCH_SCRIPT: &str = r#"
const [url, timeoutRaw, maxBytesRaw, userAgent] = process.argv.slice(1);
const timeoutMs = Number(timeoutRaw) || 15000;
const maxBytes = Number(maxBytesRaw) || 2000000;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  if (typeof fetch !== "function") {
    throw new Error("Node.js fetch is not available; use Node.js 18 or newer");
  }
  const response = await fetch(url, {
    redirect: "follow",
    signal: controller.signal,
    headers: {
      "accept": "text/markdown, text/plain, text/html;q=0.9, */*;q=0.5",
      "user-agent": userAgent || "pire-browser"
    }
  });
  const array = new Uint8Array(await response.arrayBuffer());
  if (array.byteLength > maxBytes) {
    console.log(JSON.stringify({
      requestedUrl: url,
      finalUrl: response.url,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      message: `response is too large (${array.byteLength} bytes, max ${maxBytes})`,
      body: ""
    }));
    process.exit(3);
  }
  const body = new TextDecoder().decode(array);
  console.log(JSON.stringify({
    requestedUrl: url,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    body
  }));
  process.exit(response.ok ? 0 : 2);
} catch (error) {
  console.error(JSON.stringify({ error: error?.name || "Error", message: error?.message || String(error) }));
  process.exit(1);
} finally {
  clearTimeout(timer);
}
"#;

fn llms_candidates(input: &str, file_name: &str) -> Result<Vec<String>> {
    let base = normalize_read_url(input)?;
    let (origin, path) = split_origin_path(&base)?;
    let mut candidates = Vec::new();
    let path_without_query = path.split(['?', '#']).next().unwrap_or("/");
    let directory = if path_without_query.ends_with('/') {
        path_without_query.to_string()
    } else {
        path_without_query
            .rsplit_once('/')
            .map(|(prefix, _)| format!("{prefix}/"))
            .unwrap_or_else(|| "/".to_string())
    };
    let segments = directory
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    for depth in (0..=segments.len()).rev() {
        let prefix = if depth == 0 {
            "/".to_string()
        } else {
            format!("/{}/", segments[..depth].join("/"))
        };
        let candidate = format!("{origin}{prefix}{file_name}");
        if !candidates.iter().any(|seen| seen == &candidate) {
            candidates.push(candidate);
        }
    }
    Ok(candidates)
}

fn split_origin_path(url: &str) -> Result<(String, String)> {
    let scheme_end = url
        .find("://")
        .ok_or_else(|| anyhow::anyhow!("invalid_args: read URL is invalid: {url}"))?;
    let after_scheme = scheme_end + 3;
    let slash = url[after_scheme..]
        .find('/')
        .map(|index| after_scheme + index)
        .unwrap_or(url.len());
    Ok((url[..slash].to_string(), url[slash..].to_string()))
}

trait TakeString {
    fn take_string(&mut self) -> Option<String>;
}

impl TakeString for Value {
    fn take_string(&mut self) -> Option<String> {
        match std::mem::take(self) {
            Value::String(value) => Some(value),
            other => {
                *self = other;
                None
            }
        }
    }
}

fn is_markdown_content(content_type: &str, url: &str) -> bool {
    content_type.contains("text/markdown")
        || content_type.contains("text/x-markdown")
        || url.to_ascii_lowercase().ends_with(".md")
        || url.to_ascii_lowercase().ends_with(".markdown")
}

fn looks_like_html(text: &str) -> bool {
    let lower = text[..text.len().min(500)].to_ascii_lowercase();
    lower.contains("<!doctype html") || lower.contains("<html") || lower.contains("<body")
}

fn extract_text_from_html(html: &str) -> String {
    let mut text = html.to_string();
    for pattern in [
        r"(?is)<script\b[^>]*>.*?</script>",
        r"(?is)<style\b[^>]*>.*?</style>",
        r"(?is)<noscript\b[^>]*>.*?</noscript>",
        r"(?is)<svg\b[^>]*>.*?</svg>",
        r"(?is)<canvas\b[^>]*>.*?</canvas>",
    ] {
        text = Regex::new(pattern)
            .unwrap()
            .replace_all(&text, "\n")
            .into_owned();
    }
    text = Regex::new(r"(?i)<br\s*/?>")
        .unwrap()
        .replace_all(&text, "\n")
        .into_owned();
    text = Regex::new(r"(?i)</?(p|div|section|article|main|header|footer|li|ul|ol|tr|td|th|pre|blockquote|h[1-6])\b[^>]*>")
        .unwrap()
        .replace_all(&text, "\n")
        .into_owned();
    text = Regex::new(r"(?is)<[^>]+>")
        .unwrap()
        .replace_all(&text, " ")
        .into_owned();
    normalize_text(&decode_html_entities(&text))
}

fn html_outline(html: &str) -> Vec<String> {
    Regex::new(r"(?is)<h([1-6])\b[^>]*>(.*?)</h[1-6]>")
        .unwrap()
        .captures_iter(html)
        .filter_map(|capture| {
            let level = capture.get(1)?.as_str().parse::<usize>().ok()?;
            let title = extract_text_from_html(capture.get(2)?.as_str());
            if title.is_empty() {
                None
            } else {
                Some(format!("{} {}", "#".repeat(level), title))
            }
        })
        .collect()
}

fn markdown_outline(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| line.starts_with('#'))
        .map(ToString::to_string)
        .collect()
}

fn normalized_filter(filter: Option<&str>) -> Option<String> {
    let filter = filter?.trim().to_ascii_lowercase();
    if filter.is_empty() {
        None
    } else {
        Some(filter)
    }
}

fn filter_text(text: &str, filter: &str) -> String {
    let mut lines = Vec::new();
    let mut current_heading = "";
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') {
            current_heading = trimmed;
        }
        if trimmed.to_ascii_lowercase().contains(filter) {
            if !current_heading.is_empty()
                && lines.last().map(String::as_str) != Some(current_heading)
            {
                lines.push(current_heading.to_string());
            }
            lines.push(trimmed.to_string());
        }
    }
    lines.join("\n")
}

fn normalize_text(text: &str) -> String {
    text.replace('\r', "\n")
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
        .split('\n')
        .map(str::trim)
        .collect::<Vec<_>>()
        .join("\n")
        .replace("\n\n\n", "\n\n")
        .trim()
        .to_string()
}

fn decode_html_entities(text: &str) -> String {
    let mut decoded = text
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");
    decoded = Regex::new(r"&#x([0-9a-fA-F]+);")
        .unwrap()
        .replace_all(&decoded, |captures: &regex::Captures| {
            u32::from_str_radix(&captures[1], 16)
                .ok()
                .and_then(char::from_u32)
                .map(|ch| ch.to_string())
                .unwrap_or_else(|| captures[0].to_string())
        })
        .into_owned();
    Regex::new(r"&#([0-9]+);")
        .unwrap()
        .replace_all(&decoded, |captures: &regex::Captures| {
            captures[1]
                .parse::<u32>()
                .ok()
                .and_then(char::from_u32)
                .map(|ch| ch.to_string())
                .unwrap_or_else(|| captures[0].to_string())
        })
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_url_with_https_default() {
        assert_eq!(
            normalize_read_url("example.com/docs").unwrap(),
            "https://example.com/docs"
        );
        assert!(normalize_read_url("file:///tmp/a.html").is_err());
    }

    #[test]
    fn extracts_readable_html_text() {
        let text = extract_text_from_html(
            r#"<html><head><style>.x{}</style></head><body><h1>Title &amp; More</h1><p>Hello <b>world</b>.</p><script>nope()</script></body></html>"#,
        );
        assert!(text.contains("Title & More"));
        assert!(text.contains("Hello"));
        assert!(text.contains("world"));
        assert!(!text.contains("nope"));
    }

    #[test]
    fn creates_html_outline() {
        let outline = html_outline("<h1>Main</h1><section><h2>Details</h2></section>");
        assert_eq!(outline, vec!["# Main", "## Details"]);
    }

    #[test]
    fn filters_text_with_heading_context() {
        let text = "# One\nalpha\n# Two\nbeta match\ngamma";
        assert_eq!(filter_text(text, "match"), "# Two\nbeta match");
    }

    #[test]
    fn walks_llms_candidates_from_nearest_directory() {
        let candidates =
            llms_candidates("https://example.com/docs/guides/page.html?q=1", "llms.txt")
                .unwrap()
                .into_iter()
                .map(|url| url.to_string())
                .collect::<Vec<_>>();
        assert_eq!(
            candidates,
            vec![
                "https://example.com/docs/guides/llms.txt",
                "https://example.com/docs/llms.txt",
                "https://example.com/llms.txt"
            ]
        );
    }
}
