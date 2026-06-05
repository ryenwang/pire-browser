use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::Serialize;

use crate::launch::{managed_profile_dir_from_data_dir, DEFAULT_PROFILE_NAME};
use crate::session::data_dir;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthHandoffInfo {
    pub supported: bool,
    pub mode: String,
    pub profile_name: String,
    pub profile_exists: bool,
    pub profile_path: PathBuf,
    pub login_state: String,
    pub secrets_inspected: bool,
    pub guidance: String,
}

pub fn collect_default_auth_handoff() -> Result<AuthHandoffInfo> {
    Ok(auth_handoff_from_data_dir(
        &data_dir()?,
        DEFAULT_PROFILE_NAME,
    ))
}

pub fn auth_handoff_from_data_dir(root: &Path, profile_name: &str) -> AuthHandoffInfo {
    let profile_path = managed_profile_dir_from_data_dir(root, profile_name);
    let profile_exists = profile_path.exists();
    AuthHandoffInfo {
        supported: true,
        mode: "persistent_firefox_profile".to_string(),
        profile_name: profile_name.to_string(),
        profile_exists,
        profile_path,
        login_state: "not_inspected".to_string(),
        secrets_inspected: false,
        guidance: guidance_text(profile_name, profile_exists),
    }
}

pub fn auth_handoff_text(info: &AuthHandoffInfo) -> String {
    let profile_status = if info.profile_exists {
        "available"
    } else {
        "not created yet"
    };
    format!(
        "Auth handoff: profile {} is {profile_status}; Firefox can reuse login state from {}. Login state is not inspected, and cookies/passwords/tokens are not read by pire-browser.",
        info.profile_name,
        info.profile_path.display()
    )
}

fn guidance_text(profile_name: &str, profile_exists: bool) -> String {
    let launch = if profile_exists { "Use" } else { "Run" };
    format!(
        "{launch} `pire-browser launch --url <login-url>`, sign in manually in Firefox, then reuse the {profile_name} profile. pire-browser does not inspect cookies, saved passwords, or token values."
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn reports_missing_default_profile_without_inspecting_secrets() {
        let root = tempdir().unwrap();
        let info = auth_handoff_from_data_dir(root.path(), DEFAULT_PROFILE_NAME);

        assert!(info.supported);
        assert_eq!(info.mode, "persistent_firefox_profile");
        assert_eq!(info.profile_name, "Default");
        assert!(!info.profile_exists);
        assert_eq!(info.login_state, "not_inspected");
        assert!(!info.secrets_inspected);
        assert!(info.guidance.contains("launch --url <login-url>"));
    }

    #[test]
    fn reports_existing_default_profile_as_available() {
        let root = tempdir().unwrap();
        let profile_path = managed_profile_dir_from_data_dir(root.path(), DEFAULT_PROFILE_NAME);
        std::fs::create_dir_all(&profile_path).unwrap();

        let info = auth_handoff_from_data_dir(root.path(), DEFAULT_PROFILE_NAME);

        assert!(info.profile_exists);
        assert_eq!(info.profile_path, profile_path);
        assert!(auth_handoff_text(&info).contains("not inspected"));
    }
}
