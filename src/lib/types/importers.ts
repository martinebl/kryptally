import type { Transaction } from './transaction';

/** A focused, toggleable transformation applied to imported transactions */
export interface IImportPreprocessor {
  /** Machine-readable identifier (e.g. "reclassify-inbound-as-buys") */
  readonly id: string;

  /** Human-readable label shown in the UI */
  readonly label: string;

  /** Short explanation of what this preprocessor does */
  readonly description: string;

  /** Returns true if this preprocessor would transform the given transaction */
  isEligible(tx: Transaction): boolean;

  /** Transform a list of transactions. If selectedIds is provided, only those transactions are transformed. */
  apply(transactions: Transaction[], selectedIds?: Set<string>): Transaction[];
}

/** Parses an exchange-specific CSV into normalized Transactions */
export interface IExchangeImporter {
  /** Human-readable name of the exchange (e.g. "Ledger") */
  readonly exchangeName: string;

  /** Preprocessors that are relevant for this importer's output */
  readonly preprocessors: IImportPreprocessor[];

  /** Parse raw CSV text into Transactions */
  parse(csv: string): Transaction[];
}