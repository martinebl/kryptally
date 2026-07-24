import Papa from 'papaparse';
import BigNumber from 'bignumber.js';
import type { Transaction, TransactionType, IExchangeImporter, IImportPreprocessor } from '$lib/types';
import { reclassifyInboundAsBuys } from '$lib/preprocessors/reclassify-inbound-as-buys';
import { missingColumns, parseHeaders } from '$lib/importers/csv-util';

interface CoinbaseRow {
  'Timestamp': string;
  'Transaction Type': string;
  'Asset': string;
  'Quantity Transacted': string;
  'Spot Price Currency': string;
  'Spot Price at Transaction': string;
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
  'Spot Price Currency',
  'Spot Price at Transaction',
  'Subtotal',
  'Total (inclusive of fees and/or spread)',
  'Fees and/or Spread',
  'Notes',
] as const;

interface TypeRule {
  type: TransactionType;
  direction: 'in' | 'out';
}

/**
 * Coinbase's exact "Transaction Type" strings for reward-style rows (staking,
 * Coinbase Earn, learning rewards) aren't confirmed from official docs, so
 * these are matched by keyword rather than exact string.
 */
const resolveRule = (rawType: string): TypeRule => {
  const type = rawType.trim().toLowerCase();
  if (type === 'buy') return { type: 'buy', direction: 'in' };
  if (type === 'sell') return { type: 'sell', direction: 'out' };
  if (type === 'send') return { type: 'transfer', direction: 'out' };
  if (type === 'receive') return { type: 'transfer', direction: 'in' };
  if (type === 'convert') return { type: 'trade', direction: 'out' };
  if (type.includes('staking') || type.includes('rewards income')) return { type: 'staking', direction: 'in' };
  if (type.includes('learning') || type.includes('earn')) return { type: 'airdrop', direction: 'in' };
  // Unrecognized type: keep the row as an inbound transfer rather than
  // dropping it, matching ledger.ts's default-to-transfer convention.
  return { type: 'transfer', direction: 'in' };
};

const parseQuantity = (raw: string): BigNumber => new BigNumber(raw).abs();

/** Blank or zero fiat fields mean "not recorded", same convention as ledger.ts's countervalue parsing. */
const parseFiatField = (raw: string): BigNumber | undefined => {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return undefined;
  const value = new BigNumber(trimmed).abs();
  return value.isNaN() || value.isZero() ? undefined : value;
};

const rowToTransaction = (row: CoinbaseRow, index: number): Transaction => {
  const { type, direction } = resolveRule(row['Transaction Type']);
  const asset = row['Asset'].trim();
  const quantity = parseQuantity(row['Quantity Transacted']);
  const fiatCurrency = row['Spot Price Currency']?.trim() || undefined;
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
    date: new Date(row['Timestamp']),
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
    const headers = parseHeaders(csv);
    return missingColumns(headers, REQUIRED_COLUMNS).length === 0;
  }

  parse(csv: string): Transaction[] {
    const trimmed = csv.trim();
    if (trimmed.length === 0) {
      throw new Error('CSV is empty');
    }

    const result = Papa.parse<CoinbaseRow>(trimmed, {
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
