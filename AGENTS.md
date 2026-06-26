# AGENTS.md

Kryptax is a local-first, privacy-first cryptocurrency tax calculator. Tax rules are defined as JSON files so the community can contribute rules for any country. The app runs in the browser or in Tauri — no private data leaves the user's machine.

## Commands

```bash
npm run check   # Type-check (svelte-check + tsc)
npm run test    # Run all tests (vitest run)
npm run test:watch # Run tests in watch mode
npm run dev     # Start dev server
npm run build   # Production build
npm run preview # Preview production build
```

Rust backend (run in `src-tauri/`):

```bash
cargo test    # Run Rust tests — NOT covered by `npm run test`
cargo clippy  # Lint / idiom enforcement
cargo fmt     # Format
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

### General
- **Look up framework docs instead of guessing.** If a Tailwind class, Svelte API, or any library feature doesn't work as expected, fetch the official docs directly rather than iterating through guesses.
- **Each module should have a clear, single responsibility.** Expose functionality across modules via TypeScript interfaces, not concrete implementations.
- **BigNumber for all monetary/crypto amounts** — never native floats. This includes price maps (e.g. `Map<string, BigNumber>`), parsed CSV prices, rates, quantities, and any intermediate calculations.
- **Test files** use `.test.ts` suffix, placed next to the code they test.
- **Tax rules are JSON data** — the engine interprets them, no hardcoded country logic.
- **Absolute imports** via `$lib` alias only — no relative paths.
- **Functional style** — prefer map/filter/reduce, pure functions, `const` over `let`.

### Svelte
- **UI components should not contain business logic** — delegate to engine/lib.
- **Effects** - never use effects if it can be avoided. Use native change handlers bound to inputs, or derived states instead
- **Magic numbers** - don't put random hardcoded numbers in styling or tailwind classes. The base tailwind numbers (like p-1) is fine, but custom px values, are almost always worth reusing as a spacing token configured in the theme. This also applies to color codes.
- **No monolith components** - components are not supposed to be massive and unreadable. Once a component crosses 300 lines, consider splitting it up into smaller sub components

### Rust (Tauri backend)
- **Avoid `mut`** — bindings are immutable by default; only add `let mut` when there is no way around it, or when the performance cost of using immutable copies is too high.
- **Propagate errors with `?`**, adding context via `.map_err(|e| format!("...: {e}"))`. Avoid `.unwrap()`/`.expect()` outside `run()` setup and tests.
- **Thin `#[tauri::command]` wrappers** — delegate to plain module functions so logic stays free of Tauri types and testable.
- **One module per concern** — an exchange per file (`binance.rs`, `revolut_x.rs`), shared infrastructure isolated (`secrets.rs`).
- **No magic values** — hoist URLs, service names, and windows to module-level `const` (e.g. `BASE_URL`, `RECV_WINDOW_MS`).

## Testing

- Write tests before implementing new functionality (TDD).
- Test against the interface contract, not implementation details.
- **Never copy real dates or amounts from user-provided CSV snippets into test data.** Randomize them so tests are independent of real user data.
- Run `npm run test` and `cargo test` after changes to catch regressions.

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