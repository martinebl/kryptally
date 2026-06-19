# AGENTS.md

## Commands

```bash
npm run check   # Type-check (svelte-check + tsc)
npm run test    # Run all tests (vitest run)
npm run dev     # Start dev server
npm run build   # Production build
npm run preview # Preview production build
```

## CI

Two workflows:

| Workflow | Trigger | Purpose |
|---|---|---|
| `deploy.yml` | Push to `main` | Test → Build → Deploy browser version to GitHub Pages |
| `release-tauri.yml` | Tag push `v*` or manual `workflow_dispatch` | Test → Build Tauri on Linux/macOS/Windows → Create GitHub Release with binaries |

CI order is always `test` → `build`.

## Stack

Vite + Svelte 5 + TypeScript + Tailwind CSS 4 + bignumber.js

## Architecture

- `$lib` alias maps to `src/lib`
- `src/lib/engine/` — tax computation logic (lot-tracker, calculators)
- `src/lib/types/` — shared TypeScript interfaces
- `src/lib/importers/` — exchange CSV parsers (Binance, Ledger, etc.)
- `src/lib/converters/` — price fetchers (CoinGecko, Frankfurter, CSV)
- `src/lib/rules/` — JSON tax rules per country

## Key conventions

- **BigNumber for all monetary/crypto amounts** — never native floats. Price maps, CSV prices, quantities, intermediate calc all use `bignumber.js`.
- **Test files** use `.test.ts` suffix, placed next to the code they test.
- **Tax rules are JSON data** — the engine interprets them, no hardcoded country logic.
- **Absolute imports** via `$lib` alias only — no relative paths.
- **Functional style** — prefer map/filter/reduce, pure functions, `const` over `let`.
- **UI components should not contain business logic** — delegate to engine/lib.

## Testing

- Write tests before implementing new functionality (TDD).
- Test against the interface contract, not implementation details.
- **Never copy real dates or amounts from user-provided CSV snippets into test data.** Randomize them so tests are independent of real user data.

## Price resolution order

1. Local CSV files (user-imported, fully offline)
2. CoinGecko API (free tier, rate-limited, limited to ~1 year of history)
3. Frankfurter API (fiat-to-fiat via ECB data)

## No monorepo

Single npm package. No workspace, no multi-package boundaries.

## Tauri

`src-tauri/` is a Rust + Tauri v2 desktop wrapper that handles exchange API connections locally (no CORS issues, API keys stay on the user's machine).

### Registered commands (`src-tauri/src/lib.rs`)

**Binance** (HMAC-SHA256 signed GET):
- `binance_fetch_account`, `binance_fetch_trades`, `binance_fetch_deposits`, `binance_fetch_withdrawals`
- `binance_save_credentials`, `binance_clear_credentials`, `binance_has_credentials`

**Revolut X** (Ed25519 signed GET, cursor pagination, rate-limit backoff with UI events):
- `revolut_x_fetch_trades`, `revolut_x_fetch_orders`, `revolut_x_fetch_balances`, `revolut_x_fetch_pairs`
- `revolut_x_save_credentials`, `revolut_x_clear_credentials`, `revolut_x_has_credentials`

### Credential storage

API keys are stored in the OS keyring via the `keyring` crate (`src-tauri/src/secrets.rs`). Supported backends: Apple Keychain, Windows Credential Manager, Linux secret-service.

### Rust serde precision

`serde_json` uses the `arbitrary_precision` feature in `Cargo.toml`. This preserves every JSON number as an exact decimal string (no f64 truncation), ensuring lossless round-trips to the TypeScript `BigNumber` layer.

### Product naming

- Frontend/README: **Kryptax**
- `tauri.conf.json` identifier: `com.cryptax.app`, title `Cryptax` (no "K")
- `Cargo.toml` name: `app`, description `Cryptax desktop wrapper`

## Version management

Single source of truth: `version.json` at the repo root.

To bump the version across all files:

```bash
node scripts/bump-version.mjs 0.2.0
```

This syncs the version to `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `version.json`.

## Release process

1. **Bump version**
   ```bash
   node scripts/bump-version.mjs <new-version>
   ```

2. **Commit and tag**
   ```bash
   git add -A
   git commit -m "chore: bump to v<new-version>"
   git tag v<new-version>
   git push origin <branch> && git push origin v<new-version>
   ```

3. **CI handles the rest** — the `release-tauri.yml` workflow:
   - Runs tests
   - Builds Tauri on Linux, macOS, Windows in parallel
   - Generates release notes from conventional commits since the last tag
   - Creates a GitHub Release with all platform binaries attached

4. **Manual trigger** — if needed, run the workflow from the Actions tab with `workflow_dispatch` and optionally set `prerelease: true`.

### Release notes format

Commit messages following [conventional commits](https://www.conventionalcommits.org/) are auto-grouped with emoji prefixes:

- `feat:` → :sparkles: (feature)
- `fix:` → :bug: (bug fix)
- `docs:` → :books: (documentation)
- `chore:` → :wrench: (maintenance)
- `ci:` → :gear: (CI/CD)
- `test:` → :white_check_mark: (tests)
- `refactor:` → :recycle: (refactor)
- `perf:` → :zap: (performance)

Non-conventional commits are included as-is. Pre-release tags (containing `-rc`, `-alpha`, `-beta`) are marked as pre-release on GitHub.