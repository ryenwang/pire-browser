use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::protocol::PRODUCT_NAME;

const SESSION_TTL_MS: u64 = 15_000;

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
                < 1_000
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
        return "No live pire-browser Firefox sessions. Open Firefox with the extension enabled."
            .into();
    }

    let mut text = format!("{} live pire-browser session(s):", sessions.len());
    for session in sessions {
        text.push_str(&format!(
            "\n- {} profile={} extension={} heartbeat={} focused={}",
            session.session_id,
            session.profile_id,
            session.extension_version,
            session.last_heartbeat_at,
            session.last_focused_at
        ));
    }
    text
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
        };
        assert!(!session.is_stale(10 + SESSION_TTL_MS));
        assert!(session.is_stale(11 + SESSION_TTL_MS));
    }
}
