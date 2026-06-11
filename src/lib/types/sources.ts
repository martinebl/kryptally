import type { Transaction } from './transaction';
import type { IImportPreprocessor } from './importers';

export interface LiveSourceFetchParams {
  /** Inclusive lower bound for transaction dates. */
  from?: Date;
  /** Inclusive upper bound for transaction dates. */
  to?: Date;
  /** Optional pair symbols, used by exchanges that require pair-by-pair queries (e.g. Binance). */
  symbols?: string[];
}

/**
 * Fetches transactions directly from an exchange API. Parallel to IExchangeImporter,
 * but pulls from a network source instead of parsing a user-supplied CSV.
 *
 * Implementations rely on platform features (Tauri commands, OS keyring) that are
 * unavailable in a plain browser, so isAvailable() returns false on the web build.
 */
export interface ILiveSource {
  /** Human-readable name of the exchange (e.g. "Binance"). */
  readonly exchangeName: string;

  /** Preprocessors that are relevant for this source's output. */
  readonly preprocessors: IImportPreprocessor[];

  /** True when the current runtime supports this source (e.g. desktop app only). */
  isAvailable(): boolean;

  /** True when persistent credentials are already on file. */
  hasCredentials(): Promise<boolean>;

  /** Persist API credentials (typically to the OS keyring). */
  saveCredentials(apiKey: string, secret: string): Promise<void>;

  /** Remove any persisted credentials. */
  clearCredentials(): Promise<void>;

  /** Fetch and map remote transactions for the given window. */
  fetch(params: LiveSourceFetchParams): Promise<Transaction[]>;
}
