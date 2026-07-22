# Kryptally

An open-source, local-first cryptocurrency tax reporting tool that runs in your browser or as a desktop app. Your transaction data stays on your machine — the only external requests are for historical exchange rates (crypto and fiat prices) needed to compute gains and losses.

The core feature is **gains and losses tracking** — Kryptally computes your realized gains and losses across all your crypto transactions using industry-standard cost basis methods. This gives you the numbers you need to fill in your tax return.

> **Disclaimer:** Any tax estimates shown by Kryptally are rough approximations for informational purposes only. They are **not** legal or financial advice. Accurate tax calculation depends on your full financial picture (salary, other income, deductions, etc.), which is outside the scope of this tool. Always consult a qualified tax professional for your specific situation.

## Using Kryptally

There are two ways to use Kryptally — no account or signup required for either.

### 1. Web app (no install)

The quickest way to try Kryptally. Open it directly in your browser and import your transaction history from CSV exports:

**[https://martinebl.github.io/kryptally/](https://martinebl.github.io/kryptally/)**

The web app supports CSV import and full tax computation. Because browsers block cross-origin requests to exchange APIs, direct exchange connections are only available in the desktop app below.

### 2. Desktop app

The desktop app ([Tauri](https://tauri.app)) adds the ability to connect directly to exchanges (Binance, Revolut X) via their APIs and pull your transaction history automatically. Your API keys are stored in your operating system's keyring and never leave your machine.

Download the latest installer for your operating system from the **[releases page](https://github.com/martinebl/kryptally/releases)**. Pick the asset that matches your platform:

- **Linux** — `.AppImage` runs on most distributions (make it executable and launch it). Use `.deb` on Debian/Ubuntu, or `.rpm` on Fedora/RHEL, if you prefer a package manager install.
- **macOS** — `.dmg`. If multiple are listed, choose `aarch64` for Apple Silicon (M-series) Macs, or `x64` for Intel Macs.
- **Windows** — `.exe` (NSIS installer) or `.msi`; either will install the app.

## Features

- **Gains & losses reporting** — tracks cost basis and computes realized gains/losses, the key output you need for tax reporting
- **Local-first & privacy-first** — all computation happens on your machine; the only network requests are to fetch historical exchange rates (no transaction data is ever sent anywhere)
- **Multi-country tax rules** — rules are defined as JSON files, making it easy for the community to add support for new countries. Denmark and Czechia are currently supported (with rules for multiple tax years)
- **Exchange importers** — import transaction history from CSV exports of Binance, Ledger, and Revolut X
- **Direct exchange connections (desktop app)** — connect to Binance and Revolut X via API to import trades, deposits, and withdrawals automatically; API keys are stored in your OS keyring
- **Multiple cost basis methods** — FIFO, LIFO, HIFO, and average cost, with the allowed methods determined by each country's rules
- **Currency normalization** — transaction amounts are converted to your local fiat currency at import time

## Data sources & accuracy

Kryptally resolves historical prices through two sources, tried in order:

1. **Local CSV files** — you can import daily crypto price CSVs in the UI, and Kryptally will use those first. This is the fastest and most reliable option, and it keeps all matching crypto price lookups fully offline. These files can be constructed with data from Yahoo Finance or Investing.com.

2. **CoinGecko API** — for any asset not covered by a local CSV, Kryptally falls back to the [CoinGecko API](https://www.coingecko.com/en/api) (free tier, no API key required). Requests are rate-limited and cached per asset per date, so importing large files may take a moment. Note that the free tier is limited to one year of historical data, so any asset prices from > 1 year ago that are not found in CSV price files will result in a failed call to CoinGecko and a 0 cost basis.

Fiat-to-fiat conversions (e.g. USD → DKK) are handled by the [Frankfurter API](https://www.frankfurter.app), backed by European Central Bank data — free and no API key required.

Prices are **daily snapshots** — intra-day price movements are not captured, so the values used may differ slightly from the exact price at the time of your transaction. This is generally acceptable for tax reporting purposes, but you should verify the results against your own records.

## For developers - Running from source

### Prerequisites

- [Node.js](https://nodejs.org/) v22
- For the desktop (Tauri) build only: a working [Rust](https://www.rust-lang.org/) toolchain and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) for your OS

### Web app (development)

```bash
git clone https://github.com/martinebl/kryptally.git
cd kryptally
npm install
npm run dev
```

Then open the URL shown in your terminal (usually `http://localhost:5173`).

### Desktop app (development)

```bash
npm install
npm run tauri:dev      # run the Tauri desktop shell against the dev server
npm run tauri:build    # produce a production desktop bundle for your OS
```

### Production build (web)

```bash
npm run build
npm run preview
```


## Contributing

Contributions are welcome! There are two great ways to help:

- **Add tax rules for new countries** — see `src/lib/types/tax-rules.ts` for the JSON schema that country rule files follow, and `src/lib/rules/` for existing examples (Denmark, Czechia).
- **Add exchange importers** — see `src/lib/importers/` for existing CSV importers (Binance, Ledger, Revolut X) to use as a reference.

## Built with agentic AI

This project was built with the help of agentic AI coding tools. Learning to develop software collaboratively with agentic AI was a deliberate part of this project — exploring what that workflow looks like in practice, where it helps, and where it falls short.

## License

[Apache 2.0](LICENSE)
