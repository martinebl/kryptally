/**
 * Declarative description of a single-row-per-transaction CSV format.
 * Interpreted by `createCustomImporter` — built-in simple importers ship as
 * JSON in this shape, and users can create their own on the Importers page.
 */

/** How a CSV row maps onto the transaction model. */
export type RowKind =
  | 'buy'
  | 'sell'
  /** Crypto→crypto disposal where only the outgoing side is in the row (e.g. Coinbase "Convert"). */
  | 'trade-out'
  | 'transfer-in'
  | 'transfer-out'
  /** Transfer whose direction is the amount's sign: negative = outgoing. */
  | 'transfer-by-sign'
  | 'staking'
  | 'mining'
  | 'airdrop'
  | 'fee'
  | 'ignore';

export const ROW_KINDS: readonly RowKind[] = [
  'buy', 'sell', 'trade-out', 'transfer-in', 'transfer-out', 'transfer-by-sign',
  'staking', 'mining', 'airdrop', 'fee', 'ignore',
];

/** Type-column matching is trimmed and case-insensitive. */
export type MatchMode = 'equals' | 'startsWith' | 'contains';

export const MATCH_MODES: readonly MatchMode[] = ['equals', 'startsWith', 'contains'];

export type DateFormatId =
  | 'iso'
  | 'YYYY-MM-DD HH:mm:ss'
  | 'YYYY-MM-DD HH:mm:ss UTC'
  | 'DD/MM/YYYY HH:mm'
  | 'MM/DD/YYYY HH:mm'
  | 'DD.MM.YYYY HH:mm'
  | 'D MMM YYYY, HH:mm[:ss]'
  | 'unix-s'
  | 'unix-ms';

export const DATE_FORMAT_IDS: readonly DateFormatId[] = [
  'iso',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm:ss UTC',
  'DD/MM/YYYY HH:mm',
  'MM/DD/YYYY HH:mm',
  'DD.MM.YYYY HH:mm',
  'D MMM YYYY, HH:mm[:ss]',
  'unix-s',
  'unix-ms',
];

export interface TypeRule {
  match: MatchMode;
  value: string;
  kind: RowKind;
}

export type RowTypeConfig =
  | { mode: 'fixed'; kind: RowKind }
  /** Rules are tried in order; first match wins. No match and no fallback → row error. */
  | { mode: 'column'; rules: TypeRule[]; fallback?: RowKind };

export type QuoteCurrencySource =
  | { mode: 'fixed'; value: string }
  | { mode: 'column'; column: string }
  /** Currency is part of the money cell itself: "$1,280.00", "€5", "500.00 DKK". */
  | { mode: 'embedded' };

export type FeeCurrencySource =
  | QuoteCurrencySource
  | { mode: 'asset' }
  | { mode: 'quote' };

export type HeaderConfig =
  /** The header is the first line containing every required column. */
  | { mode: 'auto' }
  | { mode: 'skip'; rows: number };

export interface ColumnMapping {
  date: string;
  asset: string;
  amount: string;
  type?: string;
  /** Unit price in the quote currency; value = amount × price. Ignored when `total` is mapped. */
  price?: string;
  /** Total value in the quote currency. */
  total?: string;
  fee?: string;
  txId?: string;
  notes?: string;
}

export interface CustomImporterConfig {
  schemaVersion: 1;
  /** Stable identity; prefixes transaction ids. Built-ins use a slug, user configs a uuid. */
  id: string;
  /** Becomes `exchangeName` and `tx.exchange` — part of the dedup key, so keep it stable. */
  name: string;
  header: HeaderConfig;
  /** Columns that must be present; also the signature `detect()` matches on. */
  requiredColumns: string[];
  delimiter: ',' | ';' | '\t';
  decimalSeparator: '.' | ',';
  /** Tried in order. */
  dateFormats: DateFormatId[];
  /** Applies only to formats without an explicit offset. */
  timezone: 'utc' | 'local';
  /** Header names. Columns not listed in `requiredColumns` may be absent from a file. */
  columns: ColumnMapping;
  notesPrefix?: string;
  type: RowTypeConfig;
  quoteCurrency?: QuoteCurrencySource;
  /** Defaults to the quote currency, falling back to the asset. */
  feeCurrency?: FeeCurrencySource;
  /** Ids from the preprocessor registry. */
  preprocessors: string[];
}
