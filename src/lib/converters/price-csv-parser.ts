import Papa from 'papaparse';

/** Which columns to read from the CSV */
export interface ColumnMapping {
  dateCol: number;
  priceCol: number;
}

export interface DetectionResult {
  mapping: ColumnMapping;
  /** true if both columns were identified by name with confidence */
  confident: boolean;
}

const DATE_HEADER_NAMES = ['date', 'time', 'timestamp', 'datetime', 'day'];
const PRICE_HEADER_NAMES = ['close', 'price', 'adj close', 'adjusted close', 'last', 'rate', 'value'];

/**
 * Try to detect date and price column indices from CSV header names.
 * Exported so the UI can show a confirmation step before committing.
 */
export const detectColumns = (headers: string[]): DetectionResult => {
  const normalized = headers.map(h => h.trim().toLowerCase());

  const dateCol = normalized.findIndex(h => DATE_HEADER_NAMES.some(n => h === n || h.startsWith(n)));
  const priceCol = normalized.findIndex(h => PRICE_HEADER_NAMES.some(n => h === n || h.includes(n)));

  if (dateCol !== -1 && priceCol !== -1) {
    return { mapping: { dateCol, priceCol }, confident: true };
  }

  return {
    mapping: { dateCol: dateCol !== -1 ? dateCol : 0, priceCol: priceCol !== -1 ? priceCol : 4 },
    confident: false,
  };
};

/**
 * Read only the header row from a CSV string.
 * Exported so the UI can populate column-selector dropdowns before a full parse.
 */
export const readCsvHeaders = (csv: string): string[] => {
  const { data } = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: 'greedy' });
  return data.length > 0 ? (data[0] as string[]) : [];
};

/** Month abbreviations for Yahoo Finance date format */
const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/**
 * Try to parse a date string in multiple formats into YYYY-MM-DD.
 * Returns null if no format matches.
 */
const parseDateKey = (raw: string): string | null => {
  const s = raw.trim();

  // ISO: 2026-04-01
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY/MM/DD: 2026/04/01
  const isoSlash = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (isoSlash) return `${isoSlash[1]}-${isoSlash[2]}-${isoSlash[3]}`;

  // Yahoo Finance: "Apr 1, 2026"
  const yahoo = s.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (yahoo) {
    const [, mon, day, year] = yahoo;
    if (!MONTHS[mon]) return null;
    return `${year}-${MONTHS[mon]}-${day.padStart(2, '0')}`;
  }

  // US format: MM/DD/YYYY
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, month, day, year] = us;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
};

/** Strip thousand-separator commas and parse as float */
const parsePrice = (raw: string): number => parseFloat(raw.replace(/,/g, ''));

/**
 * Parse a price CSV into a Map of YYYY-MM-DD → price.
 * If `mapping` is omitted, columns are auto-detected from the header row.
 */
export const parsePriceCSV = (csv: string, mapping?: ColumnMapping): Map<string, number> => {
  const { data } = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: 'greedy' });
  if (data.length === 0) return new Map();

  const headers = data[0] as string[];
  const resolved = mapping ?? detectColumns(headers).mapping;
  const result = new Map<string, number>();

  for (const row of data.slice(1)) {
    if (row.length < Math.max(resolved.dateCol, resolved.priceCol) + 1) continue;
    const dateKey = parseDateKey(row[resolved.dateCol]);
    if (!dateKey) continue;
    const price = parsePrice(row[resolved.priceCol]);
    if (!isNaN(price)) result.set(dateKey, price);
  }

  return result;
};
