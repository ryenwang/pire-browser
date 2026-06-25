use std::collections::BTreeMap;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, AeadCore, OsRng};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::session::{data_dir, now_ms};

pub const AUTH_VAULT_SCHEMA_VERSION: u8 = 1;
pub const AUTH_PROFILE_SCHEMA_VERSION: u8 = 1;
pub const AUTH_VAULT_TOOL: &str = "pire-browser";
pub const AUTH_VAULT_KIND: &str = "encrypted-auth-vault";
pub const AUTH_VAULT_PLAINTEXT_KIND: &str = "auth-vault";
pub const AUTH_VAULT_ALGORITHM: &str = "AES-256-GCM";
pub const PIRE_AUTH_ENCRYPTION_KEY_ENV: &str = "PIRE_BROWSER_AUTH_ENCRYPTION_KEY";
pub const PIRE_ENCRYPTION_KEY_ENV: &str = "PIRE_BROWSER_ENCRYPTION_KEY";
pub const AGENT_BROWSER_ENCRYPTION_KEY_ENV: &str = "AGENT_BROWSER_ENCRYPTION_KEY";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthSelectors {
    pub username: String,
    pub password: String,
    pub submit: String,
}

impl Default for AuthSelectors {
    fn default() -> Self {
        Self {
            username: "input[autocomplete=\"username\"], input[name=\"username\"], input[name=\"email\"], input[type=\"email\"], #username, #email".to_string(),
            password: "input[autocomplete=\"current-password\"], input[type=\"password\"], input[name=\"password\"], #password".to_string(),
            submit: "button[type=\"submit\"], input[type=\"submit\"], button:has-text(\"Sign in\"), button:has-text(\"Log in\")".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthProfile {
    pub schema_version: u8,
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
    pub selectors: AuthSelectors,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublicAuthProfile {
    pub name: String,
    pub url: String,
    pub username: String,
    pub selectors: AuthSelectors,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthProfileInput {
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
    pub selectors: AuthSelectors,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PlainAuthVault {
    schema_version: u8,
    tool: String,
    kind: String,
    created_at: u64,
    updated_at: u64,
    profiles: BTreeMap<String, AuthProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct EncryptedAuthVault {
    schema_version: u8,
    tool: String,
    kind: String,
    created_at: u64,
    updated_at: u64,
    profile_count: usize,
    encryption: AuthVaultEncryptionMetadata,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AuthVaultEncryptionMetadata {
    algorithm: String,
    nonce: String,
    plaintext_sha256: String,
    key_source: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthVaultInfo {
    pub path: PathBuf,
    pub key_source: String,
    pub encrypted: bool,
    pub profile_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthVault {
    path: PathBuf,
    key: AuthVaultKey,
    key_source: String,
    created_at: u64,
    updated_at: u64,
    profiles: BTreeMap<String, AuthProfile>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AuthVaultKey {
    bytes: [u8; 32],
}

impl AuthProfile {
    pub fn public(&self) -> PublicAuthProfile {
        PublicAuthProfile {
            name: self.name.clone(),
            url: self.url.clone(),
            username: self.username.clone(),
            selectors: self.selectors.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

impl AuthVault {
    pub fn load() -> Result<Self> {
        load_auth_vault_from_paths(auth_vault_path()?, auth_vault_key_path()?)
    }

    pub fn info(&self) -> AuthVaultInfo {
        AuthVaultInfo {
            path: self.path.clone(),
            key_source: self.key_source.clone(),
            encrypted: true,
            profile_count: self.profiles.len(),
        }
    }

    pub fn save_profile(&mut self, input: AuthProfileInput) -> Result<PublicAuthProfile> {
        validate_auth_profile_name(&input.name)?;
        validate_http_url(&input.url)?;
        validate_auth_value("username", &input.username)?;
        validate_auth_value("password", &input.password)?;
        validate_selector("username selector", &input.selectors.username)?;
        validate_selector("password selector", &input.selectors.password)?;
        validate_selector("submit selector", &input.selectors.submit)?;
        let now = now_ms();
        let created_at = self
            .profiles
            .get(&input.name)
            .map(|profile| profile.created_at)
            .unwrap_or(now);
        let profile = AuthProfile {
            schema_version: AUTH_PROFILE_SCHEMA_VERSION,
            name: input.name.clone(),
            url: input.url,
            username: input.username,
            password: input.password,
            selectors: input.selectors,
            created_at,
            updated_at: now,
        };
        let public = profile.public();
        self.profiles.insert(input.name, profile);
        self.updated_at = now;
        self.persist()?;
        Ok(public)
    }

    pub fn profile(&self, name: &str) -> Result<AuthProfile> {
        validate_auth_profile_name(name)?;
        self.profiles
            .get(name)
            .cloned()
            .ok_or_else(|| anyhow!("not_found: No auth profile found: {name}"))
    }

    pub fn public_profile(&self, name: &str) -> Result<PublicAuthProfile> {
        Ok(self.profile(name)?.public())
    }

    pub fn public_profiles(&self) -> Vec<PublicAuthProfile> {
        self.profiles
            .values()
            .map(AuthProfile::public)
            .collect::<Vec<_>>()
    }

    pub fn delete_profile(&mut self, name: &str) -> Result<bool> {
        validate_auth_profile_name(name)?;
        let existed = self.profiles.remove(name).is_some();
        if existed {
            self.updated_at = now_ms();
            self.persist()?;
        }
        Ok(existed)
    }

    fn persist(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        let plaintext = PlainAuthVault {
            schema_version: AUTH_VAULT_SCHEMA_VERSION,
            tool: AUTH_VAULT_TOOL.to_string(),
            kind: AUTH_VAULT_PLAINTEXT_KIND.to_string(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            profiles: self.profiles.clone(),
        };
        let plaintext_body = serde_json::to_vec_pretty(&plaintext)?;
        let encrypted = encrypt_auth_vault(
            &plaintext_body,
            self.created_at,
            self.updated_at,
            self.profiles.len(),
            &self.key,
            &self.key_source,
        )?;
        let body = serde_json::to_vec_pretty(&encrypted)?;
        let tmp_path = self.path.with_extension("json.tmp");
        fs::write(&tmp_path, body)
            .with_context(|| format!("failed to write {}", tmp_path.display()))?;
        fs::rename(&tmp_path, &self.path)
            .with_context(|| format!("failed to publish {}", self.path.display()))?;
        Ok(())
    }
}

pub fn auth_vault_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("auth-vault.json"))
}

pub fn auth_vault_key_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("auth-vault.key"))
}

fn load_auth_vault_from_paths(path: PathBuf, key_path: PathBuf) -> Result<AuthVault> {
    let (key, key_source) = auth_vault_key(&key_path)?;
    if !path.exists() {
        return Ok(AuthVault {
            path,
            key,
            key_source,
            created_at: now_ms(),
            updated_at: now_ms(),
            profiles: BTreeMap::new(),
        });
    }
    let raw = fs::read(&path).with_context(|| format!("failed to read {}", path.display()))?;
    if raw.len() > 10 * 1024 * 1024 {
        bail!("invalid_args: auth vault is too large");
    }
    let body = String::from_utf8(raw).with_context(|| {
        format!(
            "invalid_args: auth vault is not valid UTF-8: {}",
            path.display()
        )
    })?;
    let encrypted: EncryptedAuthVault =
        serde_json::from_str(&body).context("invalid_args: failed to parse auth vault JSON")?;
    let plaintext = decrypt_auth_vault(&path, &encrypted, &key)?;
    validate_plain_auth_vault(&plaintext)?;
    Ok(AuthVault {
        path,
        key,
        key_source,
        created_at: plaintext.created_at,
        updated_at: plaintext.updated_at,
        profiles: plaintext.profiles,
    })
}

fn auth_vault_key(key_path: &Path) -> Result<(AuthVaultKey, String)> {
    for name in [
        PIRE_AUTH_ENCRYPTION_KEY_ENV,
        PIRE_ENCRYPTION_KEY_ENV,
        AGENT_BROWSER_ENCRYPTION_KEY_ENV,
    ] {
        if let Ok(value) = env::var(name) {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                continue;
            }
            return parse_auth_vault_key(trimmed)
                .with_context(|| {
                    format!("invalid_args: {name} must be a 64-character hex AES-256 key")
                })
                .map(|key| (key, format!("env:{name}")));
        }
    }

    if key_path.exists() {
        let key = fs::read_to_string(key_path)
            .with_context(|| format!("failed to read {}", key_path.display()))?;
        return parse_auth_vault_key(key.trim())
            .with_context(|| {
                format!(
                    "invalid_args: auth vault key file {} must contain a 64-character hex AES-256 key",
                    key_path.display()
                )
            })
            .map(|key| (key, "file".to_string()));
    }

    if let Some(parent) = key_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let encoded = hex::encode(bytes);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(key_path)
        .with_context(|| format!("failed to create {}", key_path.display()))?;
    file.write_all(encoded.as_bytes())
        .with_context(|| format!("failed to write {}", key_path.display()))?;
    #[cfg(unix)]
    {
        let _ = fs::set_permissions(key_path, fs::Permissions::from_mode(0o600));
    }
    Ok((AuthVaultKey { bytes }, "file".to_string()))
}

fn parse_auth_vault_key(value: &str) -> Result<AuthVaultKey> {
    let decoded = hex::decode(value.trim())
        .context("invalid_args: auth vault encryption key must be 64 hex characters")?;
    if decoded.len() != 32 {
        bail!("invalid_args: auth vault encryption key must decode to 32 bytes");
    }
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&decoded);
    Ok(AuthVaultKey { bytes })
}

fn encrypt_auth_vault(
    plaintext: &[u8],
    created_at: u64,
    updated_at: u64,
    profile_count: usize,
    key: &AuthVaultKey,
    key_source: &str,
) -> Result<EncryptedAuthVault> {
    let cipher = Aes256Gcm::new_from_slice(&key.bytes)
        .context("invalid_args: failed to initialize auth vault encryption key")?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| anyhow!("failed to encrypt auth vault"))?;
    Ok(EncryptedAuthVault {
        schema_version: AUTH_VAULT_SCHEMA_VERSION,
        tool: AUTH_VAULT_TOOL.to_string(),
        kind: AUTH_VAULT_KIND.to_string(),
        created_at,
        updated_at,
        profile_count,
        encryption: AuthVaultEncryptionMetadata {
            algorithm: AUTH_VAULT_ALGORITHM.to_string(),
            nonce: base64::engine::general_purpose::STANDARD.encode(nonce),
            plaintext_sha256: sha256_hex(plaintext),
            key_source: key_source.to_string(),
        },
        ciphertext: base64::engine::general_purpose::STANDARD.encode(ciphertext),
    })
}

fn decrypt_auth_vault(
    path: &Path,
    encrypted: &EncryptedAuthVault,
    key: &AuthVaultKey,
) -> Result<PlainAuthVault> {
    validate_encrypted_auth_vault(encrypted)?;
    let nonce = base64::engine::general_purpose::STANDARD
        .decode(&encrypted.encryption.nonce)
        .context("invalid_args: encrypted auth vault nonce is invalid base64")?;
    if nonce.len() != 12 {
        bail!("invalid_args: encrypted auth vault nonce must be 12 bytes");
    }
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&encrypted.ciphertext)
        .context("invalid_args: encrypted auth vault ciphertext is invalid base64")?;
    let cipher = Aes256Gcm::new_from_slice(&key.bytes)
        .context("invalid_args: failed to initialize auth vault encryption key")?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| {
            anyhow!(
                "invalid_args: failed to decrypt encrypted auth vault {}; check the encryption key",
                path.display()
            )
        })?;
    if sha256_hex(&plaintext) != encrypted.encryption.plaintext_sha256 {
        bail!("invalid_args: encrypted auth vault plaintext checksum did not match");
    }
    serde_json::from_slice(&plaintext).context("invalid_args: decrypted auth vault JSON is invalid")
}

fn validate_encrypted_auth_vault(encrypted: &EncryptedAuthVault) -> Result<()> {
    if encrypted.schema_version != AUTH_VAULT_SCHEMA_VERSION {
        bail!(
            "invalid_args: unsupported auth vault schemaVersion {}; expected {}",
            encrypted.schema_version,
            AUTH_VAULT_SCHEMA_VERSION
        );
    }
    if encrypted.tool != AUTH_VAULT_TOOL {
        bail!("invalid_args: auth vault tool must be `{AUTH_VAULT_TOOL}`");
    }
    if encrypted.kind != AUTH_VAULT_KIND {
        bail!("invalid_args: auth vault kind must be `{AUTH_VAULT_KIND}`");
    }
    if encrypted.encryption.algorithm != AUTH_VAULT_ALGORITHM {
        bail!(
            "invalid_args: unsupported auth vault encryption algorithm {}; expected {}",
            encrypted.encryption.algorithm,
            AUTH_VAULT_ALGORITHM
        );
    }
    Ok(())
}

fn validate_plain_auth_vault(vault: &PlainAuthVault) -> Result<()> {
    if vault.schema_version != AUTH_VAULT_SCHEMA_VERSION {
        bail!(
            "invalid_args: unsupported auth vault schemaVersion {}; expected {}",
            vault.schema_version,
            AUTH_VAULT_SCHEMA_VERSION
        );
    }
    if vault.tool != AUTH_VAULT_TOOL {
        bail!("invalid_args: auth vault tool must be `{AUTH_VAULT_TOOL}`");
    }
    if vault.kind != AUTH_VAULT_PLAINTEXT_KIND {
        bail!("invalid_args: auth vault kind must be `{AUTH_VAULT_PLAINTEXT_KIND}`");
    }
    for (name, profile) in &vault.profiles {
        if name != &profile.name {
            bail!("invalid_args: auth vault profile key must match profile name");
        }
        validate_auth_profile(profile)?;
    }
    Ok(())
}

fn validate_auth_profile(profile: &AuthProfile) -> Result<()> {
    if profile.schema_version != AUTH_PROFILE_SCHEMA_VERSION {
        bail!(
            "invalid_args: unsupported auth profile schemaVersion {}; expected {}",
            profile.schema_version,
            AUTH_PROFILE_SCHEMA_VERSION
        );
    }
    validate_auth_profile_name(&profile.name)?;
    validate_http_url(&profile.url)?;
    validate_auth_value("username", &profile.username)?;
    validate_auth_value("password", &profile.password)?;
    validate_selector("username selector", &profile.selectors.username)?;
    validate_selector("password selector", &profile.selectors.password)?;
    validate_selector("submit selector", &profile.selectors.submit)?;
    Ok(())
}

pub fn validate_auth_profile_name(name: &str) -> Result<()> {
    if name.trim().is_empty() || name == "." || name == ".." {
        bail!("invalid_args: auth profile name cannot be empty");
    }
    if name.contains('/') || name.contains('\\') || name.contains(':') {
        bail!("invalid_args: auth profile name must not contain path separators or ':'");
    }
    Ok(())
}

fn validate_auth_value(label: &str, value: &str) -> Result<()> {
    if value.is_empty() {
        bail!("invalid_args: auth {label} cannot be empty");
    }
    if value.contains('\n') || value.contains('\r') {
        bail!("invalid_args: auth {label} cannot contain newlines");
    }
    Ok(())
}

fn validate_selector(label: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        bail!("invalid_args: auth {label} cannot be empty");
    }
    Ok(())
}

fn validate_http_url(url: &str) -> Result<()> {
    let Some(rest) = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
    else {
        bail!("invalid_args: auth save --url must be an http(s) URL");
    };
    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
        .trim();
    if !host.is_empty()
        && !host.contains(char::is_whitespace)
        && !host.contains('@')
        && !host.starts_with(':')
    {
        return Ok(());
    }
    bail!("invalid_args: auth save --url must be an http(s) URL")
}

fn sha256_hex(raw: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw);
    hex::encode(hasher.finalize())
}

pub fn auth_vault_value(info: &AuthVaultInfo) -> Value {
    serde_json::json!({
        "encrypted": info.encrypted,
        "algorithm": AUTH_VAULT_ALGORITHM,
        "path": info.path.display().to_string(),
        "keySource": info.key_source,
        "profileCount": info.profile_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_paths() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let vault_path = dir.path().join("auth-vault.json");
        let key_path = dir.path().join("auth-vault.key");
        (dir, vault_path, key_path)
    }

    #[test]
    fn encrypted_auth_vault_hides_passwords_and_roundtrips() {
        let (_dir, vault_path, key_path) = temp_paths();
        let mut vault = load_auth_vault_from_paths(vault_path.clone(), key_path.clone()).unwrap();
        let public = vault
            .save_profile(AuthProfileInput {
                name: "app".to_string(),
                url: "https://example.test/login?code=query-secret".to_string(),
                username: "user@example.test".to_string(),
                password: "raw-password-secret".to_string(),
                selectors: AuthSelectors::default(),
            })
            .unwrap();
        assert_eq!(public.name, "app");

        let body = fs::read_to_string(&vault_path).unwrap();
        assert!(body.contains(AUTH_VAULT_KIND));
        assert!(!body.contains("raw-password-secret"));
        assert!(!body.contains("user@example.test"));
        assert!(!body.contains("query-secret"));
        assert!(key_path.exists());

        let loaded = load_auth_vault_from_paths(vault_path, key_path).unwrap();
        let profile = loaded.profile("app").unwrap();
        assert_eq!(profile.password, "raw-password-secret");
        assert_eq!(profile.username, "user@example.test");
        assert_eq!(profile.url, "https://example.test/login?code=query-secret");
        let rendered = serde_json::to_string(&profile.public()).unwrap();
        assert!(!rendered.contains("raw-password-secret"));
    }

    #[test]
    fn auth_vault_delete_persists_removal() {
        let (_dir, vault_path, key_path) = temp_paths();
        let mut vault = load_auth_vault_from_paths(vault_path.clone(), key_path.clone()).unwrap();
        vault
            .save_profile(AuthProfileInput {
                name: "app".to_string(),
                url: "https://example.test/login".to_string(),
                username: "user".to_string(),
                password: "pass".to_string(),
                selectors: AuthSelectors::default(),
            })
            .unwrap();
        assert!(vault.delete_profile("app").unwrap());
        assert!(!vault.delete_profile("app").unwrap());

        let loaded = load_auth_vault_from_paths(vault_path, key_path).unwrap();
        assert!(loaded.profile("app").is_err());
    }
}
