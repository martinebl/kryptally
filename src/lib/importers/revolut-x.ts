import Papa from 'papaparse';
import BigNumber from 'bignumber.js';
import type { Transaction, TransactionType, IExchangeImporter, IImportPreprocessor } from '$lib/types';

interface RevolutXRow {
  Symbol: string;
  Type: string;
  Quantity: string;
  Price: string;
  Value: string;
  Fees: string;
  Date: string;
}

const REQUIRED_COLUMNS = [
  'Symbol', 'Type', 'Quantity', 'Price', 'Value', 'Fees', 'Date',
] as const;

const KNOWN_CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
};

/**
 * Parse a value string that may be currency-prefixed ("$1280.00")
 * or currency-suffixed ("500.00 DKK").
 * Returns the numeric amount and the currency code, or undefined if empty.
 */
const parseCurrencyValue = (raw: string): { amount: BigNumber; currency: string } | undefined => {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  // Check for symbol prefix (e.g. "$1280.00", "€500")
  const firstChar = trimmed[0];
  const mappedCurrency = KNOWN_CURRENCY_SYMBOLS[firstChar];
  if (mappedCurrency) {
    const amount = new BigNumber(trimmed.slice(1).replace(/,/g, ''));
    return amount.isNaN() ? undefined : { amount, currency: mappedCurrency };
  }

  // Otherwise expect "1280.00 DKK" format
  const lastSpaceIdx = trimmed.lastIndexOf(' ');
  if (lastSpaceIdx === -1) return undefined;

  const numPart = trimmed.slice(0, lastSpaceIdx).replace(/,/g, '');
  const currPart = trimmed.slice(lastSpaceIdx + 1);
  const amount = new BigNumber(numPart);
  return amount.isNaN() ? undefined : { amount, currency: currPart };
};

const resolveType = (rowType: string): TransactionType | 'skip' => {
  const normalized = rowType.trim().toLowerCase();
  if (normalized === 'other') return 'skip';
  if (normalized.startsWith('buy')) return 'buy';
  if (normalized.startsWith('sell')) return 'sell';
  if (normalized === 'send') return 'transfer';
  if (normalized === 'receive') return 'transfer';
  if (normalized === 'learn reward') return 'airdrop';
  return 'transfer';
};

const isInbound = (rowType: string): boolean => {
  const normalized = rowType.trim().toLowerCase();
  return normalized === 'receive';
};

const rowToTransaction = (row: RevolutXRow, index: number): Transaction | undefined => {
  const type = resolveType(row.Type);
  if (type === 'skip') return undefined;

  const symbol = row.Symbol.trim();
  const quantity = new BigNumber(row.Quantity || '0');
  const value = parseCurrencyValue(row.Value);
  const fees = parseCurrencyValue(row.Fees);
  const date = new Date(row.Date);

  const zeroFee = !fees || fees.amount.isZero();

  if (type === 'buy') {
    return {
      id: `revolut-x-${date.getTime()}-${index}`,
      date,
      type: 'buy',
      toAsset: symbol,
      toAmount: quantity,
      ...(value ? { fromAsset: value.currency, fromAmount: value.amount } : {}),
      ...(value ? { fiatCurrency: value.currency, fiatValue: value.amount } : {}),
      ...(!zeroFee ? { feeAsset: fees!.currency, feeAmount: fees!.amount } : {}),
      exchange: 'Revolut X',
    };
  }

  if (type === 'sell') {
    return {
      id: `revolut-x-${date.getTime()}-${index}`,
      date,
      type: 'sell',
      fromAsset: symbol,
      fromAmount: quantity,
      ...(value ? { toAsset: value.currency, toAmount: value.amount } : {}),
      ...(value ? { fiatCurrency: value.currency, fiatValue: value.amount } : {}),
      ...(!zeroFee ? { feeAsset: fees!.currency, feeAmount: fees!.amount } : {}),
      exchange: 'Revolut X',
    };
  }

  if (type === 'airdrop') {
    return {
      id: `revolut-x-${date.getTime()}-${index}`,
      date,
      type: 'airdrop',
      toAsset: symbol,
      toAmount: quantity,
      ...(value ? { fiatCurrency: value.currency, fiatValue: value.amount } : {}),
      exchange: 'Revolut X',
    };
  }

  // transfer (Send / Receive)
  const inbound = isInbound(row.Type);
  return {
    id: `revolut-x-${date.getTime()}-${index}`,
    date,
    type: 'transfer',
    ...(inbound
      ? { toAsset: symbol, toAmount: quantity }
      : { fromAsset: symbol, fromAmount: quantity }),
    ...(value ? { fiatCurrency: value.currency, fiatValue: value.amount } : {}),
    ...(!zeroFee ? { feeAsset: fees!.currency, feeAmount: fees!.amount } : {}),
    exchange: 'Revolut X',
  };
};

export class RevolutXImporter implements IExchangeImporter {
  readonly exchangeName = 'Revolut X';
  readonly preprocessors: IImportPreprocessor[] = [];

  parse(csv: string): Transaction[] {
    const trimmed = csv.trim();
    if (trimmed.length === 0) {
      throw new Error('CSV is empty');
    }

    const result = Papa.parse<RevolutXRow>(trimmed, {
      header: true,
      skipEmptyLines: 'greedy',
    });

    if (result.errors.length > 0) {
      throw new Error(`CSV parse error: ${result.errors[0].message}`);
    }

    const headers = result.meta.fields ?? [];
    const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      throw new Error(`Missing required columns: ${missing.join(', ')}`);
    }

    return result.data
      .map((row, i) => rowToTransaction(row, i))
      .filter((tx): tx is Transaction => tx !== undefined);
  }
}
