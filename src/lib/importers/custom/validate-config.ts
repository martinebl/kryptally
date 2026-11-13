import type { CustomImporterConfig, FeeCurrencySource, QuoteCurrencySource } from '$lib/types';
import { DATE_FORMAT_IDS, MATCH_MODES, ROW_KINDS } from '$lib/types';
import { PREPROCESSORS } from '$lib/preprocessors';

const isBlank = (s: string | undefined): boolean => (s ?? '').trim() === '';

const checkSchema = (c: CustomImporterConfig): string[] =>
  c.schemaVersion === 1 ? [] : [`Unsupported schema version ${c.schemaVersion}`];

const checkName = (c: CustomImporterConfig, takenNames: readonly string[]): string[] => {
  if (isBlank(c.name)) return ['Name is required'];
  const taken = takenNames.some((n) => n.trim().toLowerCase() === c.name.trim().toLowerCase());
  return taken ? [`An importer named "${c.name.trim()}" already exists`] : [];
};

const checkHeader = (c: CustomImporterConfig): string[] =>
  c.header.mode === 'skip' && !(Number.isInteger(c.header.rows) && c.header.rows >= 0)
    ? ['Rows to skip must be a whole number ≥ 0']
    : [];

const CORE_COLUMNS = [
  ['date', 'Date'],
  ['asset', 'Asset'],
  ['amount', 'Amount'],
] as const;

const checkColumns = (c: CustomImporterConfig): string[] => {
  const missing = CORE_COLUMNS.filter(([key]) => isBlank(c.columns[key])).map(([, label]) => `${label} column is required`);
  const requiredCheck = c.requiredColumns.length === 0 ? ['At least one required column is needed for detection'] : [];
  // Core columns are read on every row, so a file without them can't parse.
  const notRequired = [
    ...CORE_COLUMNS.map(([key, label]) => [c.columns[key], label] as const),
    ...(c.type.mode === 'column' ? [[c.columns.type, 'Type'] as const] : []),
  ]
    .filter(([column]) => !isBlank(column) && !c.requiredColumns.includes(column!))
    .map(([column, label]) => `${label} column "${column}" must be a required column`);
  return [...missing, ...requiredCheck, ...notRequired];
};

const checkDates = (c: CustomImporterConfig): string[] => [
  ...(c.dateFormats.length === 0 ? ['Pick at least one date format'] : []),
  ...c.dateFormats.filter((f) => !DATE_FORMAT_IDS.includes(f)).map((f) => `Unknown date format "${f}"`),
];

const checkType = (c: CustomImporterConfig): string[] => {
  if (c.type.mode === 'fixed') {
    return ROW_KINDS.includes(c.type.kind) ? [] : [`Unknown transaction kind "${c.type.kind}"`];
  }
  const { rules, fallback } = c.type;
  return [
    ...(isBlank(c.columns.type) ? ['Type column is required when the type comes from a column'] : []),
    ...(rules.length === 0 && !fallback ? ['Add at least one type rule or a fallback'] : []),
    ...rules.flatMap((rule, i) => [
      ...(isBlank(rule.value) ? [`Type rule ${i + 1} needs a value`] : []),
      ...(MATCH_MODES.includes(rule.match) ? [] : [`Type rule ${i + 1} has an unknown match mode`]),
      ...(ROW_KINDS.includes(rule.kind) ? [] : [`Type rule ${i + 1} has an unknown kind`]),
    ]),
    ...(fallback && !ROW_KINDS.includes(fallback) ? [`Unknown fallback kind "${fallback}"`] : []),
  ];
};

const checkCurrencySource = (label: string, source: QuoteCurrencySource | FeeCurrencySource | undefined): string[] => {
  if (source?.mode === 'fixed' && isBlank(source.value)) return [`${label} value is required`];
  if (source?.mode === 'column' && isBlank(source.column)) return [`${label} column is required`];
  return [];
};

const checkCurrencies = (c: CustomImporterConfig): string[] => [
  ...(!c.quoteCurrency && (!isBlank(c.columns.total) || !isBlank(c.columns.price))
    ? ['A quote currency is required when a price or total column is mapped']
    : []),
  ...checkCurrencySource('Quote currency', c.quoteCurrency),
  ...checkCurrencySource('Fee currency', c.feeCurrency),
];

const checkPreprocessors = (c: CustomImporterConfig): string[] =>
  c.preprocessors.filter((id) => !PREPROCESSORS[id]).map((id) => `Unknown preprocessor "${id}"`);

/** Returns human-readable problems with a config; empty means it's usable. */
export function validateConfig(config: CustomImporterConfig, takenNames: readonly string[]): string[] {
  return [
    ...checkSchema(config),
    ...checkName(config, takenNames),
    ...checkHeader(config),
    ...checkColumns(config),
    ...checkDates(config),
    ...checkType(config),
    ...checkCurrencies(config),
    ...checkPreprocessors(config),
  ];
}
