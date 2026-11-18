//! Provider API keys (BYOK) for the local gateway.
//!
//! Each key lives ONLY in the OS secure store (macOS Keychain / Windows Credential Manager) under
//! service `maindy`, account `provider:<upstream id>` (e.g. `provider:openai`). The webview sends a
//! key exactly once (the `provider_key_save` command); it is never returned to the UI, never logged,
//! never written to settings.json. Rust pushes it to the gateway's memory (`PUT /maindy/upstreams/:id`)
//! and re-pushes it whenever the gateway it supervises restarts.

use crate::api::CmdError;
use std::collections::HashMap;
use std::sync::Mutex;

pub const PROVIDER_SERVICE: &str = "maindy";

/// A secret value whose `Debug` never prints the content.
#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Secret(<redacted>)")
    }
}

/// Gateway upstream ids (`openai`, `anthropic`, `ollama`…): lowercase, digits, `_` or `-`, ≤ 40.
pub fn valid_upstream_id(id: &str) -> bool {
    let b = id.as_bytes();
    !b.is_empty()
        && b.len() <= 40
        && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit())
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_' || *c == b'-')
}

/// Keychain account for an upstream: `provider:<id>`.
pub fn provider_account(id: &str) -> Result<String, CmdError> {
    if !valid_upstream_id(id) {
        return Err(CmdError::new("invalid_request", "Identificador de provedor inválido."));
    }
    Ok(format!("provider:{id}"))
}

/// Reference sent to the control plane (`PUT /v1/connectors/:kind`): where the secret lives, never the secret.
pub fn credential_ref(id: &str) -> Result<String, CmdError> {
    Ok(format!("keychain:{PROVIDER_SERVICE}/{}", provider_account(id)?))
}

/// Light sanity check of a pasted key (the provider test is the real validation).
pub fn validate_api_key(raw: &str) -> Result<Secret, CmdError> {
    let k = raw.trim();
    if k.len() < 8 {
        return Err(CmdError::new("invalid_key", "A chave parece curta demais. Cole a chave completa."));
    }
    if k.len() > 512 {
        return Err(CmdError::new("invalid_key", "A chave é longa demais."));
    }
    if !k.bytes().all(|c| c.is_ascii_graphic()) {
        return Err(CmdError::new("invalid_key", "A chave contém espaços ou caracteres inválidos."));
    }
    Ok(Secret(k.to_string()))
}

fn entry(id: &str) -> Result<keyring::Entry, CmdError> {
    let account = provider_account(id)?;
    keyring::Entry::new(PROVIDER_SERVICE, &account)
        .map_err(|e| CmdError::new("keychain", format!("Armazenamento seguro indisponível: {e}")))
}

pub fn keychain_store(id: &str, key: &Secret) -> Result<(), CmdError> {
    entry(id)?
        .set_password(key.expose())
        .map_err(|e| CmdError::new("keychain", format!("Não foi possível salvar a chave no armazenamento seguro do sistema: {e}")))
}

pub fn keychain_load(id: &str) -> Result<Option<Secret>, CmdError> {
    match entry(id)?.get_password() {
        Ok(k) => Ok(Some(Secret(k))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(CmdError::new("keychain", format!("Não foi possível ler a chave do armazenamento seguro: {e}"))),
    }
}

pub fn keychain_delete(id: &str) -> Result<(), CmdError> {
    match entry(id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(CmdError::new("keychain", format!("Não foi possível remover a chave do armazenamento seguro: {e}"))),
    }
}

/// In-process cache so the Keychain is read at most once per key per app run (each read of an ad hoc
/// signed build may prompt the user).
#[derive(Default)]
pub struct KeyCache {
    inner: Mutex<HashMap<String, Secret>>,
}

impl KeyCache {
    pub fn put(&self, id: &str, key: Secret) {
        self.inner.lock().unwrap().insert(id.to_string(), key);
    }

    pub fn forget(&self, id: &str) {
        self.inner.lock().unwrap().remove(id);
    }

    /// Cached value, or one Keychain read.
    pub fn get_or_load(&self, id: &str) -> Result<Option<Secret>, CmdError> {
        if let Some(k) = self.inner.lock().unwrap().get(id) {
            return Ok(Some(k.clone()));
        }
        let loaded = keychain_load(id)?;
        if let Some(k) = &loaded {
            self.put(id, k.clone());
        }
        Ok(loaded)
    }
}

impl std::fmt::Debug for KeyCache {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let ids: Vec<String> = self.inner.lock().unwrap().keys().cloned().collect();
        f.debug_struct("KeyCache").field("ids", &ids).finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_naming() {
        assert_eq!(provider_account("openai").unwrap(), "provider:openai");
        assert_eq!(provider_account("anthropic").unwrap(), "provider:anthropic");
        assert_eq!(provider_account("ollama").unwrap(), "provider:ollama");
        assert_eq!(credential_ref("openai").unwrap(), "keychain:maindy/provider:openai");
        assert_eq!(credential_ref("anthropic").unwrap(), "keychain:maindy/provider:anthropic");
        for bad in ["", "OpenAI", "../x", "a b", "provider:openai", "x".repeat(41).as_str(), "-x", "ü"] {
            assert!(provider_account(bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn credential_ref_matches_api_pattern() {
        // apps/api CREDENTIAL_REF_PATTERN: ^(keychain|credman|env|file):[A-Za-z0-9_.:/@-]{1,200}$
        for id in ["openai", "anthropic", "ollama", "my_vllm-2"] {
            let r = credential_ref(id).unwrap();
            let rest = r.strip_prefix("keychain:").unwrap();
            assert!(!rest.is_empty() && rest.len() <= 200);
            assert!(rest.chars().all(|c| c.is_ascii_alphanumeric() || "_.:/@-".contains(c)), "{r}");
        }
    }

    #[test]
    fn key_validation_and_redaction() {
        assert!(validate_api_key("short").is_err());
        assert!(validate_api_key("sk-abc def ghi").is_err());
        assert!(validate_api_key(&"k".repeat(600)).is_err());
        let s = validate_api_key("  sk-test-1234567890  ").unwrap();
        assert_eq!(s.expose(), "sk-test-1234567890");
        assert!(!format!("{s:?}").contains("1234567890"));
        let cache = KeyCache::default();
        cache.put("openai", s);
        assert!(!format!("{cache:?}").contains("1234567890"));
    }
}
