import type { CustomImporterConfig, IExchangeImporter, IImportPreprocessor, Transaction } from '$lib/types';
import { PREPROCESSORS } from '$lib/preprocessors';
import { missingColumns } from '$lib/importers/csv-util';
import { readHeaders, readTable } from '$lib/importers/custom/csv-table';
import { rowToTransaction } from '$lib/importers/custom/row-to-transaction';

/** Builds a working importer from a declarative config. */
export function createCustomImporter(
  config: CustomImporterConfig,
  registry: Readonly<Record<string, IImportPreprocessor>> = PREPROCESSORS,
): IExchangeImporter {
  const preprocessors = config.preprocessors
    .map((id) => registry[id])
    .filter((p): p is IImportPreprocessor => p !== undefined);

  return {
    exchangeName: config.name,
    preprocessors,

    detect(csv: string): boolean {
      try {
        const headers = readHeaders(csv, config);
        return config.requiredColumns.length > 0 && missingColumns(headers, config.requiredColumns).length === 0;
      } catch {
        return false;
      }
    },

    parse(csv: string): Transaction[] {
      if (csv.trim().length === 0) throw new Error('CSV is empty');

      const table = readTable(csv, config);
      if (table.errors.length > 0) throw new Error(`CSV parse error: ${table.errors[0]}`);

      const missing = missingColumns(table.headers, config.requiredColumns);
      if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(', ')}`);

      return table.rows
        .map(rowToTransaction(config))
        .filter((tx): tx is Transaction => tx !== null);
    },
  };
}
