mod binance;
mod secrets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      binance::binance_fetch_account,
      binance::binance_fetch_trades,
      binance::binance_fetch_deposits,
      binance::binance_fetch_withdrawals,
      binance::binance_save_credentials,
      binance::binance_clear_credentials,
      binance::binance_has_credentials,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
