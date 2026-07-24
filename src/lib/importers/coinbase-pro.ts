import Papa from 'papaparse';
import BigNumber from 'bignumber.js';
import type { Transaction, IExchangeImporter, IImportPreprocessor } from '$lib/types';
import { missingColumns, parseHeaders, parseIsoTimestamp } from '$lib/importers/csv-util';

interface CoinbaseProFillsRow {
  'portfolio': string;
  'trade id': string;
  'product': string;
  'side': string;
  'created at': string;
  'size': string;
  'size unit': string;
  'price': string;
  'fee': string;
  'total': string;
  'price/fee/total unit': string;
}

const REQUIRED_COLUMNS = [
  'portfolio',
  'trade id',
  'product',
  'side',
  'created at',
  'size',
  'size unit',
  'price',
  'fee',
  'total',
  'price/fee/total unit',
] as const;

const resolveSide = (rawSide: string): 'buy' | 'sell' => {
  const side = rawSide.trim().toLowerCase();
  if (side === 'buy') return 'buy';
  if (side === 'sell') return 'sell';
  throw new Error(`Unrecognized Coinbase Pro fill side: "${rawSide}"`);
};

/** Strips currency symbols before numeric parsing, same convention as coinbase.ts. */
const toNumeric = (raw: string): string => (raw ?? '').replace(/[^0-9.-]/g, '');

const parseAmount = (raw: string): BigNumber => new BigNumber(toNumeric(raw)).abs();

/** Blank or zero fee means "no fee recorded". */
const parseFee = (raw: string): BigNumber | undefined => {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return undefined;
  const value = new BigNumber(toNumeric(trimmed)).abs();
  return value.isNaN() || value.isZero() ? undefined : value;
};

/**
 * A fill's `total` is already the fiat leg inclusive of fees (size * price,
 * with the fee added for a buy or netted out for a sell) — Coinbase has
 * already done that math, so it's used directly rather than recomputed from
 * size/price/fee.
 */
const rowToTransaction = (row: CoinbaseProFillsRow, index: number): Transaction => {
  const type = resolveSide(row['side']);
  const cryptoAsset = row['size unit'].trim();
  const cryptoAmount = parseAmount(row['size']);
  const fiatCurrency = row['price/fee/total unit'].trim();
  const fiatValue = parseAmount(row['total']);
  const fee = parseFee(row['fee']);

  const legs =
    type === 'buy'
      ? { fromAsset: fiatCurrency, fromAmount: fiatValue, toAsset: cryptoAsset, toAmount: cryptoAmount }
      : { fromAsset: cryptoAsset, fromAmount: cryptoAmount, toAsset: fiatCurrency, toAmount: fiatValue };

  return {
    id: `coinbase-pro-${row['trade id']}-${index}`,
    date: parseIsoTimestamp(row['created at'], 'Coinbase Pro'),
    type,
    ...legs,
    ...(fee ? { feeAsset: fiatCurrency, feeAmount: fee } : {}),
    fiatCurrency,
    fiatValue,
    exchange: 'Coinbase Pro',
  };
};

export class CoinbaseProImporter implements IExchangeImporter {
  readonly exchangeName = 'Coinbase Pro';

  // Fills are always a complete buy/sell — never an inbound transfer with
  // fiat data attached — so reclassify-inbound-as-buys never applies here.
  readonly preprocessors: IImportPreprocessor[] = [];

  detect(csv: string): boolean {
    const headers = parseHeaders(csv);
    return missingColumns(headers, REQUIRED_COLUMNS).length === 0;
  }

  parse(csv: string): Transaction[] {
    const trimmed = csv.trim();
    if (trimmed.length === 0) {
      throw new Error('CSV is empty');
    }

    const result = Papa.parse<CoinbaseProFillsRow>(trimmed, {
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
