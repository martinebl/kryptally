# Cryptax

An open-source cryptocurrency tax calculator that runs entirely in your browser. No data leaves your machine.

Cryptax uses community-contributed JSON files to define tax rules for each country, so it can support any jurisdiction without hardcoding country-specific logic.

## Features

- **Local-first** — all computation happens in your browser, your data stays on your device
- **Multi-country** — tax rules are defined as JSON, making it easy to add support for new countries
- **CSV import** — bring your transaction exports from any exchange
- **Multiple cost basis methods** — FIFO, LIFO, HIFO, and average cost

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

Contributions are welcome! In particular, adding tax rules for new countries is a great way to help. See the `src/lib/types/tax-rules.ts` file for the schema that country rule files follow.

## License

[Apache 2.0](LICENSE)
