use keyring::Entry;

const ACCOUNT_KEY: &str = "api-key";
const ACCOUNT_SECRET: &str = "api-secret";

/// API credentials for an exchange. For HMAC-style exchanges (Binance) `secret`
/// is the shared secret; for Ed25519-style exchanges (Revolut X) it holds the
/// PEM-encoded private key.
pub struct Credentials {
    pub api_key: String,
    pub secret: String,
}

fn entry(service: &str, account: &str) -> Result<Entry, String> {
    Entry::new(service, account).map_err(|e| format!("keyring entry: {e}"))
}

pub fn save(service: &str, creds: &Credentials) -> Result<(), String> {
    entry(service, ACCOUNT_KEY)?
        .set_password(&creds.api_key)
        .map_err(|e| format!("save api key: {e}"))?;
    entry(service, ACCOUNT_SECRET)?
        .set_password(&creds.secret)
        .map_err(|e| format!("save secret: {e}"))?;
    Ok(())
}

pub fn load(service: &str) -> Result<Credentials, String> {
    let api_key = entry(service, ACCOUNT_KEY)?
        .get_password()
        .map_err(|e| format!("load api key: {e}"))?;
    let secret = entry(service, ACCOUNT_SECRET)?
        .get_password()
        .map_err(|e| format!("load secret: {e}"))?;
    Ok(Credentials { api_key, secret })
}

pub fn clear(service: &str) -> Result<(), String> {
    let _ = entry(service, ACCOUNT_KEY)?.delete_credential();
    let _ = entry(service, ACCOUNT_SECRET)?.delete_credential();
    Ok(())
}

pub fn has(service: &str) -> bool {
    load(service).is_ok()
}
