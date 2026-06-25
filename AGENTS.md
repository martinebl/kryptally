# AGENTS.md

Cryptax is a local-first, privacy-first cryptocurrency tax calculator. Tax rules are defined as JSON files so the community can contribute rules for any country. The app runs in the browser or in Tauri — no private data leaves the user's machine.

## Commands

```bash
npm run check   # Type-check (svelte-check + tsc)
npm run test    # Run all tests (vitest run)
npm run test:watch # Run tests in watch mode
npm run dev     # Start dev server
npm run build   # Production build
npm run preview # Preview production build
```

## Stack

Vite + Svelte 5 + TypeScript + Tailwind CSS 4 + bignumber.js

## Architecture

- `$lib` alias maps to `src/lib`
- `src/lib/engine/` — tax computation logic (lot-tracker, calculators)
- `src/lib/types/` — shared TypeScript interfaces
- `src/lib/importers/` — exchange CSV parsers (Binance, Ledger, etc.)
- `src/lib/converters/` — price fetchers (CoinGecko, Frankfurter, CSV)
- `src/lib/rules/` — JSON tax rules per country

Modules expose functionality through barrel exports (`index.ts`). Use TypeScript interfaces to define the contract between modules — consumers import types, not implementation details.

## Key conventions

- **Each module should have a clear, single responsibility.** Expose functionality across modules via TypeScript interfaces, not concrete implementations.

- **BigNumber for all monetary/crypto amounts** — never native floats. This includes price maps (e.g. `Map<string, BigNumber>`), parsed CSV prices, rates, quantities, and any intermediate calculations.
- **Test files** use `.test.ts` suffix, placed next to the code they test.
- **Tax rules are JSON data** — the engine interprets them, no hardcoded country logic.
- **Absolute imports** via `$lib` alias only — no relative paths.
- **Functional style** — prefer map/filter/reduce, pure functions, `const` over `let`.
- **UI components should not contain business logic** — delegate to engine/lib.

## Testing

- Write tests before implementing new functionality (TDD).
- Test against the interface contract, not implementation details.
- **Never copy real dates or amounts from user-provided CSV snippets into test data.** Randomize them so tests are independent of real user data.
- Run `npm run test` after changes to catch regressions.

## Price resolution order

1. Local CSV files (user-imported, fully offline)
2. CoinGecko API (free tier, rate-limited, limited to ~1 year of history)
3. Frankfurter API (fiat-to-fiat via ECB data)

## No monorepo

Single npm package. No workspace, no multi-package boundaries.

## Tauri

`src-tauri/` is a Rust + Tauri v2 desktop wrapper that handles exchange API connections locally (no CORS issues, API keys stay on the user's machine).

`serde_json` uses the `arbitrary_precision` feature in `Cargo.toml`. This preserves every JSON number as an exact decimal string (no f64 truncation), ensuring lossless round-trips to the TypeScript `BigNumber` layer.

## Version

```bash
node scripts/bump-version.mjs <new-version>
git add -A && git commit -m "chore: bump to v<new-version>"
git tag v<new-version>
git push origin <branch> && git push origin v<new-version>
```

This syncs the version across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `version.json`.