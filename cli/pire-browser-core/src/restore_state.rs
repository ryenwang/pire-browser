use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, AeadCore, OsRng};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::session::{data_dir, now_ms};
use crate::state_file::{
    state_encryption_key_from_env, StateEncryptionKey, StateFileEncryptionInfo,
    MAX_STATE_FILE_BYTES, STATE_ENCRYPTION_ALGORITHM, STATE_TOOL,
};

pub const RESTORE_STATE_SCHEMA_VERSION: u8 = 2;
pub const RESTORE_STATE_KIND: &str = "restore-session-state";
pub const ENCRYPTED_RESTORE_STATE_KIND: &str = "encrypted-restore-session-state";
pub const DEFAULT_RESTORE_STATE_EXPIRE_DAYS: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOriginStorage {
    #[serde(default)]
    pub local_storage: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticRestoreState {
    pub schema_version: u8,
    pub tool: String,
    pub kind: String,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub cookies: Vec<Value>,
    #[serde(default)]
    pub origins: BTreeMap<String, RestoreOriginStorage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreStateCounts {
    pub cookies: usize,
    pub origins: usize,
    pub local_storage_keys: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AutomaticRestoreStateRead {
    pub state: AutomaticRestoreState,
    pub bytes: u64,
    pub encryption: StateFileEncryptionInfo,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutomaticRestoreStateWrite {
    pub bytes: u64,
    pub encryption: StateFileEncryptionInfo,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticRestoreStateSummary {
    pub namespace: String,
    pub key: String,
    pub path: PathBuf,
    pub created_at: u64,
    pub updated_at: u64,
    pub counts: RestoreStateCounts,
    pub bytes: u64,
    pub encryption: StateFileEncryptionInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RestoreStateSweepReport {
    pub inspected: usize,
    pub removed: usize,
    pub removed_bytes: u64,
    pub errors: Vec<String>,
    pub expire_days: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct EncryptedAutomaticRestoreState {
    schema_version: u8,
    tool: String,
    kind: String,
    created_at: u64,
    updated_at: u64,
    counts: RestoreStateCounts,
    encryption: RestoreEncryptionMetadata,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct RestoreEncryptionMetadata {
    algorithm: String,
    nonce: String,
    plaintext_sha256: String,
}

impl AutomaticRestoreState {
    pub fn empty(now: u64) -> Self {
        Self {
            schema_version: RESTORE_STATE_SCHEMA_VERSION,
            tool: STATE_TOOL.to_string(),
            kind: RESTORE_STATE_KIND.to_string(),
            created_at: now,
            updated_at: now,
            cookies: Vec::new(),
            origins: BTreeMap::new(),
        }
    }

    pub fn counts(&self) -> RestoreStateCounts {
        RestoreStateCounts {
            cookies: self.cookies.len(),
            origins: self.origins.len(),
            local_storage_keys: self
                .origins
                .values()
                .map(|storage| storage.local_storage.len())
                .sum(),
        }
    }

    pub fn validate(&self) -> Result<()> {
        if self.schema_version != RESTORE_STATE_SCHEMA_VERSION {
            bail!(
                "invalid_args: unsupported restore state schemaVersion {}; expected {}",
                self.schema_version,
                RESTORE_STATE_SCHEMA_VERSION
            );
        }
        if self.tool != STATE_TOOL || self.kind != RESTORE_STATE_KIND {
            bail!("invalid_args: file is not a pire-browser automatic restore state");
        }
        if self.created_at == 0 || self.updated_at < self.created_at {
            bail!("invalid_args: automatic restore state timestamps are invalid");
        }
        for origin in self.origins.keys() {
            if !(origin.starts_with("http://") || origin.starts_with("https://")) {
                bail!("invalid_args: restore state origin is not http(s): {origin}");
            }
        }
        Ok(())
    }
}

pub fn restore_states_root() -> Result<PathBuf> {
    Ok(data_dir()?.join("restore-sessions"))
}

pub fn automatic_restore_state_path(namespace: &str, key: &str) -> Result<PathBuf> {
    validate_restore_key("namespace", namespace)?;
    validate_restore_key("restore key", key)?;
    Ok(restore_states_root()?
        .join(namespace)
        .join(format!("{key}.json")))
}

pub fn validate_restore_key(label: &str, value: &str) -> Result<()> {
    if value.is_empty()
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))
    {
        bail!("invalid_args: {label} may contain only letters, numbers, `_`, and `-`");
    }
    Ok(())
}

pub fn read_automatic_restore_state(path: &Path) -> Result<AutomaticRestoreStateRead> {
    let metadata = fs::metadata(path).with_context(|| {
        format!(
            "invalid_args: failed to read restore state {}",
            path.display()
        )
    })?;
    if !metadata.is_file() {
        bail!(
            "invalid_args: restore state path is not a file: {}",
            path.display()
        );
    }
    if metadata.len() > MAX_STATE_FILE_BYTES {
        bail!("invalid_args: restore state exceeds the 50 MiB safety limit");
    }
    let raw = fs::read(path).with_context(|| {
        format!(
            "invalid_args: failed to read restore state {}",
            path.display()
        )
    })?;
    let value: Value =
        serde_json::from_slice(&raw).context("invalid_args: failed to parse restore state JSON")?;
    if value.get("kind").and_then(Value::as_str) == Some(ENCRYPTED_RESTORE_STATE_KIND) {
        let envelope: EncryptedAutomaticRestoreState = serde_json::from_value(value)
            .context("invalid_args: invalid encrypted restore state envelope")?;
        let state =
            decrypt_restore_state(path, &envelope, state_encryption_key_from_env()?.as_ref())?;
        return Ok(AutomaticRestoreStateRead {
            state,
            bytes: raw.len() as u64,
            encryption: StateFileEncryptionInfo::encrypted(STATE_ENCRYPTION_ALGORITHM),
        });
    }
    let state: AutomaticRestoreState =
        serde_json::from_value(value).context("invalid_args: invalid automatic restore state")?;
    state.validate()?;
    Ok(AutomaticRestoreStateRead {
        state,
        bytes: raw.len() as u64,
        encryption: StateFileEncryptionInfo::plaintext(),
    })
}

pub fn is_automatic_restore_state_file(path: &Path) -> Result<bool> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("invalid_args: failed to read state file {}", path.display()))?;
    if !metadata.is_file() || metadata.len() > MAX_STATE_FILE_BYTES {
        return Ok(false);
    }
    let raw = fs::read(path)
        .with_context(|| format!("invalid_args: failed to read state file {}", path.display()))?;
    let value: Value = match serde_json::from_slice(&raw) {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };
    Ok(matches!(
        value.get("kind").and_then(Value::as_str),
        Some(RESTORE_STATE_KIND | ENCRYPTED_RESTORE_STATE_KIND)
    ))
}

pub fn write_automatic_restore_state(
    path: &Path,
    state: &AutomaticRestoreState,
) -> Result<AutomaticRestoreStateWrite> {
    let mut state = state.clone();
    let now = now_ms();
    if state.created_at == 0 {
        state.created_at = now;
    }
    state.updated_at = now.max(state.created_at);
    state.validate()?;
    let plaintext = serde_json::to_vec_pretty(&state)?;
    let (body, encryption) = if let Some(key) = state_encryption_key_from_env()? {
        (
            serde_json::to_vec_pretty(&encrypt_restore_state(&state, &plaintext, &key)?)?,
            StateFileEncryptionInfo::encrypted(STATE_ENCRYPTION_ALGORITHM),
        )
    } else {
        (plaintext, StateFileEncryptionInfo::plaintext())
    };
    atomic_write(path, &body)?;
    Ok(AutomaticRestoreStateWrite {
        bytes: body.len() as u64,
        encryption,
    })
}

pub fn restore_state_expire_days_from_env() -> Result<u64> {
    for name in [
        "PIRE_BROWSER_STATE_EXPIRE_DAYS",
        "AGENT_BROWSER_STATE_EXPIRE_DAYS",
    ] {
        if let Ok(value) = std::env::var(name) {
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            return value
                .parse::<u64>()
                .with_context(|| format!("invalid_args: {name} must be a non-negative integer"));
        }
    }
    Ok(DEFAULT_RESTORE_STATE_EXPIRE_DAYS)
}

pub fn list_automatic_restore_states() -> Result<Vec<AutomaticRestoreStateSummary>> {
    let root = restore_states_root()?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut summaries = Vec::new();
    for namespace in fs::read_dir(&root)
        .with_context(|| format!("failed to read {}", root.display()))?
        .flatten()
    {
        let namespace_path = namespace.path();
        let metadata = match fs::symlink_metadata(&namespace_path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let namespace_name = namespace.file_name().to_string_lossy().to_string();
        if validate_restore_key("namespace", &namespace_name).is_err() {
            continue;
        }
        for entry in fs::read_dir(&namespace_path)
            .with_context(|| format!("failed to read {}", namespace_path.display()))?
            .flatten()
        {
            let path = entry.path();
            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };
            if metadata.file_type().is_symlink()
                || !metadata.is_file()
                || path.extension().and_then(|value| value.to_str()) != Some("json")
            {
                continue;
            }
            let Some(key) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            if validate_restore_key("restore key", key).is_err() {
                continue;
            }
            let read = read_automatic_restore_state(&path)?;
            summaries.push(AutomaticRestoreStateSummary {
                namespace: namespace_name.clone(),
                key: key.to_string(),
                path,
                created_at: read.state.created_at,
                updated_at: read.state.updated_at,
                counts: read.state.counts(),
                bytes: read.bytes,
                encryption: read.encryption,
            });
        }
    }
    summaries.sort_by(|left, right| {
        left.namespace
            .cmp(&right.namespace)
            .then_with(|| left.key.cmp(&right.key))
    });
    Ok(summaries)
}

pub fn clean_expired_restore_states(now: u64) -> RestoreStateSweepReport {
    let expire_days =
        restore_state_expire_days_from_env().unwrap_or(DEFAULT_RESTORE_STATE_EXPIRE_DAYS);
    let mut report = RestoreStateSweepReport {
        expire_days,
        ..RestoreStateSweepReport::default()
    };
    if expire_days == 0 {
        return report;
    }
    let Ok(root) = restore_states_root() else {
        report
            .errors
            .push("failed to resolve restore state root".to_string());
        return report;
    };
    if !root.exists() {
        return report;
    }
    sweep_restore_dir(&root, now, expire_days, &mut report);
    report
}

fn sweep_restore_dir(
    root: &Path,
    now: u64,
    expire_days: u64,
    report: &mut RestoreStateSweepReport,
) {
    let Ok(entries) = fs::read_dir(root) else {
        report
            .errors
            .push(format!("failed to read {}", root.display()));
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            sweep_restore_dir(&path, now, expire_days, report);
            let _ = fs::remove_dir(&path);
            continue;
        }
        if !metadata.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json")
        {
            continue;
        }
        report.inspected += 1;
        match read_automatic_restore_state(&path) {
            Ok(read) if restore_state_is_expired(read.state.updated_at, now, expire_days) => {
                match fs::remove_file(&path) {
                    Ok(()) => {
                        report.removed += 1;
                        report.removed_bytes += metadata.len();
                    }
                    Err(err) => report
                        .errors
                        .push(format!("failed to remove {}: {err}", path.display())),
                }
            }
            Ok(_) => {}
            Err(err) => report
                .errors
                .push(format!("failed to inspect {}: {err:#}", path.display())),
        }
    }
}

fn restore_state_is_expired(updated_at: u64, now: u64, expire_days: u64) -> bool {
    if expire_days == 0 {
        return false;
    }
    let cutoff = now.saturating_sub(expire_days.saturating_mul(24 * 60 * 60 * 1000));
    updated_at < cutoff
}

fn encrypt_restore_state(
    state: &AutomaticRestoreState,
    plaintext: &[u8],
    key: &StateEncryptionKey,
) -> Result<EncryptedAutomaticRestoreState> {
    let cipher = Aes256Gcm::new_from_slice(key.as_bytes())
        .context("invalid_args: failed to initialize restore state encryption key")?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| anyhow!("failed to encrypt restore state"))?;
    Ok(EncryptedAutomaticRestoreState {
        schema_version: RESTORE_STATE_SCHEMA_VERSION,
        tool: STATE_TOOL.to_string(),
        kind: ENCRYPTED_RESTORE_STATE_KIND.to_string(),
        created_at: state.created_at,
        updated_at: state.updated_at,
        counts: state.counts(),
        encryption: RestoreEncryptionMetadata {
            algorithm: STATE_ENCRYPTION_ALGORITHM.to_string(),
            nonce: base64::engine::general_purpose::STANDARD.encode(nonce),
            plaintext_sha256: sha256_hex(plaintext),
        },
        ciphertext: base64::engine::general_purpose::STANDARD.encode(ciphertext),
    })
}

fn decrypt_restore_state(
    path: &Path,
    envelope: &EncryptedAutomaticRestoreState,
    key: Option<&StateEncryptionKey>,
) -> Result<AutomaticRestoreState> {
    if envelope.schema_version != RESTORE_STATE_SCHEMA_VERSION
        || envelope.tool != STATE_TOOL
        || envelope.kind != ENCRYPTED_RESTORE_STATE_KIND
        || envelope.encryption.algorithm != STATE_ENCRYPTION_ALGORITHM
    {
        bail!("invalid_args: unsupported encrypted restore state envelope");
    }
    let key = key.with_context(|| {
        format!(
            "invalid_args: encrypted restore state {} requires PIRE_BROWSER_ENCRYPTION_KEY or AGENT_BROWSER_ENCRYPTION_KEY",
            path.display()
        )
    })?;
    let nonce = base64::engine::general_purpose::STANDARD
        .decode(&envelope.encryption.nonce)
        .context("invalid_args: restore state nonce is invalid base64")?;
    if nonce.len() != 12 {
        bail!("invalid_args: restore state nonce must be 12 bytes");
    }
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&envelope.ciphertext)
        .context("invalid_args: restore state ciphertext is invalid base64")?;
    let cipher = Aes256Gcm::new_from_slice(key.as_bytes())
        .context("invalid_args: failed to initialize restore state encryption key")?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| {
            anyhow!("invalid_args: failed to decrypt restore state; check the encryption key")
        })?;
    if sha256_hex(&plaintext) != envelope.encryption.plaintext_sha256 {
        bail!("invalid_args: restore state plaintext checksum did not match");
    }
    let state: AutomaticRestoreState = serde_json::from_slice(&plaintext)
        .context("invalid_args: decrypted restore state is invalid JSON")?;
    state.validate()?;
    if state.created_at != envelope.created_at
        || state.updated_at != envelope.updated_at
        || state.counts() != envelope.counts
    {
        bail!("invalid_args: encrypted restore state metadata did not match plaintext");
    }
    Ok(state)
}

fn atomic_write(path: &Path, body: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
            restrict_restore_dir_best_effort(parent);
        }
    }
    let temp = path.with_extension(format!("json.{}.tmp", Uuid::new_v4()));
    fs::write(&temp, body).with_context(|| format!("failed to write {}", temp.display()))?;
    replace_file(&temp, path).with_context(|| format!("failed to publish {}", path.display()))?;
    restrict_restore_file_best_effort(path);
    Ok(())
}

#[cfg(unix)]
fn restrict_restore_dir_best_effort(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn restrict_restore_dir_best_effort(_path: &Path) {}

#[cfg(unix)]
fn restrict_restore_file_best_effort(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_restore_file_best_effort(_path: &Path) {}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state_file::parse_state_encryption_key;
    use tempfile::tempdir;

    #[test]
    fn plaintext_restore_state_roundtrips() {
        let root = tempdir().unwrap();
        let path = root.path().join("state.json");
        let mut state = AutomaticRestoreState::empty(10);
        state.origins.insert(
            "https://example.com".to_string(),
            RestoreOriginStorage {
                local_storage: BTreeMap::from([("token".to_string(), "secret".to_string())]),
            },
        );
        write_automatic_restore_state(&path, &state).unwrap();
        let read = read_automatic_restore_state(&path).unwrap();
        assert_eq!(read.state.origins, state.origins);
        assert!(!read.encryption.encrypted);
    }

    #[test]
    fn restore_keys_reject_path_traversal() {
        assert!(validate_restore_key("restore key", "../escape").is_err());
        assert!(validate_restore_key("restore key", "work_1-a").is_ok());
    }

    #[test]
    fn encrypted_multi_origin_restore_state_roundtrips() {
        let path = Path::new("restore.json");
        let mut state = AutomaticRestoreState::empty(10);
        state.cookies = vec![
            serde_json::json!({ "name": "a" }),
            serde_json::json!({ "name": "b" }),
        ];
        state.origins.insert(
            "https://one.example".to_string(),
            RestoreOriginStorage {
                local_storage: BTreeMap::from([
                    ("token".to_string(), "one".to_string()),
                    ("theme".to_string(), "dark".to_string()),
                ]),
            },
        );
        state.origins.insert(
            "https://two.example".to_string(),
            RestoreOriginStorage {
                local_storage: BTreeMap::from([("token".to_string(), "two".to_string())]),
            },
        );
        let plaintext = serde_json::to_vec_pretty(&state).unwrap();
        let key = parse_state_encryption_key(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        )
        .unwrap();
        let wrong_key = parse_state_encryption_key(
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        )
        .unwrap();
        let envelope = encrypt_restore_state(&state, &plaintext, &key).unwrap();

        assert_eq!(envelope.counts.cookies, 2);
        assert_eq!(envelope.counts.origins, 2);
        assert_eq!(envelope.counts.local_storage_keys, 3);
        assert_eq!(
            decrypt_restore_state(path, &envelope, Some(&key)).unwrap(),
            state
        );
        assert!(decrypt_restore_state(path, &envelope, Some(&wrong_key)).is_err());
    }

    #[test]
    fn restore_state_expiration_uses_strict_age_and_zero_disables_it() {
        const DAY: u64 = 24 * 60 * 60 * 1000;
        let now = 40 * DAY;
        assert!(restore_state_is_expired(9 * DAY, now, 30));
        assert!(!restore_state_is_expired(10 * DAY, now, 30));
        assert!(!restore_state_is_expired(0, now, 0));
    }

    #[cfg(unix)]
    #[test]
    fn restore_state_atomic_write_restricts_directory_and_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let root = tempdir().unwrap();
        let path = root.path().join("private").join("state.json");
        atomic_write(&path, b"{}").unwrap();

        assert_eq!(
            fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
