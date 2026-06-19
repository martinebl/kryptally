use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::pkcs8::DecodePrivateKey;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

use crate::secrets;

/// Event emitted to the frontend when a request is rate limited and we are
/// waiting before retrying, so the UI can show a countdown. `waitMs` is the
/// delay before the next attempt.
const RATE_LIMITED_EVENT: &str = "revolut-x://rate-limited";

const BASE_URL: &str = "https://revx.revolut.com";
const API_PREFIX: &str = "/api/1.0";
const SERVICE: &str = "cryptax-revolut-x";
const TRADES_PAGE_LIMIT: u32 = 1900;

/// Rate-limit backoff. Revolut publishes no fixed limit for these GET endpoints;
/// instead a 429 carries a `Retry-After` header (in milliseconds) telling us how
/// long to wait. We honor it, capped and bounded, and re-sign on each retry.
const MAX_RATE_LIMIT_RETRIES: u32 = 5;
const DEFAULT_RETRY_AFTER_MS: u64 = 1000;
const MAX_RETRY_AFTER_MS: u64 = 30_000;
/// Gentle pace between paginated requests within a single fetch, to avoid
/// tripping the limit in the first place (backoff above handles it when we do).
const PAGE_DELAY_MS: u64 = 100;

async fn sleep_ms(ms: u64) {
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .map_err(|e| format!("clock: {e}"))
}

/// Canonical query string: params sorted by key, URL-encoded, joined with `&`,
/// no leading `?`. Mirrors the official Revolut X SDK so the signature matches
/// what the server expects.
fn build_query(params: &[(&str, String)]) -> String {
    let mut sorted: Vec<&(&str, String)> = params.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    sorted
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Sign a request message with an Ed25519 private key (PKCS#8 PEM) and return
/// the standard-base64 signature.
fn sign(private_key_pem: &str, message: &str) -> Result<String, String> {
    let signing_key =
        SigningKey::from_pkcs8_pem(private_key_pem).map_err(|e| format!("parse private key: {e}"))?;
    let signature = signing_key.sign(message.as_bytes());
    Ok(STANDARD.encode(signature.to_bytes()))
}

/// Perform a signed GET against the Revolut X API. `path` is relative to the
/// `/api/1.0` prefix (e.g. "/balances"). The signed message is
/// `timestamp + "GET" + fullPath + query + body`, with an empty body for GETs.
async fn signed_get(app: &AppHandle, path: &str, params: &[(&str, String)]) -> Result<Value, String> {
    let creds = secrets::load(SERVICE)?;
    let full_path = format!("{API_PREFIX}{path}");
    let query = build_query(params);

    let url = if query.is_empty() {
        format!("{BASE_URL}{full_path}")
    } else {
        format!("{BASE_URL}{full_path}?{query}")
    };

    let client = reqwest::Client::new();
    let mut retries = 0;

    loop {
        // Re-sign every attempt: the signature binds the timestamp, which must be
        // current — waiting out a Retry-After can age it past the server's window.
        let timestamp = now_ms()?.to_string();
        let message = format!("{timestamp}GET{full_path}{query}");
        let signature = sign(&creds.secret, &message)?;

        let response = client
            .get(&url)
            .header("X-Revx-API-Key", &creds.api_key)
            .header("X-Revx-Timestamp", &timestamp)
            .header("X-Revx-Signature", signature)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("http request: {e}"))?;

        let status = response.status();

        // Rate limited: wait the server-specified time (ms) and retry, bounded.
        if status.as_u16() == 429 && retries < MAX_RATE_LIMIT_RETRIES {
            let wait_ms = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.trim().parse::<u64>().ok())
                .unwrap_or(DEFAULT_RETRY_AFTER_MS)
                .min(MAX_RETRY_AFTER_MS);
            retries += 1;
            // Tell the UI we're backing off so it can count down instead of
            // looking frozen. Best-effort: a missing listener is not an error.
            app.emit(RATE_LIMITED_EVENT, serde_json::json!({ "waitMs": wait_ms }))
                .ok();
            sleep_ms(wait_ms).await;
            continue;
        }

        let body = response
            .text()
            .await
            .map_err(|e| format!("read body: {e}"))?;

        if !status.is_success() {
            return Err(format!(
                "Revolut X {} {}: {}",
                full_path,
                status.as_u16(),
                body
            ));
        }

        return serde_json::from_str::<Value>(&body).map_err(|e| format!("parse json: {e}"));
    }
}

#[tauri::command]
pub async fn revolut_x_fetch_balances(app: AppHandle) -> Result<Value, String> {
    signed_get(&app, "/balances", &[]).await
}

#[tauri::command]
pub async fn revolut_x_fetch_pairs(app: AppHandle) -> Result<Value, String> {
    signed_get(&app, "/configuration/pairs", &[]).await
}

/// Fetch all private trades for a symbol (e.g. "BTC-USD"), following the
/// cursor-based pagination until exhausted. Returns the flat array of wire trades.
#[tauri::command]
pub async fn revolut_x_fetch_trades(
    app: AppHandle,
    symbol: String,
    start_ms: i64,
    end_ms: i64,
) -> Result<Value, String> {
    let path = format!("/trades/private/{symbol}");
    let mut all_trades: Vec<Value> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut params: Vec<(&str, String)> = vec![
            ("limit", TRADES_PAGE_LIMIT.to_string()),
            ("start_date", start_ms.to_string()),
            ("end_date", end_ms.to_string()),
        ];
        if let Some(ref c) = cursor {
            params.push(("cursor", c.clone()));
        }

        let body = signed_get(&app, &path, &params).await?;

        if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
            all_trades.extend(data.iter().cloned());
        }

        cursor = body
            .get("metadata")
            .and_then(|m| m.get("next_cursor"))
            .and_then(|c| c.as_str())
            .filter(|c| !c.is_empty())
            .map(|c| c.to_string());

        if cursor.is_none() {
            break;
        }
        sleep_ms(PAGE_DELAY_MS).await;
    }

    Ok(Value::Array(all_trades))
}

/// Fetch all historical orders (account-wide, every pair), following cursor
/// pagination until exhausted. Returns the flat array of order objects; the
/// frontend keeps the ones that actually executed (filled_quantity > 0).
#[tauri::command]
pub async fn revolut_x_fetch_orders(
    app: AppHandle,
    start_ms: i64,
    end_ms: i64,
) -> Result<Value, String> {
    let mut all_orders: Vec<Value> = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut params: Vec<(&str, String)> = vec![
            ("start_date", start_ms.to_string()),
            ("end_date", end_ms.to_string()),
        ];
        if let Some(ref c) = cursor {
            params.push(("cursor", c.clone()));
        }

        let body = signed_get(&app, "/orders/historical", &params).await?;

        if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
            all_orders.extend(data.iter().cloned());
        }

        cursor = body
            .get("metadata")
            .and_then(|m| m.get("next_cursor"))
            .and_then(|c| c.as_str())
            .filter(|c| !c.is_empty())
            .map(|c| c.to_string());

        if cursor.is_none() {
            break;
        }
        sleep_ms(PAGE_DELAY_MS).await;
    }

    Ok(Value::Array(all_orders))
}

#[tauri::command]
pub fn revolut_x_save_credentials(api_key: String, secret: String) -> Result<(), String> {
    secrets::save(SERVICE, &secrets::Credentials { api_key, secret })
}

#[tauri::command]
pub fn revolut_x_clear_credentials() -> Result<(), String> {
    secrets::clear(SERVICE)
}

#[tauri::command]
pub fn revolut_x_has_credentials() -> bool {
    secrets::has(SERVICE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};

    // Throwaway Ed25519 PKCS#8 key, generated offline for this test only.
    const TEST_PRIVATE_KEY_PEM: &str = "-----BEGIN PRIVATE KEY-----\n\
MC4CAQAwBQYDK2VwBCIEIEFjkOEV6V72Sg26Wy7qjRuUWOGMIALJRcvxrctNvJhJ\n\
-----END PRIVATE KEY-----\n";

    #[test]
    fn build_query_sorts_and_url_encodes() {
        let query = build_query(&[
            ("limit", "1900".to_string()),
            ("cursor", "a b".to_string()),
            ("start_date", "1700000000000".to_string()),
        ]);
        assert_eq!(query, "cursor=a%20b&limit=1900&start_date=1700000000000");
    }

    #[test]
    fn empty_params_produce_empty_query() {
        assert_eq!(build_query(&[]), "");
    }

    #[test]
    fn signature_verifies_with_public_key() {
        let message = "1700000000000GET/api/1.0/balances";
        let sig_b64 = sign(TEST_PRIVATE_KEY_PEM, message).unwrap();

        let sig_bytes = STANDARD.decode(sig_b64).unwrap();
        let signature = Signature::from_slice(&sig_bytes).unwrap();

        let signing_key = SigningKey::from_pkcs8_pem(TEST_PRIVATE_KEY_PEM).unwrap();
        let verifying: VerifyingKey = signing_key.verifying_key();

        assert!(verifying.verify(message.as_bytes(), &signature).is_ok());
    }
}
