import Papa from 'papaparse';
import BigNumber from 'bignumber.js';
import type { Transaction, TransactionType, IExchangeImporter, IImportPreprocessor } from '$lib/types';
import { reclassifyInboundAsBuys } from '$lib/preprocessors/reclassify-inbound-as-buys';

interface LedgerRow {
  'Operation Date': string;
  'Currency Ticker': string;
  'Operation Type': string;
  'Operation Amount': string;
  'Operation Fees': string;
  'Operation Hash': string;
  'Countervalue Ticker'?: string;
  'Countervalue at Operation Date'?: string;
}

const INBOUND_TYPES = new Set(['IN', 'NFT_IN']);
const OUTBOUND_TYPES = new Set(['OUT', 'NFT_OUT']);
const FEE_TYPES = new Set(['FEES']);

const REQUIRED_COLUMNS = [
  'Operation Date',
  'Currency Ticker',
  'Operation Type',
  'Operation Amount',
  'Operation Fees',
  'Operation Hash',
] as const;

const resolveType = (opType: string): TransactionType => {
  if (INBOUND_TYPES.has(opType) || OUTBOUND_TYPES.has(opType)) return 'transfer';
  if (FEE_TYPES.has(opType)) return 'fee';
  return 'transfer';
};

const isInbound = (opType: string): boolean =>
  INBOUND_TYPES.has(opType);

const parseCountervalue = (row: LedgerRow): { fiatCurrency?: string; fiatValue?: BigNumber } => {
  const ticker = row['Countervalue Ticker']?.trim() ?? '';
  const rawValue = row['Countervalue at Operation Date']?.trim() ?? '';

  if (ticker === '' || rawValue === '') {
    return {};
  }

  const value = new BigNumber(rawValue);
  return value.isNaN() || value.isZero()
    ? {}
    : { fiatCurrency: ticker, fiatValue: value };
};

const rowToTransaction = (row: LedgerRow): Transaction => {
  const opType = row['Operation Type'];
  const ticker = row['Currency Ticker'];
  const amount = new BigNumber(row['Operation Amount']).abs();
  const fees = new BigNumber(row['Operation Fees']).abs();
  const hash = row['Operation Hash'];
  const type = resolveType(opType);
  const inbound = isInbound(opType);
  const { fiatCurrency, fiatValue } = parseCountervalue(row);

  return {
    id: `ledger-${hash}`,
    date: new Date(row['Operation Date']),
    type,
    ...(inbound
      ? { toAsset: ticker, toAmount: amount }
      : { fromAsset: ticker, fromAmount: amount }),
    ...(fees.isGreaterThan(0)
      ? { feeAsset: ticker, feeAmount: fees }
      : {}),
    fiatCurrency,
    fiatValue,
    exchange: 'Ledger',
    notes: `tx: ${hash}`,
  };
};

export class LedgerImporter implements IExchangeImporter {
  readonly exchangeName = 'Ledger';

  readonly preprocessors: IImportPreprocessor[] = [
    reclassifyInboundAsBuys,
  ];

  parse(csv: string): Transaction[] {
    const trimmed = csv.trim();
    if (trimmed.length === 0) {
      throw new Error('CSV is empty');
    }

    const result = Papa.parse<LedgerRow>(trimmed, {
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

    return result.data.map(rowToTransaction);
  }
}