import BigNumber from 'bignumber.js';
import { toNumeric } from '$lib/importers/csv-util';

export type DecimalSeparator = '.' | ',';

const NUMERIC = /^-?(\d+\.?\d*|\.\d+)$/;
const EXPONENT = /^-?(\d+\.?\d*|\.\d+)e[-+]?\d+$/i;

/** Normalizes thousands/decimal separators to a plain dot-decimal string. */
const normalizeSeparators = (raw: string, decimalSeparator: DecimalSeparator): string =>
  decimalSeparator === ','
    ? raw.replace(/[.\s]/g, '').replace(',', '.')
    : raw.replace(/[,\s]/g, '');

/**
 * Parses a numeric cell into a BigNumber. Blank means zero; currency symbols
 * and codes are stripped. Throws on anything that isn't a number.
 */
export function parseDecimal(raw: string | undefined, decimalSeparator: DecimalSeparator): BigNumber {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return new BigNumber(0);
  // Checked before symbol stripping, which would eat the "e".
  if (EXPONENT.test(trimmed)) return new BigNumber(trimmed);
  const numeric = toNumeric(normalizeSeparators(trimmed, decimalSeparator));
  if (!NUMERIC.test(numeric)) throw new Error(`Invalid number "${raw}"`);
  return new BigNumber(numeric);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
};

const CODE_SUFFIX = /\s([A-Za-z]{2,10})$/;
const CODE_PREFIX = /^([A-Za-z]{2,10})\s/;

const embeddedCurrency = (trimmed: string): string | undefined => {
  const symbol = CURRENCY_SYMBOLS[trimmed[0]];
  if (symbol) return symbol;
  const code = CODE_SUFFIX.exec(trimmed)?.[1] ?? CODE_PREFIX.exec(trimmed)?.[1];
  return code?.toUpperCase();
};

/**
 * Parses a money cell that may carry its own currency ("$1,280.00", "€5",
 * "500.00 DKK", "SEK 18,5"). Returns undefined for a blank cell.
 */
export function parseMoneyCell(
  raw: string | undefined,
  decimalSeparator: DecimalSeparator,
): { amount: BigNumber; currency: string | undefined } | undefined {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return undefined;
  return { amount: parseDecimal(trimmed, decimalSeparator), currency: embeddedCurrency(trimmed) };
}
