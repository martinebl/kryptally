# Cryptax

An open-source cryptocurrency tax reporting tool that runs in your browser. Your transaction data stays on your machine — the only external requests are for historical exchange rates (crypto and fiat prices) needed to compute gains and losses.

The core feature is **gains and losses tracking** — Cryptax computes your realized gains and losses across all your crypto transactions using industry-standard cost basis methods. This gives you the numbers you need to fill in your tax return.

> **Disclaimer:** Any tax estimates shown by Cryptax are rough approximations for informational purposes only. They are **not** legal or financial advice. Accurate tax calculation depends on your full financial picture (salary, other income, deductions, etc.), which is outside the scope of this tool. Always consult a qualified tax professional for your specific situation.

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
git clone https://github.com/martinebl/cryptax.git
cd cryptax
npm install
npm run dev
```

Then open the URL shown in your terminal (usually `http://localhost:5173`).

### Building for production

```bash
npm run build
npm run preview
```

## Contributing

Contributions are welcome! There are two great ways to help:

- **Add tax rules for new countries** — see `src/lib/types/tax-rules.ts` for the JSON schema that country rule files follow, and `src/lib/rules/` for existing examples.
- **Add exchange importers** — see `src/lib/importers/` for existing importers (Binance, Ledger) to use as a reference.

## License

[Apache 2.0](LICENSE)
