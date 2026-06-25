use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, AeadCore, OsRng};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::session::{data_dir, now_ms};

pub const MAX_STATE_FILE_BYTES: u64 = 50 * 1024 * 1024;
pub const STATE_SCHEMA_VERSION: u8 = 1;
pub const STATE_TOOL: &str = "pire-browser";
pub const STATE_KIND: &str = "active-origin-state";
pub const ENCRYPTED_STATE_KIND: &str = "encrypted-active-origin-state";
pub const STATE_ENCRYPTION_ALGORITHM: &str = "AES-256-GCM";
pub const PIRE_STATE_ENCRYPTION_KEY_ENV: &str = "PIRE_BROWSER_ENCRYPTION_KEY";
pub const AGENT_BROWSER_STATE_ENCRYPTION_KEY_ENV: &str = "AGENT_BROWSER_ENCRYPTION_KEY";
pub const STATE_RECEIPT_SCHEMA_VERSION: u8 = 1;
pub const STATE_RECEIPT_KIND: &str = "state-inspection-receipt";
pub const STATE_RECEIPT_TTL_MS: u64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, PartialEq)]
pub struct ActiveOriginStateFileRead {
    pub state: ActiveOriginStateFile,
    pub bytes: u64,
    pub sha256: String,
    pub canonical_path: String,
    pub encryption: StateFileEncryptionInfo,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveOriginStateFileWrite {
    pub bytes: u64,
    pub encryption: StateFileEncryptionInfo,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveOriginStateFileSummary {
    pub schema_version: u8,
    pub kind: String,
    pub created_at: u64,
    pub source: ActiveOriginStateSource,
    pub counts: StateFileCounts,
    pub bytes: u64,
    pub encryption: StateFileEncryptionInfo,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StateFileEncryptionInfo {
    pub encrypted: bool,
    pub algorithm: Option<String>,
}

impl StateFileEncryptionInfo {
    pub fn plaintext() -> Self {
        Self {
            encrypted: false,
            algorithm: None,
        }
    }

    pub fn encrypted(algorithm: impl Into<String>) -> Self {
        Self {
            encrypted: true,
            algorithm: Some(algorithm.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StateFileCounts {
    pub cookies: usize,
    pub local_storage_keys: usize,
    pub session_storage_keys: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StateReceiptValidation {
    pub receipt: StateInspectionReceipt,
    pub tool_version_mismatch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveOriginStateFile {
    pub schema_version: u8,
    pub tool: String,
    pub kind: String,
    pub created_at: u64,
    pub source: ActiveOriginStateSource,
    #[serde(default)]
    pub cookies: Vec<Value>,
    #[serde(default)]
    pub local_storage: BTreeMap<String, String>,
    #[serde(default)]
    pub session_storage: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveOriginStateSource {
    pub url: String,
    pub origin: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct EncryptedActiveOriginStateFile {
    schema_version: u8,
    tool: String,
    kind: String,
    created_at: u64,
    source: ActiveOriginStateSource,
    counts: StateFileCounts,
    encryption: EncryptedStateMetadata,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct EncryptedStateMetadata {
    algorithm: String,
    nonce: String,
    plaintext_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StateEncryptionKey {
    bytes: [u8; 32],
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StateInspectionReceipt {
    pub schema_version: u8,
    pub tool: String,
    pub kind: String,
    pub inspected_at: u64,
    pub expires_at: u64,
    pub canonical_path: String,
    pub state_file_sha256: String,
    pub bytes: u64,
    pub state_schema_version: u8,
    pub state_kind: String,
    pub origin: String,
    pub display_url: String,
    pub tool_version: String,
}

impl ActiveOriginStateFile {
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != STATE_SCHEMA_VERSION {
            bail!(
                "invalid_args: unsupported state file schemaVersion {}; expected {}",
                self.schema_version,
                STATE_SCHEMA_VERSION
            );
        }
        if self.tool != STATE_TOOL {
            bail!("invalid_args: state file tool must be `{STATE_TOOL}`");
        }
        if self.kind != STATE_KIND {
            bail!("invalid_args: state file kind must be `{STATE_KIND}`");
        }
        validate_http_url(&self.source.url)?;
        validate_origin(&self.source.origin)?;
        if origin_from_http_url(&self.source.url).as_deref() != Some(self.source.origin.as_str()) {
            bail!("invalid_args: state file source.origin must match source.url");
        }
        Ok(())
    }

    pub fn cookie_count(&self) -> usize {
        self.cookies.len()
    }

    pub fn local_storage_key_count(&self) -> usize {
        self.local_storage.len()
    }

    pub fn session_storage_key_count(&self) -> usize {
        self.session_storage.len()
    }

    pub fn counts(&self) -> StateFileCounts {
        StateFileCounts {
            cookies: self.cookie_count(),
            local_storage_keys: self.local_storage_key_count(),
            session_storage_keys: self.session_storage_key_count(),
        }
    }
}

pub fn state_from_extension_export(
    export: Value,
    session_id: String,
    profile_name: Option<String>,
) -> Result<ActiveOriginStateFile> {
    let source_value = export
        .get("source")
        .cloned()
        .context("state export omitted source")?;
    let mut source: ActiveOriginStateSource =
        serde_json::from_value(source_value).context("state export source was invalid")?;
    source.url = display_url_without_query_or_fragment(&source.url);
    source.session_id = Some(session_id);
    source.profile_name = profile_name;

    let cookies = export
        .get("cookies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let local_storage = string_map_from_value(export.get("localStorage"))
        .context("state export localStorage was invalid")?;
    let session_storage = string_map_from_value(export.get("sessionStorage"))
        .context("state export sessionStorage was invalid")?;

    let state = ActiveOriginStateFile {
        schema_version: STATE_SCHEMA_VERSION,
        tool: STATE_TOOL.to_string(),
        kind: STATE_KIND.to_string(),
        created_at: now_ms(),
        source,
        cookies,
        local_storage,
        session_storage,
    };
    state.validate()?;
    Ok(state)
}

pub fn read_state_file(path: &Path) -> Result<ActiveOriginStateFile> {
    Ok(read_state_file_with_metadata(path)?.state)
}

pub fn read_state_file_with_metadata(path: &Path) -> Result<ActiveOriginStateFileRead> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("invalid_args: failed to read state file {}", path.display()))?;
    if !metadata.is_file() {
        bail!(
            "invalid_args: state file path is not a file: {}",
            path.display()
        );
    }
    let canonical_path = canonical_state_path(path)?;
    let raw = fs::read(path)
        .with_context(|| format!("invalid_args: failed to read state file {}", path.display()))?;
    read_state_file_from_bytes(path, canonical_path, raw)
}

pub fn read_state_file_from_bytes(
    path: &Path,
    canonical_path: String,
    raw: Vec<u8>,
) -> Result<ActiveOriginStateFileRead> {
    read_state_file_from_bytes_with_key(path, canonical_path, raw, state_encryption_key_from_env()?)
}

pub fn read_state_file_from_bytes_with_key(
    path: &Path,
    canonical_path: String,
    raw: Vec<u8>,
    encryption_key: Option<StateEncryptionKey>,
) -> Result<ActiveOriginStateFileRead> {
    let bytes = raw.len() as u64;
    if bytes > MAX_STATE_FILE_BYTES {
        bail!(
            "invalid_args: state file is too large ({} bytes); maximum supported size is {} bytes",
            bytes,
            MAX_STATE_FILE_BYTES
        );
    }
    let sha256 = sha256_hex(&raw);
    let body = String::from_utf8(raw).with_context(|| {
        format!(
            "invalid_args: state file is not valid UTF-8: {}",
            path.display()
        )
    })?;
    if state_file_json_kind(&body).as_deref() == Some(ENCRYPTED_STATE_KIND) {
        let encrypted: EncryptedActiveOriginStateFile = serde_json::from_str(&body)
            .context("invalid_args: failed to parse encrypted state file JSON")?;
        let state = decrypt_state_file(path, &encrypted, encryption_key.as_ref())?;
        return Ok(ActiveOriginStateFileRead {
            state,
            bytes,
            sha256,
            canonical_path,
            encryption: StateFileEncryptionInfo::encrypted(STATE_ENCRYPTION_ALGORITHM),
        });
    }
    let mut state: ActiveOriginStateFile =
        serde_json::from_str(&body).context("invalid_args: failed to parse state file JSON")?;
    state.source.url = display_url_without_query_or_fragment(&state.source.url);
    state.validate()?;
    Ok(ActiveOriginStateFileRead {
        state,
        bytes,
        sha256,
        canonical_path,
        encryption: StateFileEncryptionInfo::plaintext(),
    })
}

pub fn write_state_file(
    path: &Path,
    state: &ActiveOriginStateFile,
) -> Result<ActiveOriginStateFileWrite> {
    write_state_file_with_key(path, state, state_encryption_key_from_env()?)
}

pub fn write_state_file_with_key(
    path: &Path,
    state: &ActiveOriginStateFile,
    encryption_key: Option<StateEncryptionKey>,
) -> Result<ActiveOriginStateFileWrite> {
    let mut state = state.clone();
    state.source.url = display_url_without_query_or_fragment(&state.source.url);
    state.validate()?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
    }
    let body = serde_json::to_vec_pretty(&state)?;
    let (body, encryption) = if let Some(key) = encryption_key {
        let encrypted = encrypt_state_file(&state, &body, &key)?;
        (
            serde_json::to_vec_pretty(&encrypted)?,
            StateFileEncryptionInfo::encrypted(STATE_ENCRYPTION_ALGORITHM),
        )
    } else {
        (body, StateFileEncryptionInfo::plaintext())
    };
    fs::write(path, &body).with_context(|| format!("failed to write {}", path.display()))?;
    Ok(ActiveOriginStateFileWrite {
        bytes: body.len() as u64,
        encryption,
    })
}

pub fn read_state_file_summary(path: &Path) -> Result<ActiveOriginStateFileSummary> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("invalid_args: failed to read state file {}", path.display()))?;
    if !metadata.is_file() {
        bail!(
            "invalid_args: state file path is not a file: {}",
            path.display()
        );
    }
    let raw = fs::read(path)
        .with_context(|| format!("invalid_args: failed to read state file {}", path.display()))?;
    read_state_file_summary_from_bytes(path, raw)
}

pub fn read_state_file_summary_from_bytes(
    path: &Path,
    raw: Vec<u8>,
) -> Result<ActiveOriginStateFileSummary> {
    let bytes = raw.len() as u64;
    if bytes > MAX_STATE_FILE_BYTES {
        bail!(
            "invalid_args: state file is too large ({} bytes); maximum supported size is {} bytes",
            bytes,
            MAX_STATE_FILE_BYTES
        );
    }
    let body = String::from_utf8(raw).with_context(|| {
        format!(
            "invalid_args: state file is not valid UTF-8: {}",
            path.display()
        )
    })?;
    if state_file_json_kind(&body).as_deref() == Some(ENCRYPTED_STATE_KIND) {
        let mut encrypted: EncryptedActiveOriginStateFile = serde_json::from_str(&body)
            .context("invalid_args: failed to parse encrypted state file JSON")?;
        encrypted.source.url = display_url_without_query_or_fragment(&encrypted.source.url);
        validate_encrypted_state_envelope(&encrypted)?;
        return Ok(ActiveOriginStateFileSummary {
            schema_version: encrypted.schema_version,
            kind: encrypted.kind,
            created_at: encrypted.created_at,
            source: encrypted.source,
            counts: encrypted.counts,
            bytes,
            encryption: StateFileEncryptionInfo::encrypted(encrypted.encryption.algorithm),
        });
    }
    let read = read_state_file_from_bytes_with_key(path, String::new(), body.into_bytes(), None)?;
    let counts = read.state.counts();
    Ok(ActiveOriginStateFileSummary {
        schema_version: read.state.schema_version,
        kind: read.state.kind,
        created_at: read.state.created_at,
        counts,
        source: read.state.source,
        bytes,
        encryption: read.encryption,
    })
}

pub fn state_encryption_key_from_env() -> Result<Option<StateEncryptionKey>> {
    for name in [
        PIRE_STATE_ENCRYPTION_KEY_ENV,
        AGENT_BROWSER_STATE_ENCRYPTION_KEY_ENV,
    ] {
        if let Ok(value) = env::var(name) {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                continue;
            }
            return parse_state_encryption_key(trimmed)
                .with_context(|| {
                    format!("invalid_args: {name} must be a 64-character hex AES-256 key")
                })
                .map(Some);
        }
    }
    Ok(None)
}

pub fn parse_state_encryption_key(value: &str) -> Result<StateEncryptionKey> {
    let decoded = hex::decode(value.trim())
        .context("invalid_args: encryption key must be 64 hex characters")?;
    if decoded.len() != 32 {
        bail!("invalid_args: encryption key must decode to 32 bytes");
    }
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&decoded);
    Ok(StateEncryptionKey { bytes })
}

fn encrypt_state_file(
    state: &ActiveOriginStateFile,
    plaintext: &[u8],
    key: &StateEncryptionKey,
) -> Result<EncryptedActiveOriginStateFile> {
    let cipher = Aes256Gcm::new_from_slice(&key.bytes)
        .context("invalid_args: failed to initialize state encryption key")?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| anyhow!("failed to encrypt state file"))?;
    Ok(EncryptedActiveOriginStateFile {
        schema_version: STATE_SCHEMA_VERSION,
        tool: STATE_TOOL.to_string(),
        kind: ENCRYPTED_STATE_KIND.to_string(),
        created_at: state.created_at,
        source: state.source.clone(),
        counts: state.counts(),
        encryption: EncryptedStateMetadata {
            algorithm: STATE_ENCRYPTION_ALGORITHM.to_string(),
            nonce: base64::engine::general_purpose::STANDARD.encode(nonce),
            plaintext_sha256: sha256_hex(plaintext),
        },
        ciphertext: base64::engine::general_purpose::STANDARD.encode(ciphertext),
    })
}

fn decrypt_state_file(
    path: &Path,
    encrypted: &EncryptedActiveOriginStateFile,
    key: Option<&StateEncryptionKey>,
) -> Result<ActiveOriginStateFile> {
    validate_encrypted_state_envelope(encrypted)?;
    let key = key.with_context(|| {
        format!(
            "invalid_args: encrypted state file {} requires {PIRE_STATE_ENCRYPTION_KEY_ENV} or {AGENT_BROWSER_STATE_ENCRYPTION_KEY_ENV}",
            path.display()
        )
    })?;
    let nonce = base64::engine::general_purpose::STANDARD
        .decode(&encrypted.encryption.nonce)
        .context("invalid_args: encrypted state file nonce is invalid base64")?;
    if nonce.len() != 12 {
        bail!("invalid_args: encrypted state file nonce must be 12 bytes");
    }
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&encrypted.ciphertext)
        .context("invalid_args: encrypted state file ciphertext is invalid base64")?;
    let cipher = Aes256Gcm::new_from_slice(&key.bytes)
        .context("invalid_args: failed to initialize state encryption key")?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| {
            anyhow!(
                "invalid_args: failed to decrypt encrypted state file {}; check the encryption key",
                path.display()
            )
        })?;
    let plaintext_sha256 = sha256_hex(&plaintext);
    if plaintext_sha256 != encrypted.encryption.plaintext_sha256 {
        bail!("invalid_args: encrypted state file plaintext checksum did not match");
    }
    let mut state: ActiveOriginStateFile = serde_json::from_slice(&plaintext)
        .context("invalid_args: decrypted state file JSON is invalid")?;
    state.source.url = display_url_without_query_or_fragment(&state.source.url);
    state.validate()?;
    if state.created_at != encrypted.created_at
        || state.source != encrypted.source
        || state.counts() != encrypted.counts
    {
        bail!("invalid_args: encrypted state file metadata did not match decrypted state");
    }
    Ok(state)
}

fn validate_encrypted_state_envelope(encrypted: &EncryptedActiveOriginStateFile) -> Result<()> {
    if encrypted.schema_version != STATE_SCHEMA_VERSION {
        bail!(
            "invalid_args: unsupported encrypted state file schemaVersion {}; expected {}",
            encrypted.schema_version,
            STATE_SCHEMA_VERSION
        );
    }
    if encrypted.tool != STATE_TOOL {
        bail!("invalid_args: encrypted state file tool must be `{STATE_TOOL}`");
    }
    if encrypted.kind != ENCRYPTED_STATE_KIND {
        bail!("invalid_args: encrypted state file kind must be `{ENCRYPTED_STATE_KIND}`");
    }
    if encrypted.encryption.algorithm != STATE_ENCRYPTION_ALGORITHM {
        bail!(
            "invalid_args: unsupported state file encryption algorithm {}; expected {}",
            encrypted.encryption.algorithm,
            STATE_ENCRYPTION_ALGORITHM
        );
    }
    validate_http_url(&encrypted.source.url)?;
    validate_origin(&encrypted.source.origin)?;
    if origin_from_http_url(&encrypted.source.url).as_deref()
        != Some(encrypted.source.origin.as_str())
    {
        bail!("invalid_args: encrypted state file source.origin must match source.url");
    }
    Ok(())
}

fn state_file_json_kind(body: &str) -> Option<String> {
    serde_json::from_str::<Value>(body).ok().and_then(|value| {
        value
            .get("kind")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
}

pub fn display_url_without_query_or_fragment(url: &str) -> String {
    let end = url.find(['?', '#']).unwrap_or(url.len());
    url[..end].to_string()
}

pub fn canonical_state_path(path: &Path) -> Result<String> {
    let canonical = fs::canonicalize(path)
        .with_context(|| format!("invalid_args: failed to canonicalize {}", path.display()))?;
    let mut rendered = canonical.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        rendered = rendered.to_ascii_lowercase();
    }
    Ok(rendered)
}

pub fn build_state_inspection_receipt(
    read: &ActiveOriginStateFileRead,
    now_ms: u64,
    tool_version: &str,
) -> StateInspectionReceipt {
    StateInspectionReceipt {
        schema_version: STATE_RECEIPT_SCHEMA_VERSION,
        tool: STATE_TOOL.to_string(),
        kind: STATE_RECEIPT_KIND.to_string(),
        inspected_at: now_ms,
        expires_at: now_ms.saturating_add(STATE_RECEIPT_TTL_MS),
        canonical_path: read.canonical_path.clone(),
        state_file_sha256: read.sha256.clone(),
        bytes: read.bytes,
        state_schema_version: read.state.schema_version,
        state_kind: read.state.kind.clone(),
        origin: read.state.source.origin.clone(),
        display_url: display_url_without_query_or_fragment(&read.state.source.url),
        tool_version: tool_version.to_string(),
    }
}

pub fn write_state_inspection_receipt(
    read: &ActiveOriginStateFileRead,
    now_ms: u64,
    tool_version: &str,
) -> Result<(StateInspectionReceipt, PathBuf)> {
    write_state_inspection_receipt_to_dir(read, now_ms, tool_version, &state_receipts_dir()?)
}

pub fn write_state_inspection_receipt_to_dir(
    read: &ActiveOriginStateFileRead,
    now_ms: u64,
    tool_version: &str,
    dir: &Path,
) -> Result<(StateInspectionReceipt, PathBuf)> {
    let receipt = build_state_inspection_receipt(read, now_ms, tool_version);
    let path =
        state_receipt_file_path_in_dir(dir, &receipt.canonical_path, &receipt.state_file_sha256);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }
    let tmp_path = path.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(&receipt)?;
    fs::write(&tmp_path, body)
        .with_context(|| format!("failed to write {}", tmp_path.display()))?;
    fs::rename(&tmp_path, &path)
        .with_context(|| format!("failed to publish {}", path.display()))?;
    Ok((receipt, path))
}

pub fn validate_state_inspection_receipt(
    read: &ActiveOriginStateFileRead,
    now_ms: u64,
    tool_version: &str,
) -> Result<StateReceiptValidation> {
    validate_state_inspection_receipt_in_dir(read, now_ms, tool_version, &state_receipts_dir()?)
}

pub fn validate_state_inspection_receipt_in_dir(
    read: &ActiveOriginStateFileRead,
    now_ms: u64,
    tool_version: &str,
    dir: &Path,
) -> Result<StateReceiptValidation> {
    let path = state_receipt_file_path_in_dir(dir, &read.canonical_path, &read.sha256);
    let body = fs::read_to_string(&path).with_context(|| {
        "invalid_args: state file has no fresh inspection receipt; run `state inspect --record <path>` before `state load --require-inspected`"
    })?;
    let receipt: StateInspectionReceipt = serde_json::from_str(&body).with_context(|| {
        "invalid_args: state inspection receipt is invalid; rerun `state inspect --record <path>`"
    })?;
    validate_receipt_matches_read(&receipt, read, now_ms)?;
    let tool_version_mismatch =
        (receipt.tool_version != tool_version).then(|| receipt.tool_version.clone());
    Ok(StateReceiptValidation {
        receipt,
        tool_version_mismatch,
    })
}

pub fn sweep_expired_state_receipts(now_ms: u64) -> Result<usize> {
    sweep_expired_state_receipts_in_dir(&state_receipts_dir()?, now_ms)
}

pub fn sweep_expired_state_receipts_in_dir(dir: &Path, now_ms: u64) -> Result<usize> {
    if !dir.exists() {
        return Ok(0);
    }
    let mut removed = 0;
    for entry in fs::read_dir(dir).with_context(|| format!("failed to read {}", dir.display()))? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Ok(body) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(receipt) = serde_json::from_str::<StateInspectionReceipt>(&body) else {
            continue;
        };
        if receipt.expires_at <= now_ms && fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

pub fn state_receipts_dir() -> Result<PathBuf> {
    Ok(data_dir()?.join("state-receipts"))
}

pub fn state_receipt_file_path(canonical_path: &str, state_file_sha256: &str) -> Result<PathBuf> {
    Ok(state_receipt_file_path_in_dir(
        &state_receipts_dir()?,
        canonical_path,
        state_file_sha256,
    ))
}

pub fn state_receipt_file_path_in_dir(
    dir: &Path,
    canonical_path: &str,
    state_file_sha256: &str,
) -> PathBuf {
    dir.join(format!(
        "{}.json",
        state_receipt_key(canonical_path, state_file_sha256)
    ))
}

pub fn state_receipt_key(canonical_path: &str, state_file_sha256: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(canonical_path.as_bytes());
    hasher.update(b"\n");
    hasher.update(state_file_sha256.as_bytes());
    hex::encode(hasher.finalize())
}

fn validate_receipt_matches_read(
    receipt: &StateInspectionReceipt,
    read: &ActiveOriginStateFileRead,
    now_ms: u64,
) -> Result<()> {
    if receipt.schema_version != STATE_RECEIPT_SCHEMA_VERSION
        || receipt.tool != STATE_TOOL
        || receipt.kind != STATE_RECEIPT_KIND
    {
        bail!(
            "invalid_args: state inspection receipt is invalid; rerun `state inspect --record <path>`"
        );
    }
    if receipt.expires_at <= now_ms {
        bail!(
            "invalid_args: state inspection receipt is stale; rerun `state inspect --record <path>`"
        );
    }
    let expected_display_url = display_url_without_query_or_fragment(&read.state.source.url);
    if receipt.canonical_path != read.canonical_path
        || receipt.state_file_sha256 != read.sha256
        || receipt.bytes != read.bytes
        || receipt.state_schema_version != read.state.schema_version
        || receipt.state_kind != read.state.kind
        || receipt.origin != read.state.source.origin
        || receipt.display_url != expected_display_url
    {
        bail!(
            "invalid_args: state file changed since inspection; rerun `state inspect --record <path>`"
        );
    }
    Ok(())
}

fn sha256_hex(raw: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw);
    hex::encode(hasher.finalize())
}

fn string_map_from_value(value: Option<&Value>) -> Result<BTreeMap<String, String>> {
    let Some(value) = value else {
        return Ok(BTreeMap::new());
    };
    Ok(serde_json::from_value(value.clone())?)
}

fn validate_http_url(url: &str) -> Result<()> {
    if url.starts_with("http://") || url.starts_with("https://") {
        return Ok(());
    }
    bail!("invalid_args: state files require an http(s) source URL")
}

fn validate_origin(origin: &str) -> Result<()> {
    if origin.starts_with("http://") || origin.starts_with("https://") {
        return Ok(());
    }
    bail!("invalid_args: state files require an http(s) source origin")
}

fn origin_from_http_url(url: &str) -> Option<String> {
    let scheme_end = url.find("://")?;
    let scheme = &url[..scheme_end];
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let rest = &url[scheme_end + 3..];
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.is_empty() || authority.chars().any(char::is_whitespace) {
        return None;
    }
    Some(format!("{scheme}://{authority}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn builds_state_file_from_extension_export() {
        let state = state_from_extension_export(
            json!({
                "source": {
                    "url": "https://example.test/path?code=query-secret#fragment-secret",
                    "origin": "https://example.test"
                },
                "cookies": [{ "name": "sid", "value": "secret" }],
                "localStorage": { "local-token": "secret" },
                "sessionStorage": { "session-token": "secret" }
            }),
            "session-1".to_string(),
            Some("work".to_string()),
        )
        .unwrap();

        assert_eq!(state.schema_version, 1);
        assert_eq!(state.source.url, "https://example.test/path");
        assert_eq!(state.source.session_id.as_deref(), Some("session-1"));
        assert_eq!(state.source.profile_name.as_deref(), Some("work"));
        assert_eq!(state.cookie_count(), 1);
        assert_eq!(state.local_storage_key_count(), 1);
        assert_eq!(state.session_storage_key_count(), 1);
    }

    #[test]
    fn rejects_state_files_with_mismatched_url_and_origin() {
        let state = ActiveOriginStateFile {
            schema_version: 1,
            tool: "pire-browser".to_string(),
            kind: "active-origin-state".to_string(),
            created_at: 1,
            source: ActiveOriginStateSource {
                url: "https://example.test/path".to_string(),
                origin: "https://other.test".to_string(),
                session_id: None,
                profile_name: None,
            },
            cookies: Vec::new(),
            local_storage: BTreeMap::new(),
            session_storage: BTreeMap::new(),
        };

        assert!(state
            .validate()
            .unwrap_err()
            .to_string()
            .contains("source.origin"));
    }

    #[test]
    fn rejects_invalid_schema_without_echoing_payload_values() {
        let err = serde_json::from_str::<ActiveOriginStateFile>(
            r#"{
              "schemaVersion": 2,
              "tool": "pire-browser",
              "kind": "active-origin-state",
              "createdAt": 1,
              "source": { "url": "https://example.test", "origin": "https://example.test" },
              "localStorage": { "token": "raw-secret" }
            }"#,
        )
        .unwrap()
        .validate()
        .unwrap_err();
        let message = err.to_string();
        assert!(message.contains("schemaVersion"));
        assert!(!message.contains("raw-secret"));
    }

    #[test]
    fn reads_state_file_with_metadata() {
        let mut file = NamedTempFile::new().unwrap();
        write!(
            file,
            "{}",
            json!({
                "schemaVersion": 1,
                "tool": "pire-browser",
                "kind": "active-origin-state",
                "createdAt": 1,
                "source": {
                    "url": "https://example.test/path?code=query-secret#fragment-secret",
                    "origin": "https://example.test"
                },
                "cookies": [{ "name": "cookie-name-secret", "value": "cookie-value-secret" }],
                "localStorage": { "local-key-secret": "local-value-secret" },
                "sessionStorage": { "session-key-secret": "session-value-secret" }
            })
        )
        .unwrap();

        let read = read_state_file_with_metadata(file.path()).unwrap();

        assert_eq!(read.state.cookie_count(), 1);
        assert_eq!(read.state.source.url, "https://example.test/path");
        assert!(read.bytes > 0);
        assert_eq!(read.sha256.len(), 64);
        assert!(!read.canonical_path.is_empty());
    }

    #[test]
    fn write_state_file_strips_url_query_and_fragment() {
        let file = NamedTempFile::new().unwrap();
        let state = ActiveOriginStateFile {
            schema_version: 1,
            tool: "pire-browser".to_string(),
            kind: "active-origin-state".to_string(),
            created_at: 1,
            source: ActiveOriginStateSource {
                url: "https://example.test/path?code=query-secret#fragment-secret".to_string(),
                origin: "https://example.test".to_string(),
                session_id: None,
                profile_name: None,
            },
            cookies: Vec::new(),
            local_storage: BTreeMap::new(),
            session_storage: BTreeMap::new(),
        };

        write_state_file(file.path(), &state).unwrap();

        let body = fs::read_to_string(file.path()).unwrap();
        assert!(body.contains("https://example.test/path"));
        assert!(!body.contains("query-secret"));
        assert!(!body.contains("fragment-secret"));
    }

    #[test]
    fn parse_state_encryption_key_requires_32_byte_hex() {
        assert!(parse_state_encryption_key(
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
        )
        .is_ok());
        assert!(parse_state_encryption_key("not-hex")
            .unwrap_err()
            .to_string()
            .contains("hex"));
        assert!(parse_state_encryption_key("00")
            .unwrap_err()
            .to_string()
            .contains("32 bytes"));
    }

    #[test]
    fn encrypted_state_file_roundtrips_and_hides_values() {
        let file = NamedTempFile::new().unwrap();
        let key = parse_state_encryption_key(
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        )
        .unwrap();
        let state = ActiveOriginStateFile {
            schema_version: 1,
            tool: "pire-browser".to_string(),
            kind: "active-origin-state".to_string(),
            created_at: 7,
            source: ActiveOriginStateSource {
                url: "https://example.test/path?code=query-secret#fragment-secret".to_string(),
                origin: "https://example.test".to_string(),
                session_id: Some("session-1".to_string()),
                profile_name: Some("work".to_string()),
            },
            cookies: vec![json!({ "name": "sid", "value": "raw-cookie-secret" })],
            local_storage: [("local-token".to_string(), "raw-local-secret".to_string())].into(),
            session_storage: [(
                "session-token".to_string(),
                "raw-session-secret".to_string(),
            )]
            .into(),
        };

        let write = write_state_file_with_key(file.path(), &state, Some(key.clone())).unwrap();

        assert!(write.encryption.encrypted);
        assert_eq!(
            write.encryption.algorithm.as_deref(),
            Some(STATE_ENCRYPTION_ALGORITHM)
        );
        let body = fs::read_to_string(file.path()).unwrap();
        assert!(body.contains(ENCRYPTED_STATE_KIND));
        for sentinel in [
            "raw-cookie-secret",
            "raw-local-secret",
            "raw-session-secret",
            "query-secret",
            "fragment-secret",
        ] {
            assert!(!body.contains(sentinel), "{sentinel}");
        }

        let summary = read_state_file_summary(file.path()).unwrap();
        assert!(summary.encryption.encrypted);
        assert_eq!(summary.counts.cookies, 1);
        assert_eq!(summary.counts.local_storage_keys, 1);
        assert_eq!(summary.counts.session_storage_keys, 1);
        assert_eq!(summary.source.url, "https://example.test/path");

        let encrypted_raw = fs::read(file.path()).unwrap();
        let read = read_state_file_from_bytes_with_key(
            file.path(),
            "state.json".to_string(),
            encrypted_raw,
            Some(key),
        )
        .unwrap();
        assert!(read.encryption.encrypted);
        assert_eq!(read.state.source.url, "https://example.test/path");
        assert_eq!(read.state.cookies[0]["value"], "raw-cookie-secret");
        assert_eq!(read.state.local_storage["local-token"], "raw-local-secret");
        assert_eq!(
            read.state.session_storage["session-token"],
            "raw-session-secret"
        );
    }

    #[test]
    fn encrypted_state_file_requires_matching_key_without_leaking_values() {
        let file = NamedTempFile::new().unwrap();
        let key = parse_state_encryption_key(
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        )
        .unwrap();
        let wrong_key = parse_state_encryption_key(
            "1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100",
        )
        .unwrap();
        let state = ActiveOriginStateFile {
            schema_version: 1,
            tool: "pire-browser".to_string(),
            kind: "active-origin-state".to_string(),
            created_at: 7,
            source: ActiveOriginStateSource {
                url: "https://example.test/path".to_string(),
                origin: "https://example.test".to_string(),
                session_id: None,
                profile_name: None,
            },
            cookies: vec![json!({ "name": "sid", "value": "raw-cookie-secret" })],
            local_storage: BTreeMap::new(),
            session_storage: BTreeMap::new(),
        };
        write_state_file_with_key(file.path(), &state, Some(key)).unwrap();
        let raw = fs::read(file.path()).unwrap();

        let missing = read_state_file_from_bytes_with_key(
            file.path(),
            "state.json".to_string(),
            raw.clone(),
            None,
        )
        .unwrap_err()
        .to_string();
        assert!(missing.contains(PIRE_STATE_ENCRYPTION_KEY_ENV));
        assert!(missing.contains(AGENT_BROWSER_STATE_ENCRYPTION_KEY_ENV));
        assert!(!missing.contains("raw-cookie-secret"));

        let wrong = read_state_file_from_bytes_with_key(
            file.path(),
            "state.json".to_string(),
            raw,
            Some(wrong_key),
        )
        .unwrap_err()
        .to_string();
        assert!(wrong.contains("failed to decrypt"));
        assert!(!wrong.contains("raw-cookie-secret"));
    }

    #[test]
    fn inspection_receipts_validate_and_sweep() {
        let mut first = NamedTempFile::new().unwrap();
        write!(
            first,
            "{}",
            json!({
                "schemaVersion": 1,
                "tool": "pire-browser",
                "kind": "active-origin-state",
                "createdAt": 1,
                "source": {
                    "url": "https://example.test/path?code=query-secret#fragment-secret",
                    "origin": "https://example.test"
                },
                "cookies": [],
                "localStorage": {},
                "sessionStorage": {}
            })
        )
        .unwrap();
        let mut second = NamedTempFile::new().unwrap();
        write!(
            second,
            "{}",
            json!({
                "schemaVersion": 1,
                "tool": "pire-browser",
                "kind": "active-origin-state",
                "createdAt": 1,
                "source": {
                    "url": "https://example.test/path",
                    "origin": "https://example.test"
                }
            })
        )
        .unwrap();

        let dir = tempfile::tempdir().unwrap();
        let read = read_state_file_with_metadata(first.path()).unwrap();
        let (receipt, path) =
            write_state_inspection_receipt_to_dir(&read, 1000, "0.1.5", dir.path()).unwrap();

        assert!(path.exists());
        assert_eq!(receipt.display_url, "https://example.test/path");
        assert_eq!(receipt.bytes, read.bytes);
        assert_eq!(receipt.state_file_sha256, read.sha256);

        let validation =
            validate_state_inspection_receipt_in_dir(&read, 2000, "0.1.5", dir.path()).unwrap();
        assert_eq!(validation.receipt, receipt);
        assert_eq!(validation.tool_version_mismatch, None);

        let validation =
            validate_state_inspection_receipt_in_dir(&read, 2000, "0.1.6", dir.path()).unwrap();
        assert_eq!(validation.tool_version_mismatch.as_deref(), Some("0.1.5"));

        let second_read = read_state_file_with_metadata(second.path()).unwrap();
        let (_, second_path) =
            write_state_inspection_receipt_to_dir(&second_read, 1000, "0.1.5", dir.path()).unwrap();
        assert_ne!(path, second_path);

        first.as_file_mut().write_all(b"\n").unwrap();
        let changed = read_state_file_with_metadata(first.path()).unwrap();
        assert!(
            validate_state_inspection_receipt_in_dir(&changed, 2000, "0.1.5", dir.path())
                .unwrap_err()
                .to_string()
                .contains("no fresh inspection receipt")
        );

        assert!(validate_state_inspection_receipt_in_dir(
            &read,
            1000 + STATE_RECEIPT_TTL_MS + 1,
            "0.1.5",
            dir.path()
        )
        .unwrap_err()
        .to_string()
        .contains("stale"));
        assert_eq!(
            sweep_expired_state_receipts_in_dir(dir.path(), 1000 + STATE_RECEIPT_TTL_MS + 1)
                .unwrap(),
            2
        );
        assert!(!path.exists());
        assert!(!second_path.exists());
    }

    #[cfg(windows)]
    #[test]
    fn canonical_state_paths_normalize_windows_case_and_slashes() {
        let file = NamedTempFile::new().unwrap();
        let path = file.path().display().to_string();
        let alternate = path.replace('\\', "/").to_ascii_lowercase();

        let left = canonical_state_path(file.path()).unwrap();
        let right = canonical_state_path(Path::new(&alternate)).unwrap();

        assert_eq!(left, right);
    }

    #[test]
    fn rejects_bad_state_file_inputs() {
        assert!(
            read_state_file(Path::new("definitely-missing-state-file.json"))
                .unwrap_err()
                .to_string()
                .contains("invalid_args")
        );

        let dir = tempfile::tempdir().unwrap();
        assert!(read_state_file(dir.path())
            .unwrap_err()
            .to_string()
            .contains("not a file"));

        let oversized = NamedTempFile::new().unwrap();
        oversized
            .as_file()
            .set_len(MAX_STATE_FILE_BYTES + 1)
            .unwrap();
        assert!(read_state_file(oversized.path())
            .unwrap_err()
            .to_string()
            .contains("too large"));

        let mut non_utf8 = NamedTempFile::new().unwrap();
        non_utf8.write_all(&[0xff, 0xfe]).unwrap();
        assert!(read_state_file(non_utf8.path())
            .unwrap_err()
            .to_string()
            .contains("UTF-8"));

        for body in [
            "{",
            r#"{"schemaVersion":0,"tool":"pire-browser","kind":"active-origin-state","createdAt":1,"source":{"url":"https://example.test","origin":"https://example.test"}}"#,
            r#"{"schemaVersion":2,"tool":"pire-browser","kind":"active-origin-state","createdAt":1,"source":{"url":"https://example.test","origin":"https://example.test"}}"#,
            r#"{"schemaVersion":1,"tool":"other","kind":"active-origin-state","createdAt":1,"source":{"url":"https://example.test","origin":"https://example.test"}}"#,
            r#"{"schemaVersion":1,"tool":"pire-browser","kind":"other","createdAt":1,"source":{"url":"https://example.test","origin":"https://example.test"}}"#,
            r#"{"schemaVersion":1,"tool":"pire-browser","kind":"active-origin-state","createdAt":1}"#,
            r#"{"schemaVersion":1,"tool":"pire-browser","kind":"active-origin-state","createdAt":1,"source":{"url":"https://example.test/path","origin":"https://other.test"}}"#,
        ] {
            let mut file = NamedTempFile::new().unwrap();
            write!(file, "{body}").unwrap();
            assert!(read_state_file(file.path()).is_err(), "{body}");
        }
    }
}
