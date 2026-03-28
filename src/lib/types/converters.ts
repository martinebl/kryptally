import type BigNumber from 'bignumber.js';
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

/** Converts a crypto asset to its fiat value at a given point in time */
export interface ICryptoToFiatConverter {
  /** Returns the price of 1 unit of `asset` in `fiatCurrency` at `datetime` */
  getRate(asset: string, fiatCurrency: string, datetime: Date): Promise<BigNumber>;
}

/** Converts between two fiat currencies on a given date */
export interface IFiatConverter {
  /** Returns the exchange rate from `fromCurrency` to `toCurrency` on `date` (i.e. 1 fromCurrency = X toCurrency) */
  getRate(fromCurrency: string, toCurrency: string, date: Date): Promise<BigNumber>;
}
