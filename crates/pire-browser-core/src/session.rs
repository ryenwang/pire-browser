use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::protocol::PRODUCT_NAME;

const SESSION_TTL_MS: u64 = 15_000;
const DEFAULT_SESSION_AMBIGUITY_WINDOW_MS: u64 = 1_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActivePageInfo {
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    pub tab_id: u64,
    pub window_id: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub profile_id: String,
    pub pipe_name: String,
    pub extension_id: String,
    pub extension_version: String,
    pub started_at: u64,
    pub last_heartbeat_at: u64,
    pub last_focused_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_page: Option<ActivePageInfo>,
}

impl SessionInfo {
    pub fn is_stale(&self, now_ms: u64) -> bool {
        now_ms.saturating_sub(self.last_heartbeat_at) > SESSION_TTL_MS
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_millis() as u64
}

pub fn data_dir() -> Result<PathBuf> {
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        return Ok(PathBuf::from(local).join(PRODUCT_NAME));
    }
    bail!("LOCALAPPDATA is not set; Windows local app data is required")
}

pub fn sessions_dir() -> Result<PathBuf> {
    Ok(data_dir()?.join("sessions"))
}

pub fn session_file_path(session_id: &str) -> Result<PathBuf> {
    Ok(sessions_dir()?.join(format!("{session_id}.json")))
}

pub fn ensure_runtime_dirs() -> Result<()> {
    fs::create_dir_all(sessions_dir()?).context("failed to create sessions directory")?;
    fs::create_dir_all(data_dir()?.join("native-messaging"))
        .context("failed to create native-messaging directory")?;
    Ok(())
}

pub fn write_session_atomic(session: &SessionInfo) -> Result<()> {
    ensure_runtime_dirs()?;
    let final_path = session_file_path(&session.session_id)?;
    let tmp_path = final_path.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(session)?;
    fs::write(&tmp_path, body)
        .with_context(|| format!("failed to write {}", tmp_path.display()))?;
    fs::rename(&tmp_path, &final_path)
        .with_context(|| format!("failed to publish {}", final_path.display()))?;
    Ok(())
}

pub fn remove_session(session_id: &str) -> Result<()> {
    let path = session_file_path(session_id)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn list_sessions() -> Result<Vec<SessionInfo>> {
    let dir = sessions_dir()?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut sessions = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|v| v.to_str()) != Some("json") {
            continue;
        }
        match fs::read_to_string(&path)
            .ok()
            .and_then(|body| serde_json::from_str::<SessionInfo>(&body).ok())
        {
            Some(session) => sessions.push(session),
            None => {
                let _ = fs::remove_file(path);
            }
        }
    }
    sessions.sort_by_key(|s| std::cmp::Reverse(s.last_focused_at));
    Ok(sessions)
}

pub fn cleanup_stale_sessions(now: u64) -> Result<()> {
    for session in list_sessions()? {
        if session.is_stale(now) {
            let _ = remove_session(&session.session_id);
        }
    }
    Ok(())
}

pub fn select_session(session_id: Option<&str>) -> Result<SessionInfo> {
    let now = now_ms();
    cleanup_stale_sessions(now)?;
    let sessions: Vec<_> = list_sessions()?
        .into_iter()
        .filter(|session| !session.is_stale(now))
        .collect();

    if let Some(session_id) = session_id {
        return sessions
            .into_iter()
            .find(|session| session.session_id == session_id)
            .with_context(|| format!("no live pire-browser session found for {session_id}"));
    }

    match sessions.as_slice() {
        [] => bail!("extension_disconnected: no live Firefox extension session found"),
        [only] => Ok(only.clone()),
        many => {
            let newest = &many[0];
            let second = &many[1];
            if newest
                .last_focused_at
                .saturating_sub(second.last_focused_at)
                < DEFAULT_SESSION_AMBIGUITY_WINDOW_MS
            {
                bail!(
                    "multiple_sessions: choose one with --session <id>; candidates: {}",
                    many.iter()
                        .map(|s| format!("{} ({})", s.session_id, s.profile_id))
                        .collect::<Vec<_>>()
                        .join(", ")
                );
            }
            Ok(newest.clone())
        }
    }
}

pub fn session_status_text(sessions: &[SessionInfo]) -> String {
    if sessions.is_empty() {
        return "No live pire-browser Firefox sessions. Run `pire-browser open <url>` to auto-launch the default profile or `pire-browser launch` to start Firefox."
            .into();
    }

    let mut text = format!("{} live pire-browser session(s):", sessions.len());
    let (default_session_id, ambiguous_default) = default_session_target(sessions);
    if ambiguous_default {
        text.push_str(
            "\nDefault target: ambiguous; use `--session <id>` with one of the sessions below.",
        );
    } else if let Some(default_session_id) = default_session_id {
        text.push_str(&format!("\nDefault target: {default_session_id}"));
    }
    for session in sessions {
        text.push_str(&format!(
            "\n- {} profile={} extension={} heartbeat={} focused={}",
            session.session_id,
            session.profile_id,
            session.extension_version,
            session.last_heartbeat_at,
            session.last_focused_at
        ));
        if let Some(active_page) = &session.active_page {
            text.push_str(&format!("\n  active: {}", active_page_text(active_page)));
        }
    }
    text
}

pub fn session_status_value(sessions: &[SessionInfo]) -> Value {
    let (default_session_id, ambiguous_default) = default_session_target(sessions);
    json!({
        "liveSessions": sessions,
        "defaultSessionId": default_session_id,
        "ambiguousDefault": ambiguous_default
    })
}

pub fn default_session_target(sessions: &[SessionInfo]) -> (Option<String>, bool) {
    match sessions {
        [] => (None, false),
        [only] => (Some(only.session_id.clone()), false),
        many => {
            let newest = &many[0];
            let second = &many[1];
            if newest
                .last_focused_at
                .saturating_sub(second.last_focused_at)
                < DEFAULT_SESSION_AMBIGUITY_WINDOW_MS
            {
                (None, true)
            } else {
                (Some(newest.session_id.clone()), false)
            }
        }
    }
}

fn active_page_text(active_page: &ActivePageInfo) -> String {
    let label = active_page
        .label
        .as_ref()
        .map(|label| format!(" ({label})"))
        .unwrap_or_default();
    let title_or_url = active_page
        .title
        .as_deref()
        .filter(|value| !value.is_empty())
        .or_else(|| active_page.url.as_deref())
        .unwrap_or("");
    let title = if title_or_url.is_empty() {
        String::new()
    } else {
        format!(" {title_or_url}")
    };
    let url = active_page
        .url
        .as_ref()
        .filter(|url| title_or_url != url.as_str())
        .map(|url| format!(" - {url}"))
        .unwrap_or_default();
    format!("{}{}{}{}", active_page.agent_id, label, title, url)
}

pub fn read_session_file(path: &Path) -> Result<SessionInfo> {
    let body = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&body)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_sessions_use_heartbeat() {
        let session = SessionInfo {
            session_id: "s1".into(),
            profile_id: "p1".into(),
            pipe_name: "pipe".into(),
            extension_id: "ext".into(),
            extension_version: "0".into(),
            started_at: 1,
            last_heartbeat_at: 10,
            last_focused_at: 10,
            active_page: None,
        };
        assert!(!session.is_stale(10 + SESSION_TTL_MS));
        assert!(session.is_stale(11 + SESSION_TTL_MS));
    }

    #[test]
    fn status_text_names_default_target_and_active_page() {
        let sessions = vec![SessionInfo {
            session_id: "s1".into(),
            profile_id: "p1".into(),
            pipe_name: "pipe".into(),
            extension_id: "ext".into(),
            extension_version: "1".into(),
            started_at: 1,
            last_heartbeat_at: 20,
            last_focused_at: 20,
            active_page: Some(ActivePageInfo {
                agent_id: "t1".into(),
                label: Some("docs".into()),
                title: Some("Docs".into()),
                url: Some("https://example.com".into()),
                tab_id: 10,
                window_id: 1,
                updated_at: 20,
            }),
        }];
        let text = session_status_text(&sessions);
        assert!(text.contains("Default target: s1"));
        assert!(text.contains("active: t1 (docs) Docs - https://example.com"));

        let value = session_status_value(&sessions);
        assert_eq!(value["defaultSessionId"], "s1");
        assert_eq!(value["ambiguousDefault"], false);
        assert_eq!(value["liveSessions"][0]["activePage"]["agentId"], "t1");
    }

    #[test]
    fn status_value_reports_ambiguous_default() {
        let sessions = vec![
            SessionInfo {
                session_id: "s1".into(),
                profile_id: "p1".into(),
                pipe_name: "pipe".into(),
                extension_id: "ext".into(),
                extension_version: "1".into(),
                started_at: 1,
                last_heartbeat_at: 20,
                last_focused_at: 20,
                active_page: None,
            },
            SessionInfo {
                session_id: "s2".into(),
                profile_id: "p2".into(),
                pipe_name: "pipe2".into(),
                extension_id: "ext".into(),
                extension_version: "1".into(),
                started_at: 1,
                last_heartbeat_at: 19,
                last_focused_at: 19,
                active_page: None,
            },
        ];
        let value = session_status_value(&sessions);
        assert!(value["defaultSessionId"].is_null());
        assert_eq!(value["ambiguousDefault"], true);
        assert!(session_status_text(&sessions).contains("use `--session <id>`"));
    }
}
