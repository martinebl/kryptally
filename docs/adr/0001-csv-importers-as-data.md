# 1. Single-row CSV importers are data, not code

Date: 2026-10-14

## Status

Accepted

## Context

Most exchange exports map one CSV row to one transaction. Writing a class per format duplicated parsing, validation and leg-building logic, and users couldn't add formats themselves. Tax rules are already JSON interpreted by the engine; importers can follow the same model.

## Decision

- Single-row formats are described by `CustomImporterConfig` and interpreted by one engine (`src/lib/importers/custom/`). Built-ins ship as JSON; users' configs live in IndexedDB. Formats that assemble several rows into one transaction (Binance) remain code.
- Columns are referenced by header name, not position, and detection matches a set of required header names. The header row may be located automatically (first line containing all required columns) or after a fixed number of skipped rows.
- Values provided by the file are always kept with their own currency ticker; conversion is enrichment's job. A buy/sell quoted in a non-fiat (incl. stablecoins) is a `trade`.
- Dates go through a fixed list of preset formats — never `new Date(string)`.

## Consequences

- New simple formats need no code; the existing per-importer test suites now run against the JSON configs as a parity check.
- The config schema is versioned (`schemaVersion: 1`); stored configs with an unknown version are skipped, so future changes need a migration.
- `exchangeName` comes from config and is part of the transaction dedup key, so renaming an importer doesn't relabel past imports.
