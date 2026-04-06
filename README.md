# Kryptax

An open-source cryptocurrency tax reporting tool that runs in your browser. Your transaction data stays on your machine — the only external requests are for historical exchange rates (crypto and fiat prices) needed to compute gains and losses.

The core feature is **gains and losses tracking** — Kryptax computes your realized gains and losses across all your crypto transactions using industry-standard cost basis methods. This gives you the numbers you need to fill in your tax return.

> **Disclaimer:** Any tax estimates shown by Kryptax are rough approximations for informational purposes only. They are **not** legal or financial advice. Accurate tax calculation depends on your full financial picture (salary, other income, deductions, etc.), which is outside the scope of this tool. Always consult a qualified tax professional for your specific situation.

## Features

- **Gains & losses reporting** — tracks cost basis and computes realized gains/losses, the key output you need for tax reporting
- **Local-first & privacy-first** — all computation happens in your browser; the only network requests are to fetch historical exchange rates (no transaction data is sent)
- **Multi-country tax rules** — rules are defined as JSON files, making it easy for the community to add support for new countries
- **Exchange importers** — import transaction history from Binance, Ledger, and more
- **Multiple cost basis methods** — FIFO, LIFO, HIFO, and average cost
- **Currency normalization** — transaction amounts are converted to your local fiat currency at import time

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)

### Running locally

```bash
git clone https://github.com/martinebl/kryptax.git
cd kryptax
npm install
npm run dev
```

Then open the URL shown in your terminal (usually `http://localhost:5173`).

### Building for production

```bash
npm run build
npm run preview
```

## Data sources & accuracy

Kryptax resolves historical prices through two sources, tried in order:

1. **Local CSV files** — you can import daily crypto price csv's in the UI, Kryptax will use those first. This is the fastest and most reliable option, and it keeps all matching crypto price lookups fully offline. These files can be constructed with data from Yahoo Finance or Investing dot com.

2. **CoinGecko API** — for any asset not covered by a local CSV, Kryptax falls back to the [CoinGecko API](https://www.coingecko.com/en/api) (free tier, no API key required). Requests are rate-limited and cached per asset per date, so importing large files may take a moment. Note that the free tier is limited to one year of historical data, so any asset prices from > 1 year ago, that are not found in csv price files, will result in a failed call to CoinGecko and a 0 cost basis.

Fiat-to-fiat conversions (e.g. USD → DKK) are handled by the [Frankfurter API](https://www.frankfurter.app), backed by European Central Bank data — free and no API key required.

Prices are **daily snapshots** — intra-day price movements are not captured, so the values used may differ slightly from the exact price at the time of your transaction. This is generally acceptable for tax reporting purposes, but you should verify the results against your own records.

## Contributing

Contributions are welcome! There are two great ways to help:

- **Add tax rules for new countries** — see `src/lib/types/tax-rules.ts` for the JSON schema that country rule files follow, and `src/lib/rules/` for existing examples.
- **Add exchange importers** — see `src/lib/importers/` for existing importers (Binance, Ledger) to use as a reference.

## Built with Claude Code

This project was built with the help of [Claude Code](https://claude.ai/code), Anthropic's agentic coding tool. Learning to develop software collaboratively with agentic AI was a deliberate part of this project — exploring what that workflow looks like in practice, where it helps, and where it falls short.

## License

[Apache 2.0](LICENSE)
