import Papa from 'papaparse';

/**
 * Parse only the header row of a CSV. Used by both `detect()` (cheap sniff) and
 * `parse()` (strict validation) so column requirements have a single source of
 * truth per importer.
 */
export function parseHeaders(csv: string): string[] {
  if (csv.trim().length === 0) return [];
  const result = Papa.parse(csv, { header: true, preview: 1, skipEmptyLines: 'greedy' });
  return result.meta.fields ?? [];
}

/** Returns the required columns not present in the given headers. */
export function missingColumns(
  headers: string[],
  required: readonly string[],
): string[] {
  return required.filter((c) => !headers.includes(c));
}