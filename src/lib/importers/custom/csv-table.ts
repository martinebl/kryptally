import Papa from 'papaparse';
import type { CustomImporterConfig } from '$lib/types';

export type TableOptions = Pick<CustomImporterConfig, 'header' | 'delimiter' | 'requiredColumns'>;

export interface Table {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

/** How far auto mode looks for the header row before giving up and using line 0. */
const MAX_PREAMBLE_LINES = 25;

const splitFields = (line: string, delimiter: string): string[] =>
  (Papa.parse<string[]>(line, { delimiter }).data[0] ?? []).map((f) => f.trim());

/** Without required columns to look for, the widest line is the best header guess (preambles are narrow). */
const widestLineIndex = (fieldsPerLine: string[][]): number => {
  const widths = fieldsPerLine.map((fields) => fields.filter((f) => f !== '').length);
  return widths.indexOf(Math.max(0, ...widths));
};

const headerLineIndex = (lines: string[], options: TableOptions): number => {
  if (options.header.mode === 'skip') return options.header.rows;
  const fieldsPerLine = lines.slice(0, MAX_PREAMBLE_LINES).map((line) => splitFields(line, options.delimiter));
  if (options.requiredColumns.length === 0) return Math.max(widestLineIndex(fieldsPerLine), 0);
  const index = fieldsPerLine.findIndex((fields) => options.requiredColumns.every((c) => fields.includes(c)));
  return Math.max(index, 0);
};

/** Drops the preamble so the returned text starts at the header row. */
const fromHeader = (csv: string, options: TableOptions): string => {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/);
  return lines.slice(headerLineIndex(lines, options)).join('\n').trim();
};

const papaOptions = (delimiter: string) => ({
  header: true,
  delimiter,
  skipEmptyLines: 'greedy' as const,
  transformHeader: (h: string) => h.trim(),
});

/** Parses a CSV into header-keyed rows, locating the header per the config. */
export function readTable(csv: string, options: TableOptions): Table {
  const text = fromHeader(csv, options);
  if (text === '') return { headers: [], rows: [], errors: [] };
  const result = Papa.parse<Record<string, string>>(text, papaOptions(options.delimiter));
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    errors: result.errors.map((e) => (e.row !== undefined ? `Row ${e.row + 1}: ${e.message}` : e.message)),
  };
}

/** Cheap header-only read, for detection and the editor's column pickers. */
export function readHeaders(csv: string, options: TableOptions): string[] {
  const text = fromHeader(csv, options);
  if (text === '') return [];
  return Papa.parse(text, { ...papaOptions(options.delimiter), preview: 1 }).meta.fields ?? [];
}
