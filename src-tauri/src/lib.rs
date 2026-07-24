mod binance;
mod coinbase;
mod revolut_x;
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
            binance::binance_fetch_exchange_info,
            binance::binance_fetch_trades,
            binance::binance_fetch_deposits,
            binance::binance_fetch_withdrawals,
            binance::binance_save_credentials,
            binance::binance_clear_credentials,
            binance::binance_has_credentials,
            revolut_x::revolut_x_fetch_trades,
            revolut_x::revolut_x_fetch_orders,
            revolut_x::revolut_x_fetch_balances,
            revolut_x::revolut_x_fetch_pairs,
            revolut_x::revolut_x_save_credentials,
            revolut_x::revolut_x_clear_credentials,
            revolut_x::revolut_x_has_credentials,
            coinbase::coinbase_fetch_accounts,
            coinbase::coinbase_fetch_fills,
            coinbase::coinbase_save_credentials,
            coinbase::coinbase_clear_credentials,
            coinbase::coinbase_has_credentials,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
