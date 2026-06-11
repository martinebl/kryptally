use keyring::Entry;

const SERVICE: &str = "cryptax-binance";
const ACCOUNT_KEY: &str = "api-key";
const ACCOUNT_SECRET: &str = "api-secret";

pub struct BinanceCredentials {
    pub api_key: String,
    pub secret: String,
}

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|e| format!("keyring entry: {e}"))
}

pub fn save(creds: &BinanceCredentials) -> Result<(), String> {
    entry(ACCOUNT_KEY)?
        .set_password(&creds.api_key)
        .map_err(|e| format!("save api key: {e}"))?;
    entry(ACCOUNT_SECRET)?
        .set_password(&creds.secret)
        .map_err(|e| format!("save secret: {e}"))?;
    Ok(())
}

pub fn load() -> Result<BinanceCredentials, String> {
    let api_key = entry(ACCOUNT_KEY)?
        .get_password()
        .map_err(|e| format!("load api key: {e}"))?;
    let secret = entry(ACCOUNT_SECRET)?
        .get_password()
        .map_err(|e| format!("load secret: {e}"))?;
    Ok(BinanceCredentials { api_key, secret })
}

pub fn clear() -> Result<(), String> {
    let _ = entry(ACCOUNT_KEY)?.delete_credential();
    let _ = entry(ACCOUNT_SECRET)?.delete_credential();
    Ok(())
}

pub fn has() -> bool {
    load().is_ok()
}
