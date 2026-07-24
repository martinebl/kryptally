use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, SecondsFormat, Utc};
use ed25519_dalek::pkcs8::DecodePrivateKey;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

use crate::secrets;

/// Event emitted to the frontend when a request is rate limited and we are
/// waiting before retrying, so the UI can show a countdown. `waitMs` is the
/// delay before the next attempt.
const RATE_LIMITED_EVENT: &str = "coinbase://rate-limited";

const BASE_URL: &str = "https://api.coinbase.com";
const API_HOST: &str = "api.coinbase.com";
const API_PREFIX: &str = "/api/v3/brokerage";
const SERVICE: &str = "cryptax-coinbase";
const FILLS_PAGE_LIMIT: u32 = 250;
const ACCOUNTS_PAGE_LIMIT: u32 = 250;

/// CDP JWTs are single-use and short-lived by design; each request mints its own.
const JWT_TTL_SECS: u64 = 120;

const MAX_RATE_LIMIT_RETRIES: u32 = 5;
const DEFAULT_RETRY_AFTER_MS: u64 = 1000;
const MAX_RETRY_AFTER_MS: u64 = 30_000;
/// Gentle pace between paginated requests within a single fetch, to avoid
/// tripping the limit in the first place (backoff above handles it when we do).
const PAGE_DELAY_MS: u64 = 100;

async fn sleep_ms(ms: u64) {
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
}

fn now_secs() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|e| format!("clock: {e}"))
}

fn ms_to_rfc3339(ms: i64) -> Result<String, String> {
    DateTime::<Utc>::from_timestamp_millis(ms)
        .map(|dt| dt.to_rfc3339_opts(SecondsFormat::Millis, true))
        .ok_or_else(|| format!("invalid timestamp: {ms}"))
}

fn base64url_json(value: &Value) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(|e| format!("encode json: {e}"))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// A best-effort-unique per-request value. CDP auth requires a `nonce` claim
/// but doesn't require it to be cryptographically random, so a nanosecond
/// timestamp avoids pulling in a `rand` dependency just for this.
fn nonce() -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("clock: {e}"))?
        .as_nanos();
    Ok(format!("{nanos:x}"))
}

fn build_query(params: &[(&str, String)]) -> String {
    params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Build and sign a CDP JWT scoped to one `method` + `path` (Coinbase's Advanced
/// Trade auth binds each JWT to a specific request via the `uri` claim, so it
/// can't be reused across calls). `key_name` is the CDP key's full
/// `organizations/{org_id}/apiKeys/{key_id}` identifier; `private_key_pem` its
/// Ed25519 PKCS#8 private key. Only Ed25519 (CDP's recommended key type) is
/// supported here — legacy ECDSA CDP keys would need an ES256 signer instead.
fn build_jwt(
    key_name: &str,
    private_key_pem: &str,
    method: &str,
    path: &str,
) -> Result<String, String> {
    let signing_key = SigningKey::from_pkcs8_pem(private_key_pem)
        .map_err(|e| format!("parse private key: {e}"))?;

    let now = now_secs()?;
    let header = json!({
        "alg": "EdDSA",
        "kid": key_name,
        "typ": "JWT",
        "nonce": nonce()?,
    });
    let claims = json!({
        "sub": key_name,
        "iss": "cdp",
        "nbf": now,
        "exp": now + JWT_TTL_SECS,
        "uri": format!("{method} {API_HOST}{path}"),
    });

    let signing_input = format!("{}.{}", base64url_json(&header)?, base64url_json(&claims)?);
    let signature = signing_key.sign(signing_input.as_bytes());
    Ok(format!(
        "{signing_input}.{}",
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    ))
}

/// Perform a signed GET against the Advanced Trade API. `path` is the full
/// request path including `API_PREFIX` (e.g. "/api/v3/brokerage/accounts").
async fn signed_get(
    app: &AppHandle,
    path: &str,
    params: &[(&str, String)],
) -> Result<Value, String> {
    let creds = secrets::load(SERVICE)?;
    let query = build_query(params);
    let url = if query.is_empty() {
        format!("{BASE_URL}{path}")
    } else {
        format!("{BASE_URL}{path}?{query}")
    };

    let client = reqwest::Client::new();
    let mut retries = 0;

    loop {
        // Re-sign every attempt: the JWT's `exp` is only JWT_TTL_SECS out, so a
        // retry after waiting out a rate limit needs a fresh one.
        let jwt = build_jwt(&creds.api_key, &creds.secret, "GET", path)?;

        let response = client
            .get(&url)
            .bearer_auth(jwt)
            .send()
            .await
            .map_err(|e| format!("http request: {e}"))?;

        let status = response.status();

        if status.as_u16() == 429 && retries < MAX_RATE_LIMIT_RETRIES {
            let wait_ms = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.trim().parse::<u64>().ok())
                .unwrap_or(DEFAULT_RETRY_AFTER_MS)
                .min(MAX_RETRY_AFTER_MS);
            retries += 1;
            app.emit(RATE_LIMITED_EVENT, json!({ "waitMs": wait_ms }))
                .ok();
            sleep_ms(wait_ms).await;
            continue;
        }

        let body = response
            .text()
            .await
            .map_err(|e| format!("read body: {e}"))?;

        if !status.is_success() {
            return Err(format!("Coinbase {} {}: {}", path, status.as_u16(), body));
        }

        return serde_json::from_str::<Value>(&body).map_err(|e| format!("parse json: {e}"));
    }
}

/// List every brokerage account (used to discover held assets), paginating
/// until exhausted.
#[tauri::command]
pub async fn coinbase_fetch_accounts(app: AppHandle) -> Result<Value, String> {
    let path = format!("{API_PREFIX}/accounts");
    let mut all_accounts: Vec<Value> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut params: Vec<(&str, String)> = vec![("limit", ACCOUNTS_PAGE_LIMIT.to_string())];
        if let Some(ref c) = cursor {
            params.push(("cursor", c.clone()));
        }

        let body = signed_get(&app, &path, &params).await?;

        if let Some(data) = body.get("accounts").and_then(|d| d.as_array()) {
            all_accounts.extend(data.iter().cloned());
        }

        let has_next = body
            .get("has_next")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        cursor = body
            .get("cursor")
            .and_then(|c| c.as_str())
            .filter(|c| !c.is_empty())
            .map(|c| c.to_string());

        if !has_next || cursor.is_none() {
            break;
        }
        sleep_ms(PAGE_DELAY_MS).await;
    }

    Ok(Value::Array(all_accounts))
}

/// Fetch every executed trade fill (buy/sell leg) in `[start_ms, end_ms]`,
/// paginating until exhausted. This is the only Advanced Trade endpoint used
/// for import: it alone carries price/size/side/commission per execution, so
/// there's no orders-vs-fills reconciliation to do (unlike Revolut X, which
/// needs both).
///
/// Advanced Trade only ever returns trade executions here — sends, receives,
/// staking rewards, and Coinbase Earn payouts aren't exposed by this API at
/// all, so they must come from the CSV import instead.
#[tauri::command]
pub async fn coinbase_fetch_fills(
    app: AppHandle,
    start_ms: i64,
    end_ms: i64,
) -> Result<Value, String> {
    let path = format!("{API_PREFIX}/orders/historical/fills");
    let mut all_fills: Vec<Value> = Vec::new();
    let mut cursor: Option<String> = None;

    let start_iso = ms_to_rfc3339(start_ms)?;
    let end_iso = ms_to_rfc3339(end_ms)?;

    loop {
        let mut params: Vec<(&str, String)> = vec![
            ("limit", FILLS_PAGE_LIMIT.to_string()),
            ("start_sequence_timestamp", start_iso.clone()),
            ("end_sequence_timestamp", end_iso.clone()),
        ];
        if let Some(ref c) = cursor {
            params.push(("cursor", c.clone()));
        }

        let body = signed_get(&app, &path, &params).await?;

        if let Some(data) = body.get("fills").and_then(|d| d.as_array()) {
            all_fills.extend(data.iter().cloned());
        }

        cursor = body
            .get("cursor")
            .and_then(|c| c.as_str())
            .filter(|c| !c.is_empty())
            .map(|c| c.to_string());

        if cursor.is_none() {
            break;
        }
        sleep_ms(PAGE_DELAY_MS).await;
    }

    Ok(Value::Array(all_fills))
}

#[tauri::command]
pub fn coinbase_save_credentials(api_key: String, secret: String) -> Result<(), String> {
    secrets::save(SERVICE, &secrets::Credentials { api_key, secret })
}

#[tauri::command]
pub fn coinbase_clear_credentials() -> Result<(), String> {
    secrets::clear(SERVICE)
}

#[tauri::command]
pub fn coinbase_has_credentials() -> bool {
    secrets::has(SERVICE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};

    // Throwaway Ed25519 PKCS#8 key, generated offline for this test only
    // (same fixture key used in revolut_x.rs's tests).
    const TEST_PRIVATE_KEY_PEM: &str = "-----BEGIN PRIVATE KEY-----\n\
MC4CAQAwBQYDK2VwBCIEIEFjkOEV6V72Sg26Wy7qjRuUWOGMIALJRcvxrctNvJhJ\n\
-----END PRIVATE KEY-----\n";

    #[test]
    fn build_query_url_encodes_params() {
        let query = build_query(&[("limit", "250".to_string()), ("cursor", "a b".to_string())]);
        assert_eq!(query, "limit=250&cursor=a%20b");
    }

    #[test]
    fn empty_params_produce_empty_query() {
        assert_eq!(build_query(&[]), "");
    }

    #[test]
    fn ms_to_rfc3339_formats_a_known_timestamp() {
        assert_eq!(ms_to_rfc3339(0).unwrap(), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn jwt_has_three_parts_with_expected_claims_and_valid_signature() {
        let key_name = "organizations/org-id/apiKeys/key-id";
        let jwt = build_jwt(
            key_name,
            TEST_PRIVATE_KEY_PEM,
            "GET",
            "/api/v3/brokerage/accounts",
        )
        .unwrap();

        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3);

        let header_bytes = URL_SAFE_NO_PAD.decode(parts[0]).unwrap();
        let header: Value = serde_json::from_slice(&header_bytes).unwrap();
        assert_eq!(header["alg"], "EdDSA");
        assert_eq!(header["kid"], key_name);

        let claims_bytes = URL_SAFE_NO_PAD.decode(parts[1]).unwrap();
        let claims: Value = serde_json::from_slice(&claims_bytes).unwrap();
        assert_eq!(claims["sub"], key_name);
        assert_eq!(claims["iss"], "cdp");
        assert_eq!(
            claims["uri"],
            "GET api.coinbase.com/api/v3/brokerage/accounts"
        );

        let signing_input = format!("{}.{}", parts[0], parts[1]);
        let sig_bytes = URL_SAFE_NO_PAD.decode(parts[2]).unwrap();
        let signature = Signature::from_slice(&sig_bytes).unwrap();

        let signing_key = SigningKey::from_pkcs8_pem(TEST_PRIVATE_KEY_PEM).unwrap();
        let verifying: VerifyingKey = signing_key.verifying_key();
        assert!(verifying
            .verify(signing_input.as_bytes(), &signature)
            .is_ok());
    }
}
