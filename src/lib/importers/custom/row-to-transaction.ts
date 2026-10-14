import BigNumber from 'bignumber.js';
import type { CustomImporterConfig, RowKind, Transaction, TransactionType, TypeRule } from '$lib/types';
import { isIsoFiat } from '$lib/converters/fiat-currencies';
import { parseDateWithFormats } from '$lib/importers/custom/parse-date';
import { parseDecimal, parseMoneyCell } from '$lib/importers/custom/parse-number';

type Row = Record<string, string>;

const cell = (row: Row, column: string | undefined): string => (column ? (row[column] ?? '').trim() : '');

const ruleMatches = (rule: TypeRule, value: string): boolean => {
  const target = rule.value.trim().toLowerCase();
  if (rule.match === 'equals') return value === target;
  if (rule.match === 'startsWith') return value.startsWith(target);
  return value.includes(target);
};

const resolveKind = (config: CustomImporterConfig, row: Row): RowKind => {
  if (config.type.mode === 'fixed') return config.type.kind;
  const raw = cell(row, config.columns.type);
  const value = raw.toLowerCase();
  const kind = config.type.rules.find((rule) => ruleMatches(rule, value))?.kind ?? config.type.fallback;
  if (!kind) throw new Error(`Unrecognized type "${raw}"`);
  return kind;
};

/** Reads a money column as a positive amount plus any embedded currency. Blank/zero → no amount. */
const readMoney = (config: CustomImporterConfig, row: Row, column: string | undefined) => {
  const money = parseMoneyCell(cell(row, column), config.decimalSeparator);
  const amount = money?.amount.abs();
  return {
    amount: amount && !amount.isZero() ? amount : undefined,
    currency: money?.currency,
  };
};

/** The row's value in the quote currency: the total column, else amount × price. */
const readValue = (config: CustomImporterConfig, row: Row, amount: BigNumber) => {
  if (config.columns.total) return readMoney(config, row, config.columns.total);
  if (!config.columns.price) return { amount: undefined, currency: undefined };
  const price = readMoney(config, row, config.columns.price);
  return { amount: price.amount && !amount.isZero() ? price.amount.times(amount) : undefined, currency: price.currency };
};

const resolveQuote = (config: CustomImporterConfig, row: Row, embedded: string | undefined): string | undefined => {
  const source = config.quoteCurrency;
  const quote =
    source?.mode === 'fixed' ? source.value
    : source?.mode === 'column' ? cell(row, source.column)
    : source?.mode === 'embedded' ? embedded
    : undefined;
  // Kept as written: the legs are part of the dedup content key.
  return quote?.trim() || undefined;
};

const resolveFeeCurrency = (
  config: CustomImporterConfig,
  row: Row,
  context: { asset: string; quote: string | undefined; embedded: string | undefined },
): string | undefined => {
  const source = config.feeCurrency ?? { mode: 'quote' };
  const currency =
    source.mode === 'fixed' ? source.value
    : source.mode === 'column' ? cell(row, source.column)
    : source.mode === 'embedded' ? context.embedded
    : source.mode === 'asset' ? context.asset
    : context.quote ?? (config.feeCurrency ? undefined : context.asset);
  return currency?.trim() || undefined;
};

const INBOUND_KINDS: ReadonlySet<RowKind> = new Set(['buy', 'transfer-in', 'staking', 'mining', 'airdrop']);

const KIND_TO_TYPE: Record<Exclude<RowKind, 'ignore'>, TransactionType> = {
  buy: 'buy',
  sell: 'sell',
  'trade-out': 'trade',
  'transfer-in': 'transfer',
  'transfer-out': 'transfer',
  'transfer-by-sign': 'transfer',
  staking: 'staking',
  mining: 'mining',
  airdrop: 'airdrop',
  fee: 'fee',
};

/**
 * Buys/sells against a non-fiat quote (BTC, USDT, …) are crypto→crypto
 * trades: the engine only disposes the `from` leg for `trade`/`sell`, so a
 * `buy` paid in USDT would never consume the USDT lots.
 */
const resolveType = (kind: Exclude<RowKind, 'ignore'>, quote: string | undefined): TransactionType =>
  (kind === 'buy' || kind === 'sell') && quote !== undefined && !isIsoFiat(quote) ? 'trade' : KIND_TO_TYPE[kind];

const mapRow = (config: CustomImporterConfig, row: Row, index: number): Transaction | null => {
  const kind = resolveKind(config, row);
  if (kind === 'ignore') return null;

  const asset = cell(row, config.columns.asset);
  const signedAmount = parseDecimal(cell(row, config.columns.amount), config.decimalSeparator);
  const amount = signedAmount.abs();
  const value = readValue(config, row, amount);
  const quote = resolveQuote(config, row, value.currency);
  const fee = readMoney(config, row, config.columns.fee);
  const feeAsset = resolveFeeCurrency(config, row, { asset, quote, embedded: fee.currency });

  const inbound = kind === 'transfer-by-sign' ? !signedAmount.isNegative() : INBOUND_KINDS.has(kind);
  const assetLeg = inbound ? { toAsset: asset, toAmount: amount } : { fromAsset: asset, fromAmount: amount };
  // A provided value is never dropped; the quote keeps its own ticker and
  // enrichment converts it to the tax currency later.
  const priced = value.amount && quote ? { currency: quote, amount: value.amount } : undefined;
  const quoteLeg =
    priced && kind === 'buy' ? { fromAsset: priced.currency, fromAmount: priced.amount }
    : priced && kind === 'sell' ? { toAsset: priced.currency, toAmount: priced.amount }
    : {};

  const txId = cell(row, config.columns.txId);
  const notes = cell(row, config.columns.notes);

  return {
    id: `${config.id}-${txId || 'row'}-${index}`,
    date: parseDateWithFormats(cell(row, config.columns.date), config.dateFormats, config.timezone),
    type: resolveType(kind, quote),
    ...assetLeg,
    ...quoteLeg,
    ...(fee.amount && feeAsset ? { feeAsset, feeAmount: fee.amount } : {}),
    ...(priced ? { fiatCurrency: priced.currency, fiatValue: priced.amount } : {}),
    exchange: config.name,
    ...(notes ? { notes: `${config.notesPrefix ?? ''}${notes}` } : {}),
  };
};

/** Maps one CSV row to a Transaction, or null for rows the config ignores. Errors carry the 1-based row number. */
export const rowToTransaction =
  (config: CustomImporterConfig) =>
  (row: Row, index: number): Transaction | null => {
    try {
      return mapRow(config, row, index);
    } catch (e) {
      throw new Error(`Row ${index + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
