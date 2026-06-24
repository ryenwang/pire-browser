use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::platform;
use crate::redaction::redact_text;
use crate::session::now_ms;

const ACTIVITY_FILE_NAME: &str = "activity.jsonl";
const MAX_ACTIVITY_LOG_LINES: usize = 400;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    pub schema_version: u8,
    pub event_id: String,
    pub command_id: String,
    pub event: String,
    pub status: String,
    pub command_root: String,
    pub command: String,
    pub args: Vec<String>,
    pub started_at: u64,
    pub updated_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn activity_log_path() -> Result<PathBuf> {
    Ok(platform::data_dir()?.join(ACTIVITY_FILE_NAME))
}

pub fn should_record_activity(args: &[String]) -> bool {
    !args.is_empty() && command_root(args) != "activity"
}

pub fn record_command_started(args: &[String]) -> Result<ActivityEvent> {
    let started_at = now_ms();
    let event = ActivityEvent {
        schema_version: 1,
        event_id: Uuid::new_v4().to_string(),
        command_id: Uuid::new_v4().to_string(),
        event: "command_started".to_string(),
        status: "started".to_string(),
        command_root: command_root(args),
        command: redacted_command(args),
        args: redacted_args(args),
        started_at,
        updated_at: started_at,
        ended_at: None,
        duration_ms: None,
        error: None,
    };
    append_activity_event(&event)?;
    Ok(event)
}

pub fn record_command_finished(
    started: &ActivityEvent,
    error: Option<&str>,
) -> Result<ActivityEvent> {
    let ended_at = now_ms();
    let event = ActivityEvent {
        schema_version: started.schema_version,
        event_id: Uuid::new_v4().to_string(),
        command_id: started.command_id.clone(),
        event: "command_finished".to_string(),
        status: if error.is_some() { "error" } else { "success" }.to_string(),
        command_root: started.command_root.clone(),
        command: started.command.clone(),
        args: started.args.clone(),
        started_at: started.started_at,
        updated_at: ended_at,
        ended_at: Some(ended_at),
        duration_ms: Some(ended_at.saturating_sub(started.started_at)),
        error: error.map(redact_text),
    };
    append_activity_event(&event)?;
    Ok(event)
}

pub fn append_activity_event(event: &ActivityEvent) -> Result<()> {
    append_activity_event_to_path(&activity_log_path()?, event)
}

pub fn append_activity_event_to_path(path: &Path, event: &ActivityEvent) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create activity directory {}", parent.display()))?;
    }
    let mut lines = if path.exists() {
        fs::read_to_string(path)
            .with_context(|| format!("failed to read {}", path.display()))?
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    lines.push(serde_json::to_string(event)?);
    if lines.len() > MAX_ACTIVITY_LOG_LINES {
        let keep_from = lines.len() - MAX_ACTIVITY_LOG_LINES;
        lines = lines.split_off(keep_from);
    }
    let body = if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    };
    fs::write(path, body).with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

pub fn read_recent_activity(limit: usize) -> Result<Vec<ActivityEvent>> {
    read_recent_activity_from_path(&activity_log_path()?, limit)
}

pub fn read_recent_activity_from_path(path: &Path, limit: usize) -> Result<Vec<ActivityEvent>> {
    if limit == 0 || !path.exists() {
        return Ok(Vec::new());
    }
    let body =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let mut events = body
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<ActivityEvent>(line).ok())
        .collect::<Vec<_>>();
    events.sort_by_key(|event| event.updated_at);

    let mut seen = HashSet::new();
    let mut recent = Vec::new();
    for event in events.into_iter().rev() {
        if seen.insert(event.command_id.clone()) {
            recent.push(event);
        }
        if recent.len() >= limit {
            break;
        }
    }
    Ok(recent)
}

pub fn redacted_args(args: &[String]) -> Vec<String> {
    let mut out = Vec::with_capacity(args.len());
    let mut mask_next = false;
    for (index, arg) in args.iter().enumerate() {
        let masked = mask_next || is_sensitive_positional(args, index);
        if masked {
            out.push("[REDACTED]".to_string());
            mask_next = false;
            continue;
        }
        if is_secret_value_flag(arg) {
            out.push(arg.clone());
            mask_next = true;
            continue;
        }
        out.push(redact_text(arg));
    }
    out
}

pub fn redacted_command(args: &[String]) -> String {
    redacted_args(args).join(" ")
}

fn command_root(args: &[String]) -> String {
    command_start_index(args)
        .and_then(|index| args.get(index))
        .cloned()
        .unwrap_or_else(|| "help".to_string())
}

fn command_start_index(args: &[String]) -> Option<usize> {
    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        if arg.starts_with('-') {
            i += if flag_takes_value(arg) { 2 } else { 1 };
            continue;
        }
        return Some(i);
    }
    None
}

fn flag_takes_value(flag: &str) -> bool {
    matches!(
        flag,
        "--session"
            | "--session-name"
            | "--profile"
            | "--state"
            | "--allowed-domains"
            | "--action-policy"
            | "--confirm-actions"
            | "--config"
            | "--firefox-path"
            | "--headers"
            | "--proxy"
            | "--proxy-bypass"
            | "--password"
            | "--url"
            | "--label"
            | "--init-script"
    )
}

fn is_secret_value_flag(flag: &str) -> bool {
    matches!(flag, "--password" | "--headers" | "--proxy")
}

fn is_sensitive_positional(args: &[String], index: usize) -> bool {
    let Some(start) = command_start_index(args) else {
        return false;
    };
    if index <= start {
        return false;
    }
    let relative_index = index - start;
    matches_command(args, start, &["set", "credentials"]) && relative_index >= 3
        || is_sensitive_cookie_set_positional(args, start, relative_index)
        || matches_command(args, start, &["storage", "local", "set"]) && relative_index >= 4
        || matches_command(args, start, &["storage", "session", "set"]) && relative_index >= 4
}

fn is_sensitive_cookie_set_positional(
    args: &[String],
    start: usize,
    relative_index: usize,
) -> bool {
    if !matches_command(args, start, &["cookies", "set"]) {
        return false;
    }
    if relative_index == 3 {
        return true;
    }
    let absolute_index = start + relative_index;
    if absolute_index == 0 {
        return false;
    }
    matches!(
        args.get(absolute_index - 1).map(String::as_str),
        Some("--curl" | "--curl-data")
    )
}

fn matches_command(args: &[String], start: usize, prefix: &[&str]) -> bool {
    args.len() >= start + prefix.len()
        && args[start..]
            .iter()
            .zip(prefix.iter())
            .all(|(actual, expected)| actual == expected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn s(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn redacts_sensitive_arguments() {
        let args = s(&[
            "auth",
            "save",
            "app",
            "--username",
            "user",
            "--password",
            "hunter2",
            "--headers",
            "{\"Authorization\":\"Bearer secret\"}",
        ]);
        let redacted = redacted_args(&args);
        assert!(redacted.contains(&"[REDACTED]".to_string()));
        assert!(!redacted.iter().any(|arg| arg.contains("hunter2")));
        assert!(!redacted.iter().any(|arg| arg.contains("secret")));
    }

    #[test]
    fn redacts_sensitive_positionals() {
        let redacted = redacted_args(&s(&["set", "credentials", "alice", "p4ss"]));
        assert_eq!(redacted, s(&["set", "credentials", "alice", "[REDACTED]"]));

        let redacted = redacted_args(&s(&["--json", "set", "credentials", "alice", "p4ss"]));
        assert_eq!(
            redacted,
            s(&["--json", "set", "credentials", "alice", "[REDACTED]"])
        );

        let redacted = redacted_args(&s(&["cookies", "set", "session", "abc"]));
        assert_eq!(redacted, s(&["cookies", "set", "session", "[REDACTED]"]));

        let redacted = redacted_args(&s(&[
            "cookies",
            "set",
            "--curl-data",
            "Cookie: sid=secret",
            "--domain",
            "localhost",
        ]));
        assert_eq!(
            redacted,
            s(&[
                "cookies",
                "set",
                "--curl-data",
                "[REDACTED]",
                "--domain",
                "localhost"
            ])
        );
    }

    #[test]
    fn recent_activity_collapses_started_and_finished() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("activity.jsonl");
        let started = ActivityEvent {
            schema_version: 1,
            event_id: "e1".to_string(),
            command_id: "c1".to_string(),
            event: "command_started".to_string(),
            status: "started".to_string(),
            command_root: "open".to_string(),
            command: "open https://example.com".to_string(),
            args: s(&["open", "https://example.com"]),
            started_at: 10,
            updated_at: 10,
            ended_at: None,
            duration_ms: None,
            error: None,
        };
        let mut finished = started.clone();
        finished.event_id = "e2".to_string();
        finished.event = "command_finished".to_string();
        finished.status = "success".to_string();
        finished.updated_at = 12;
        finished.ended_at = Some(12);
        finished.duration_ms = Some(2);
        append_activity_event_to_path(&path, &started).unwrap();
        append_activity_event_to_path(&path, &finished).unwrap();

        let events = read_recent_activity_from_path(&path, 10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, "success");
        assert_eq!(events[0].duration_ms, Some(2));
    }

    #[test]
    fn append_bounds_activity_log() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("activity.jsonl");
        for i in 0..(MAX_ACTIVITY_LOG_LINES + 4) {
            let event = ActivityEvent {
                schema_version: 1,
                event_id: format!("e{i}"),
                command_id: format!("c{i}"),
                event: "command_finished".to_string(),
                status: "success".to_string(),
                command_root: "status".to_string(),
                command: "status".to_string(),
                args: s(&["status"]),
                started_at: i as u64,
                updated_at: i as u64,
                ended_at: Some(i as u64),
                duration_ms: Some(0),
                error: None,
            };
            append_activity_event_to_path(&path, &event).unwrap();
        }
        let lines = fs::read_to_string(path).unwrap().lines().count();
        assert_eq!(lines, MAX_ACTIVITY_LOG_LINES);
    }
}
