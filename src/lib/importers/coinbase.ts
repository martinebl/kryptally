import Papa from 'papaparse';
import BigNumber from 'bignumber.js';
import type { Transaction, TransactionType, IExchangeImporter, IImportPreprocessor } from '$lib/types';
import { reclassifyInboundAsBuys } from '$lib/preprocessors/reclassify-inbound-as-buys';
import { missingColumns, parseHeaders, parseIsoTimestamp, toNumeric } from '$lib/importers/csv-util';

interface CoinbaseRow {
  'Timestamp': string;
  'Transaction Type': string;
  'Asset': string;
  'Quantity Transacted': string;
  'Price Currency': string;
  'Price at Transaction': string;
  'Subtotal': string;
  'Total (inclusive of fees and/or spread)': string;
  'Fees and/or Spread': string;
  'Notes': string;
}

const REQUIRED_COLUMNS = [
  'Timestamp',
  'Transaction Type',
  'Asset',
  'Quantity Transacted',
  'Price Currency',
  'Price at Transaction',
  'Subtotal',
  'Total (inclusive of fees and/or spread)',
  'Fees and/or Spread',
  'Notes',
] as const;

/**
 * Real Coinbase exports lead with a "Transactions" title line and a
 * "User,<name>,<id>" line before the actual header row. Locate the header by
 * its two most stable columns rather than assuming line 0 is the header.
 */
const HEADER_MARKERS = ['Timestamp', 'Transaction Type'] as const;

const stripPreamble = (csv: string): string => {
  const lines = csv.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const fields = line.split(',').map((f) => f.trim());
    return HEADER_MARKERS.every((marker) => fields.includes(marker));
  });
  return headerIndex <= 0 ? csv : lines.slice(headerIndex).join('\n');
};

interface TypeRule {
  type: TransactionType;
  direction: 'in' | 'out';
}

/**
 * Coinbase's exact "Transaction Type" strings for reward-style rows (staking,
 * Coinbase Earn, learning rewards) aren't confirmed from official docs, so
 * these are matched by keyword rather than exact string.
 */
const resolveRule = (rawType: string, signedQuantity: BigNumber): TypeRule => {
  const type = rawType.trim().toLowerCase();
  if (type === 'buy') return { type: 'buy', direction: 'in' };
  if (type === 'sell') return { type: 'sell', direction: 'out' };
  if (type === 'send') return { type: 'transfer', direction: 'out' };
  if (type === 'receive') return { type: 'transfer', direction: 'in' };
  if (type === 'convert') return { type: 'trade', direction: 'out' };
  if (type.includes('staking') || type.includes('rewards income')) return { type: 'staking', direction: 'in' };
  if (type.includes('learning') || type.includes('earn')) return { type: 'airdrop', direction: 'in' };
  // Unrecognized type (e.g. fiat "Deposit"/"Exchange Deposit"/"Pro Withdrawal"
  // rows): Coinbase names these from the other account's perspective, not
  // this ledger's, so the sign of Quantity Transacted is the reliable
  // direction signal rather than the type string.
  return { type: 'transfer', direction: signedQuantity.isNegative() ? 'out' : 'in' };
};

/**
 * Coinbase's export uses "YYYY-MM-DD HH:mm:ss UTC" — not ISO 8601. Native
 * `Date` parsing of that non-standard format is engine-dependent (works in
 * V8/Node, but returns Invalid Date in WebKit, which is what Tauri uses on
 * Linux), so build a strict ISO 8601 string instead of trusting `new Date()`
 * with the raw value. Matches binance.ts's parseDate for the same reason.
 *
 * A raw value that's already strict ISO 8601 is passed through as-is (spec
 * guarantees cross-engine parsing for that format), via the shared
 * `parseIsoTimestamp` helper — which also rejects anything matching neither
 * shape rather than handing it to `new Date()`.
 */
const COINBASE_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/;

const parseTimestamp = (raw: string): Date => {
  const match = raw.trim().match(COINBASE_TIMESTAMP_RE);
  if (match) return new Date(`${match[1]}T${match[2]}Z`);
  return parseIsoTimestamp(raw, 'Coinbase');
};

const parseSignedQuantity = (raw: string): BigNumber => new BigNumber(toNumeric(raw));

/** Blank or zero fiat fields mean "not recorded", same convention as ledger.ts's countervalue parsing. */
const parseFiatField = (raw: string): BigNumber | undefined => {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return undefined;
  const value = new BigNumber(toNumeric(trimmed)).abs();
  return value.isNaN() || value.isZero() ? undefined : value;
};

const rowToTransaction = (row: CoinbaseRow, index: number): Transaction => {
  const signedQuantity = parseSignedQuantity(row['Quantity Transacted']);
  const { type, direction } = resolveRule(row['Transaction Type'], signedQuantity);
  const asset = row['Asset'].trim();
  const quantity = signedQuantity.abs();
  const fiatCurrency = row['Price Currency']?.trim() || undefined;
  const fiatValue = parseFiatField(row['Total (inclusive of fees and/or spread)']);
  const fee = parseFiatField(row['Fees and/or Spread']);
  const notes = row['Notes']?.trim();

  const assetLeg = direction === 'in' ? { toAsset: asset, toAmount: quantity } : { fromAsset: asset, fromAmount: quantity };

  // Buy/sell also carry the fiat counter-leg: Coinbase's CSV is one row per
  // asset, so the fiat side of a trade is only known via Total, not a second row.
  const fiatLeg =
    fiatCurrency && fiatValue && type === 'buy'
      ? { fromAsset: fiatCurrency, fromAmount: fiatValue }
      : fiatCurrency && fiatValue && type === 'sell'
        ? { toAsset: fiatCurrency, toAmount: fiatValue }
        : {};

  return {
    id: `coinbase-${row['Timestamp']}-${index}`,
    date: parseTimestamp(row['Timestamp']),
    type,
    ...assetLeg,
    ...fiatLeg,
    ...(fee && fiatCurrency ? { feeAsset: fiatCurrency, feeAmount: fee } : {}),
    ...(fiatCurrency && fiatValue ? { fiatCurrency, fiatValue } : {}),
    exchange: 'Coinbase',
    ...(notes ? { notes } : {}),
  };
};

export class CoinbaseImporter implements IExchangeImporter {
  readonly exchangeName = 'Coinbase';

  readonly preprocessors: IImportPreprocessor[] = [
    reclassifyInboundAsBuys,
  ];

  detect(csv: string): boolean {
    const headers = parseHeaders(stripPreamble(csv));
    return missingColumns(headers, REQUIRED_COLUMNS).length === 0;
  }

  parse(csv: string): Transaction[] {
    const trimmed = csv.trim();
    if (trimmed.length === 0) {
      throw new Error('CSV is empty');
    }

    const result = Papa.parse<CoinbaseRow>(stripPreamble(trimmed), {
      header: true,
      skipEmptyLines: 'greedy',
    });

    if (result.errors.length > 0) {
      throw new Error(`CSV parse error: ${result.errors[0].message}`);
    }

    const headers = result.meta.fields ?? [];
    const missing = missingColumns(headers, REQUIRED_COLUMNS);
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(', ')}`);
    }

    return result.data.map(rowToTransaction);
  }
}
