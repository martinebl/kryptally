use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::secrets;

const BASE_URL: &str = "https://coinmate.io/api";
const SERVICE: &str = "cryptax-coinmate";
/// `/transactionHistory` caps `limit` at 1000 entries. We request the max and
/// walk forward by `offset` until a page is short — Coinmate has no 30-day
/// window cap like Revolut X, so a single ascending sweep covers the whole
/// account history this way.
const PAGE_LIMIT: u32 = 1000;

type HmacSha256 = Hmac<Sha256>;

/// Coinmate credentials pack three pieces of data into the two-field keychain
/// slot used by `secrets::Credentials`:
///
/// - `api_key`  → the Client ID (account number)
/// - `secret`   → the API public key and private key on two lines:
///   `<publicKey>\n<privateKey>`
///
/// The private key is the HMAC key; the public key is sent verbatim in the
/// request body. Splitting happens here on load.
struct CoinmateCreds {
    client_id: String,
    public_key: String,
    private_key: String,
}

impl CoinmateCreds {
    fn load() -> Result<Self, String> {
        let raw = secrets::load(SERVICE)?;
        let (public_key, private_key) = raw.secret.split_once('\n').ok_or_else(|| {
            "Coinmate secret must contain the public and private key on separate lines".to_string()
        })?;
        if public_key.is_empty() || private_key.is_empty() {
            return Err("Coinmate public and private keys must both be non-empty".to_string());
        }
        Ok(Self {
            client_id: raw.api_key,
            public_key: public_key.to_string(),
            private_key: private_key.to_string(),
        })
    }
}

/// Monotonically-increasing nonce for each request. Nanosecond wall-clock
/// resolution is fine enough that sequential requests never collide.
fn nonce() -> Result<String, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos().to_string())
        .map_err(|e| format!("clock: {e}"))
}

/// `HMAC_SHA256(nonce + clientId + publicKey, privateKey)` as uppercased hex.
fn sign(
    private_key: &str,
    nonce: &str,
    client_id: &str,
    public_key: &str,
) -> Result<String, String> {
    let message = format!("{nonce}{client_id}{public_key}");
    let mut mac = HmacSha256::new_from_slice(private_key.as_bytes())
        .map_err(|e| format!("hmac init: {e}"))?;
    mac.update(message.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()).to_uppercase())
}

/// URL-encode a single form field, joining `&`. Coins are kept verbatim (no
/// sorting) — the signature binds only `nonce+clientId+publicKey`, not the
/// body, so any ordering is accepted.
fn build_form(params: &[(&str, String)]) -> String {
    params
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Perform a signed POST against a private Coinmate endpoint. `path` is the
/// endpoint including its leading slash (e.g. `"/transactionHistory"`).
/// `params` carries the endpoint-specific form fields only; the auth quad
/// (`clientId`, `publicKey`, `nonce`, `signature`) is added here.
async fn signed_post(path: &str, params: Vec<(&str, String)>) -> Result<Value, String> {
    let creds = CoinmateCreds::load()?;
    let nonce = nonce()?;
    let signature = sign(
        &creds.private_key,
        &nonce,
        &creds.client_id,
        &creds.public_key,
    )?;

    let mut form: Vec<(&str, String)> = vec![
        ("clientId", creds.client_id.clone()),
        ("publicKey", creds.public_key.clone()),
        ("nonce", nonce),
        ("signature", signature),
    ];
    form.extend(params);

    let url = format!("{BASE_URL}{path}");
    let body = build_form(&form);

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("http request: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("read body: {e}"))?;

    if !status.is_success() {
        return Err(format!("Coinmate {} {}: {}", path, status.as_u16(), text));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| format!("parse json: {e}"))?;

    // The Coinmate envelope flips `error` to true on logical failures (bad
    // signature, bad nonce, insufficient permissions, …). Surface those with
    // the server-provided message so the frontend shows what went wrong.
    if json.get("error").and_then(|v| v.as_bool()).unwrap_or(false) {
        let message = json
            .get("errorMessage")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error")
            .to_string();
        return Err(format!("Coinmate {}: {}", path, message));
    }

    Ok(json)
}

/// Money/amount fields arrive from Coinmate as bare JSON numbers. With
/// `serde_json`'s `arbitrary_precision` feature active, `Number::to_string()`
/// reproduces the exact decimal token the server sent — so converting these to
/// JSON strings here is lossless and lets the TypeScript BigNumber layer stay
/// float-free across the Tauri boundary.
const AMOUNT_KEYS: [&str; 3] = ["amount", "price", "fee"];

/// In-place: stringify the money fields of a single transaction record.
fn stringify_amounts(item: &mut Value) {
    let Some(obj) = item.as_object_mut() else {
        return;
    };
    for key in AMOUNT_KEYS {
        if let Some(field) = obj.get_mut(key) {
            if field.is_number() {
                let s = field.to_string();
                *field = Value::String(s);
            }
        }
    }
}

/// Fetch every transaction across the whole account history, walking
/// `/transactionHistory` pages of `PAGE_LIMIT` rows in ascending order until
/// a page comes back short. Optional `start_ms` / `end_ms` (Unix ms, inclusive)
/// are forwarded to narrow the server-side window. Returns the flat array of
/// wire records with their money fields converted to strings.
#[tauri::command]
pub async fn coinmate_fetch_transaction_history(
    start_ms: Option<i64>,
    end_ms: Option<i64>,
) -> Result<Vec<Value>, String> {
    let mut all: Vec<Value> = Vec::new();
    let mut offset: u32 = 0;

    loop {
        let mut params: Vec<(&str, String)> = vec![
            ("limit", PAGE_LIMIT.to_string()),
            ("offset", offset.to_string()),
            ("sort", "ASC".to_string()),
        ];
        if let Some(start) = start_ms {
            params.push(("timestampFrom", start.to_string()));
        }
        if let Some(end) = end_ms {
            params.push(("timestampTo", end.to_string()));
        }

        let page = signed_post("/transactionHistory", params).await?;
        let mut data = page
            .get("data")
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();

        let count = data.len() as u32;

        for item in data.iter_mut() {
            stringify_amounts(item);
        }
        all.extend(data);

        if count < PAGE_LIMIT {
            break;
        }
        offset += PAGE_LIMIT;
    }

    Ok(all)
}

/// Persist Coinmate credentials. `client_id` is stored verbatim as the
/// keychain's API-key slot; `public_key` and `private_key` are joined with a
/// newline into the secret slot (see `CoinmateCreds::load` for the matching
/// unpack).
#[tauri::command]
pub fn coinmate_save_credentials(
    client_id: String,
    public_key: String,
    private_key: String,
) -> Result<(), String> {
    if client_id.trim().is_empty() {
        return Err("Coinmate Client ID is required".to_string());
    }
    if public_key.trim().is_empty() || private_key.trim().is_empty() {
        return Err("Coinmate public and private keys are both required".to_string());
    }
    secrets::save(
        SERVICE,
        &secrets::Credentials {
            api_key: client_id,
            secret: format!("{public_key}\n{private_key}"),
        },
    )
}

#[tauri::command]
pub fn coinmate_clear_credentials() -> Result<(), String> {
    secrets::clear(SERVICE)
}

#[tauri::command]
pub fn coinmate_has_credentials() -> bool {
    secrets::has(SERVICE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_matches_python_reference() {
        // Mirrors the documented python `createSignature` snippet (uppercased
        // hex of HMAC-SHA256 over `nonce + clientId + publicKey`, keyed by the
        // private key). Reproduced offline with that exact snippet.
        let sig = sign(
            "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
            "15472079411",
            "1011",
            "CpmRVUJL0OGByT2otAfCKeeDdU6yfi6OzvnXcAwaHvE",
        )
        .unwrap();
        assert_eq!(
            sig,
            "A01BBCF294A5CBE9B677D530C32E7672737CE718CA8B2F4E196C208E72805869"
        );
    }

    #[test]
    fn build_form_url_encodes_values() {
        let body = build_form(&[
            ("clientId", "123".to_string()),
            ("publicKey", "ab cd".to_string()),
            ("nonce", "100".to_string()),
        ]);
        assert_eq!(body, "clientId=123&publicKey=ab%20cd&nonce=100");
    }

    #[test]
    fn stringify_amounts_leaves_strings_and_nulls_intact() {
        let mut item: Value = serde_json::from_str(
            r#"{"amount": 0.02055184, "price": null, "fee": 1.74, "feeCurrency": "CZK"}"#,
        )
        .unwrap();
        stringify_amounts(&mut item);
        let obj = item.as_object().unwrap();
        assert_eq!(obj.get("amount").unwrap().as_str().unwrap(), "0.02055184");
        assert_eq!(obj.get("fee").unwrap().as_str().unwrap(), "1.74");
        assert!(obj.get("price").unwrap().is_null());
        assert_eq!(obj.get("feeCurrency").unwrap().as_str().unwrap(), "CZK");
    }
}
