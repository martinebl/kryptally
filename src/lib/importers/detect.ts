import type { IExchangeImporter } from '$lib/types';

/**
 * Returns all importers whose `detect()` accepts the given CSV text.
 * - Empty array: unknown / unsupported format.
 * - Single entry: unambiguous match.
 * - Multiple entries: ambiguous — caller should ask the user to disambiguate.
 */
export function detectExchange(
  csv: string,
  importers: IExchangeImporter[],
): IExchangeImporter[] {
  return importers.filter((i) => i.detect(csv));
}