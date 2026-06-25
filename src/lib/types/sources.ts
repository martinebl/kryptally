import type { Transaction } from './transaction';
import type { IImportPreprocessor } from './importers';

export interface LiveSourceFetchParams {
  /** Inclusive lower bound for transaction dates. */
  from?: Date;
  /** Inclusive upper bound for transaction dates. */
  to?: Date;
  /** Optional pair symbols, used by exchanges that require pair-by-pair queries (e.g. Binance). */
  symbols?: string[];
  /**
   * Called as fetching progresses, for sources that fan out into many requests
   * (e.g. Revolut X chunks a wide range into ≤30-day windows). `completed` counts
   * finished requests out of `total`.
   */
  onProgress?: (progress: { completed: number; total: number }) => void;
  /**
   * Called when the source hits an upstream rate limit and is waiting before it
   * retries, so the UI can show a countdown instead of appearing to hang.
   * `waitMs` is how long the source will wait before the next attempt.
   */
  onRateLimit?: (info: { waitMs: number }) => void;
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

  /**
   * Whether the user must supply pair symbols to fetch. Defaults to true.
   * Sources that pull account-wide (e.g. Revolut X orders) set this false so
   * the UI hides the symbols input.
   */
  readonly requiresSymbols?: boolean;

  /**
   * Whether the user must supply a bounded date range to fetch. Defaults to false.
   * Sources whose API only serves bounded windows (e.g. Revolut X, ≤30 days per
   * query) set this true so the UI requires both dates.
   */
  readonly requiresDateRange?: boolean;

  /** Placeholder for the pair-symbols input (exchanges format symbols differently). */
  readonly symbolPlaceholder?: string;

  /** Help text shown under the symbols input (e.g. what is/isn't fetched). */
  readonly symbolsNote?: string;

  /** Structured list of what the live connector does / does not fetch, for the UI card. */
  readonly whatFetches?: Array<{ label: string; included: boolean }>;

  /** Label for the API key credential field. */
  readonly keyLabel?: string;

  /** Label for the secret credential field (e.g. "API secret" or "Private key"). */
  readonly secretLabel?: string;

  /** True when the current runtime supports this source (e.g. desktop app only). */
  isAvailable(): boolean;

  /** True when persistent credentials are already on file. */
  hasCredentials(): Promise<boolean>;

  /** Persist API credentials (typically to the OS keyring). */
  saveCredentials(apiKey: string, secret: string): Promise<void>;

  /** Remove any persisted credentials. */
  clearCredentials(): Promise<void>;

  /**
   * Suggest pair symbols to fetch, derived from the account (e.g. held assets).
   * Optional: sources that can't or needn't auto-discover omit this.
   */
  discoverSymbols?(): Promise<string[]>;

  /** Fetch and map remote transactions for the given window. */
  fetch(params: LiveSourceFetchParams): Promise<Transaction[]>;
}
