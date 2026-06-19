use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::secrets;

const BASE_URL: &str = "https://api.binance.com";
const RECV_WINDOW_MS: u64 = 10_000;
const SERVICE: &str = "cryptax-binance";

type HmacSha256 = Hmac<Sha256>;

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .map_err(|e| format!("clock: {e}"))
}

fn sign(secret: &str, query: &str) -> Result<String, String> {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).map_err(|e| format!("hmac init: {e}"))?;
    mac.update(query.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn build_query(params: &[(&str, String)]) -> String {
    params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

async fn signed_get(path: &str, mut params: Vec<(&str, String)>) -> Result<Value, String> {
    let creds = secrets::load(SERVICE)?;
    let timestamp = now_ms()?;

    params.push(("recvWindow", RECV_WINDOW_MS.to_string()));
    params.push(("timestamp", timestamp.to_string()));

    let query = build_query(&params);
    let signature = sign(&creds.secret, &query)?;
    let url = format!("{BASE_URL}{path}?{query}&signature={signature}");

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("X-MBX-APIKEY", creds.api_key)
        .send()
        .await
        .map_err(|e| format!("http request: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("read body: {e}"))?;

    if !status.is_success() {
        return Err(format!("Binance {} {}: {}", path, status.as_u16(), body));
    }

    serde_json::from_str::<Value>(&body).map_err(|e| format!("parse json: {e}"))
}

#[tauri::command]
pub async fn binance_fetch_account() -> Result<Value, String> {
    signed_get("/api/v3/account", vec![]).await
}

#[tauri::command]
pub async fn binance_fetch_trades(
    symbol: String,
    start_ms: Option<i64>,
    end_ms: Option<i64>,
) -> Result<Value, String> {
    let mut params = vec![("symbol", symbol), ("limit", "1000".to_string())];
    if let Some(start) = start_ms {
        params.push(("startTime", start.to_string()));
    }
    if let Some(end) = end_ms {
        params.push(("endTime", end.to_string()));
    }
    signed_get("/api/v3/myTrades", params).await
}

#[tauri::command]
pub async fn binance_fetch_deposits(
    start_ms: Option<i64>,
    end_ms: Option<i64>,
) -> Result<Value, String> {
    let mut params = vec![];
    if let Some(start) = start_ms {
        params.push(("startTime", start.to_string()));
    }
    if let Some(end) = end_ms {
        params.push(("endTime", end.to_string()));
    }
    signed_get("/sapi/v1/capital/deposit/hisrec", params).await
}

#[tauri::command]
pub async fn binance_fetch_withdrawals(
    start_ms: Option<i64>,
    end_ms: Option<i64>,
) -> Result<Value, String> {
    let mut params = vec![];
    if let Some(start) = start_ms {
        params.push(("startTime", start.to_string()));
    }
    if let Some(end) = end_ms {
        params.push(("endTime", end.to_string()));
    }
    signed_get("/sapi/v1/capital/withdraw/history", params).await
}

#[tauri::command]
pub fn binance_save_credentials(api_key: String, secret: String) -> Result<(), String> {
    secrets::save(SERVICE, &secrets::Credentials { api_key, secret })
}

#[tauri::command]
pub fn binance_clear_credentials() -> Result<(), String> {
    secrets::clear(SERVICE)
}

#[tauri::command]
pub fn binance_has_credentials() -> bool {
    secrets::has(SERVICE)
}
