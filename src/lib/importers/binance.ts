import Papa from 'papaparse';
import BigNumber from 'bignumber.js';
import type { Transaction, TransactionType, IExchangeImporter, IImportPreprocessor } from '$lib/types';
import { missingColumns, parseHeaders } from '$lib/importers/csv-util';

interface BinanceRow {
  'User ID': string;
  'Time': string;
  'Account': string;
  'Operation': string;
  'Coin': string;
  'Change': string;
  'Remark': string;
}

const REQUIRED_COLUMNS = [
  'User ID', 'Time', 'Account', 'Operation', 'Coin', 'Change',
] as const;

/** Max seconds between rows to consider them part of the same group */
const GROUP_WINDOW_SECONDS = 2;

/** Parse Binance's "YY-MM-DD HH:mm:ss" format as UTC */
const parseDate = (raw: string): Date => {
  const [datePart, timePart] = raw.split(' ');
  const [yy, mm, dd] = datePart.split('-');
  return new Date(`20${yy}-${mm}-${dd}T${timePart}Z`);
};

interface ParsedRow {
  date: Date;
  timestamp: number;
  operation: string;
  coin: string;
  change: BigNumber;
}

const parseRow = (row: BinanceRow): ParsedRow => {
  const date = parseDate(row['Time']);
  return {
    date,
    timestamp: date.getTime(),
    operation: row['Operation'].trim(),
    coin: row['Coin'].trim(),
    change: new BigNumber(row['Change']),
  };
};

const isFeeOperation = (op: string): boolean =>
  op === 'Fee' || op === 'Transaction Fee';

/**
 * Group rows that are within GROUP_WINDOW_SECONDS of each other.
 */
const groupRelatedRows = (rows: ParsedRow[]): ParsedRow[][] => {
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  const groups: ParsedRow[][] = [];
  let current: ParsedRow[] = [];

  for (const row of sorted) {
    if (current.length === 0 || row.timestamp - current[0].timestamp <= GROUP_WINDOW_SECONDS * 1000) {
      current.push(row);
    } else {
      groups.push(current);
      current = [row];
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
};

/**
 * Merge rows that share the same coin by summing their change values.
 * Returns one ParsedRow per unique coin, keeping the earliest row's metadata.
 */
const mergeSameCoin = (rows: ParsedRow[]): ParsedRow[] => {
  const byCoin = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const existing = byCoin.get(row.coin) ?? [];
    existing.push(row);
    byCoin.set(row.coin, existing);
  }

  return [...byCoin.entries()].map(([coin, coinRows]) => {
    const earliest = coinRows.reduce((a, b) => (a.timestamp <= b.timestamp ? a : b));
    const totalChange = coinRows.reduce((sum, r) => sum.plus(r.change), new BigNumber(0));
    return { ...earliest, coin, change: totalChange };
  });
};

/**
 * Split a time-grouped set of rows into sub-groups when multiple distinct
 * assets were bought/received at the same time (e.g. BTC + ETH limit orders
 * filling simultaneously). Each inflow coin becomes its own sub-group,
 * paired with a proportional share of outflows and fees.
 */
const splitGroup = (group: ParsedRow[]): ParsedRow[][] => {
  // Deposit + auto-conversion is a single logical operation — never split
  if (group.some((r) => r.operation === 'Deposit')) return [group];

  const feeRows = group.filter((r) => isFeeOperation(r.operation));
  const nonFeeRows = group.filter((r) => !isFeeOperation(r.operation));

  const inflows = nonFeeRows.filter((r) => r.change.isPositive());
  const outflows = nonFeeRows.filter((r) => r.change.isNegative());

  const uniqueInflowCoins = [...new Set(inflows.map((r) => r.coin))];

  // Simple case: 0 or 1 inflow coin → single sub-group
  if (uniqueInflowCoins.length <= 1) {
    return [group];
  }

  // Multiple inflow coins: split into one sub-group per inflow coin
  const totalInflowValue = inflows.reduce((sum, r) => sum.plus(r.change.abs()), new BigNumber(0));

  return uniqueInflowCoins.map((coin) => {
    const coinInflows = inflows.filter((r) => r.coin === coin);
    const coinInflowValue = coinInflows.reduce((sum, r) => sum.plus(r.change.abs()), new BigNumber(0));
    const proportion = totalInflowValue.isZero()
      ? new BigNumber(1)
      : coinInflowValue.div(totalInflowValue);

    // Proportional share of outflows
    const proportionalOutflows = outflows.map((r) => ({
      ...r,
      change: r.change.times(proportion),
    }));

    // Proportional share of fees
    const proportionalFees = feeRows.map((r) => ({
      ...r,
      change: r.change.times(proportion),
    }));

    return [...coinInflows, ...proportionalOutflows, ...proportionalFees];
  });
};

const resolveGroupType = (rows: ParsedRow[]): TransactionType => {
  const operations = rows.map((r) => r.operation);

  const hasBuy = operations.some((op) => op === 'Buy' || op === 'Transaction Buy');
  const hasSell = operations.some((op) => op === 'Sell' || op === 'Transaction Sell');
  if (hasBuy && hasSell) return 'trade';
  if (hasBuy) return 'buy';
  if (hasSell) return 'sell';
  if (operations.some((op) => op.includes('Staking'))) return 'staking';
  if (operations.some((op) => op === 'Distribution')) return 'airdrop';

  // Deposit + auto-conversion: deposit of X immediately swapped to Y → buy
  const depositRows = rows.filter((r) => r.operation === 'Deposit');
  if (depositRows.length > 0) {
    const hasOtherCoin = rows.some((r) => r.operation !== 'Deposit' && r.coin !== depositRows[0].coin);
    return hasOtherCoin ? 'buy' : 'transfer';
  }

  if (operations.some((op) => op === 'Withdraw')) return 'transfer';

  // Two "Transaction Related" / "Transaction Spend" rows with different coins = trade
  const nonFee = rows.filter((r) => !isFeeOperation(r.operation));
  const inflows = nonFee.filter((r) => r.change.isPositive());
  const outflows = nonFee.filter((r) => r.change.isNegative());
  if (inflows.length > 0 && outflows.length > 0) return 'trade';

  return 'transfer';
};

const groupToTransaction = (group: ParsedRow[], index: number): Transaction => {
  const type = resolveGroupType(group);
  const earliest = group.reduce((a, b) => (a.timestamp <= b.timestamp ? a : b));

  // Deposit + auto-conversion: use the deposit row as "from" and the converted
  // coin as "to", bypassing mergeSameCoin which would net the deposited coin to zero.
  const depositRow = group.find((r) => r.operation === 'Deposit');
  if (type === 'buy' && depositRow) {
    const conversionInflows = mergeSameCoin(
      group.filter((r) => r.operation !== 'Deposit' && !isFeeOperation(r.operation) && r.change.isPositive()),
    );
    const toRow = conversionInflows[0];
    const feeRows = mergeSameCoin(group.filter((r) => isFeeOperation(r.operation)));
    return {
      id: `binance-${earliest.timestamp}-${index}`,
      date: earliest.date,
      type: 'buy',
      fromAsset: depositRow.coin,
      fromAmount: depositRow.change.abs(),
      ...(toRow ? { toAsset: toRow.coin, toAmount: toRow.change.abs() } : {}),
      ...(feeRows[0] ? { feeAsset: feeRows[0].coin, feeAmount: feeRows[0].change.abs() } : {}),
      exchange: 'Binance',
    };
  }

  const feeRows = mergeSameCoin(group.filter((r) => isFeeOperation(r.operation)));
  const nonFeeRows = mergeSameCoin(group.filter((r) => !isFeeOperation(r.operation)))
    .filter((r) => !r.change.isZero());

  const inflows = nonFeeRows.filter((r) => r.change.isPositive());
  const outflows = nonFeeRows.filter((r) => r.change.isNegative());

  const toRow = inflows[0];
  const fromRow = outflows[0];
  const feeRow = feeRows[0];

  return {
    id: `binance-${earliest.timestamp}-${index}`,
    date: earliest.date,
    type,
    ...(fromRow ? { fromAsset: fromRow.coin, fromAmount: fromRow.change.abs() } : {}),
    ...(toRow ? { toAsset: toRow.coin, toAmount: toRow.change.abs() } : {}),
    ...(feeRow ? { feeAsset: feeRow.coin, feeAmount: feeRow.change.abs() } : {}),
    exchange: 'Binance',
  };
};

export class BinanceImporter implements IExchangeImporter {
  readonly exchangeName = 'Binance';
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

    const result = Papa.parse<BinanceRow>(trimmed, {
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

    const rows = result.data.map(parseRow);
    const groups = groupRelatedRows(rows);
    const subGroups = groups.flatMap(splitGroup);

    return subGroups.map(groupToTransaction);
  }
}
