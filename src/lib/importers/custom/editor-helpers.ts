import type { CustomImporterConfig, RowKind, Transaction, TypeRule } from '$lib/types';
import { createCustomImporter } from '$lib/importers/custom/create-custom-importer';

/** A blank draft for the importer editor. */
export const emptyConfig = (id: string): CustomImporterConfig => ({
  schemaVersion: 1,
  id,
  name: '',
  header: { mode: 'auto' },
  requiredColumns: [],
  delimiter: ',',
  decimalSeparator: '.',
  dateFormats: ['iso'],
  timezone: 'utc',
  columns: { date: '', asset: '', amount: '' },
  type: { mode: 'column', rules: [] },
  preprocessors: [],
});

const DELIMITER_CANDIDATES: readonly CustomImporterConfig['delimiter'][] = [',', ';', '\t'];

const SNIFF_LINES = 25;

/** Picks the delimiter that yields the widest line among the first few (header rows are wide, preambles narrow). */
export const guessDelimiter = (csv: string): CustomImporterConfig['delimiter'] => {
  const lines = csv.split(/\r?\n/).slice(0, SNIFF_LINES);
  const widest = (d: string) => Math.max(0, ...lines.map((l) => l.split(d).length));
  return DELIMITER_CANDIDATES.reduce((best, d) => (widest(d) > widest(best) ? d : best));
};

const freeName = (base: string, takenNames: readonly string[]): string => {
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  const candidates = [`${base} (copy)`, ...Array.from({ length: 98 }, (_, i) => `${base} (copy ${i + 2})`)];
  return candidates.find((c) => !taken.has(c.toLowerCase())) ?? `${base} (copy ${Date.now()})`;
};

/** Deep-copies a config (e.g. a built-in) into an editable user config. */
export const duplicateConfig = (
  source: CustomImporterConfig,
  id: string,
  takenNames: readonly string[],
): CustomImporterConfig => ({
  ...structuredClone(source),
  id,
  name: freeName(source.name, takenNames),
});

/** Distinct, trimmed, non-blank values of a column, in first-seen order. */
export const distinctColumnValues = (rows: Record<string, string>[], column: string | undefined): string[] =>
  column ? [...new Set(rows.map((r) => (r[column] ?? '').trim()).filter((v) => v !== ''))] : [];

const KIND_KEYWORDS: readonly [RowKind, readonly string[]][] = [
  ['staking', ['staking', 'stake', 'interest', 'reward']],
  ['airdrop', ['airdrop', 'bonus', 'learn']],
  ['mining', ['mining', 'mined']],
  ['fee', ['fee']],
  ['buy', ['buy', 'bought', 'purchase']],
  ['sell', ['sell', 'sold']],
  ['transfer-in', ['deposit', 'receive', 'received', 'incoming']],
  ['transfer-out', ['withdraw', 'send', 'sent', 'outgoing']],
];

/** Best-effort default kind for a type value, so the user only fixes the odd ones. */
export const guessKind = (value: string): RowKind => {
  const lower = value.toLowerCase();
  return KIND_KEYWORDS.find(([, words]) => words.some((w) => lower.includes(w)))?.[0] ?? 'ignore';
};

const matches = (rule: TypeRule, value: string): boolean => {
  const v = value.trim().toLowerCase();
  const target = rule.value.trim().toLowerCase();
  return rule.match === 'equals' ? v === target : rule.match === 'startsWith' ? v.startsWith(target) : v.includes(target);
};

/** Appends an `equals` rule (with a guessed kind) for every value no rule covers yet. */
export const addRulesForValues = (rules: TypeRule[], values: readonly string[]): TypeRule[] => [
  ...rules,
  ...values
    .filter((v) => !rules.some((r) => matches(r, v)))
    .map((value): TypeRule => ({ match: 'equals', value, kind: guessKind(value) })),
];

export interface PreviewResult {
  transactions: Transaction[];
  total: number;
  error?: string;
}

/** Parses a sample with the draft config for the live preview; never throws. */
export const previewImport = (config: CustomImporterConfig, sample: string, limit: number): PreviewResult => {
  try {
    const transactions = createCustomImporter(config).parse(sample);
    return { transactions: transactions.slice(0, limit), total: transactions.length };
  } catch (e) {
    return { transactions: [], total: 0, error: e instanceof Error ? e.message : String(e) };
  }
};
