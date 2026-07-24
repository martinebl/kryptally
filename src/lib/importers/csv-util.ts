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

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Parses a strict ISO 8601 timestamp, throwing rather than falling back to
 * `new Date(raw)` on anything else. Native `Date` parsing of non-ISO formats
 * is engine-dependent (works in V8/Node, but can return Invalid Date in
 * WebKit, which is what Tauri uses on Linux) — a silent fallback would just
 * reintroduce that bug. `context` names the caller for the error message.
 */
export function parseIsoTimestamp(raw: string, context: string): Date {
  const trimmed = raw.trim();
  if (!ISO_8601_RE.test(trimmed)) {
    throw new Error(`Unrecognized ${context} timestamp format: "${raw}"`);
  }
  return new Date(trimmed);
}