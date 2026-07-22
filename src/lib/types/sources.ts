import type { Transaction } from './transaction';
import type { IImportPreprocessor } from './importers';

/**
 * Per-source UI state held by the live importer component. Shared between
 * LiveImporter.svelte (owner) and LiveSourceCard.svelte (presenter) so both
 * sides agree on the same shape.
 */
export interface SourceState {
  /** Whether the card body is currently expanded. */
  open: boolean;
  /**
   * Credential status: `undefined` = unknown (still probing keychain),
   * `true` = connected, `false` = not connected.
   */
  hasCreds: boolean | undefined;
  /** Last successful fetch timestamp (persisted to localStorage). */
  lastFetch: Date | null;
  /**
   * Current input values keyed by `CredentialField.id`, one entry per field
   * declared on the source. Lives only in the UI — never persisted.
   */
  creds: Record<string, string>;
  /** From-date string (yyyy-mm-dd) chosen by the user; '' = unbounded start. */
  fromDate: string;
  /** To-date string (yyyy-mm-dd); defaults to today. */
  toDate: string;
  /** High-level fetch phase driven by the fetch handler. */
  phase: 'idle' | 'fetching' | 'done';
  /** Total transactions fetched in the most recent fetch call. */
  fetchedTotal: number;
  /** New (non-duplicate) transactions imported in the last call. */
  newCount: number;
  /** Duplicate transactions skipped in the last call. */
  dupCount: number;
  /** Progress counter for the in-flight fetch. */
  progDone: number;
  /** Total requests the in-flight fetch will issue. */
  progTotal: number;
  /** Remaining seconds of an active rate-limit wait, or 0 when idle. */
  rateLimitSeconds: number;
  /** Last error message, shown in a red banner; '' = no error. */
  error: string;
  /** Last informational note, shown in an amber banner; '' = no note. */
  info: string;
  /** Trading pairs to fetch, as committed chips (e.g. "BTC-USD", "BTCUSDT"). */
  symbols: string[];
  /** Subset of `symbols` last populated by discoverSymbols(); drives the "auto" dot on chips. */
  autoDetectedSymbols: string[];
  /** Current uncommitted text in the pair-input box. */
  symbolInput: string;
  /** True while a symbol auto-detection request is in flight. */
  discovering: boolean;
  /**
   * Full catalog of tradable pairs for this exchange, fetched lazily via
   * `listSymbols()` the first time a connected card is opened this session.
   * Powers pair-input suggestions; empty until loaded (or if unsupported).
   */
  availableSymbols: string[];
  /** True while `listSymbols()` is in flight, to avoid duplicate fetches. */
  catalogLoading: boolean;
}

export interface LiveSourceFetchParams {
  /** Inclusive lower bound for transaction dates. */
  from?: Date;
  /** Inclusive upper bound for transaction dates. */
  to?: Date;
  /**
   * Pair symbols to fetch, used by exchanges that require pair-by-pair queries.
   * Always exactly what the UI shows — sources must not fall back to their own
   * detection inside `fetch()`; that belongs in `discoverSymbols()`.
   */
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
 * Description of a single credential input field on the live-importer card.
 * A source composes its credential form from a list of these; the host UI
 * renders one control per entry and passes the results back to
 * `ILiveSource.saveCredentials` keyed by `id`.
 */
export interface CredentialField {
  /** Stable identifier unique within the source; used as the credentials record key. */
  readonly id: string;
  /** Label shown above the input. */
  readonly label: string;
  /** Render a multi-line `<textarea>` instead of a single-line password input. */
  readonly multiline?: boolean;
  /** Optional placeholder text inside the input. */
  readonly placeholder?: string;
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
   * Whether the user must supply at least one pair symbol before fetching. Defaults
   * to true. Sources that pull account-wide (e.g. Revolut X orders) set this false;
   * the trading-pairs input still shows (and still prefills via `discoverSymbols`)
   * whenever it's defined, but an empty list no longer blocks the fetch button.
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

  /**
   * Credential inputs this source needs from the user, in display order. The
   * UI renders one field per entry (single-line `<input>` by default, or a
   * multi-line `<textarea>` when `multiline` is set). Values are gathered into
   * a `Record<id, string>` and passed back to `saveCredentials`, so each
   * source owns the id ↔ Tauri command argument mapping.
   */
  readonly credentialFields: CredentialField[];

  /** True when the current runtime supports this source (e.g. desktop app only). */
  isAvailable(): boolean;

  /** True when persistent credentials are already on file. */
  hasCredentials(): Promise<boolean>;

  /**
   * Persist API credentials (typically to the OS keyring). `values` is keyed
   * by `CredentialField.id`; the implementation is responsible for mapping
   * these onto the Tauri command's argument shape.
   */
  saveCredentials(values: Record<string, string>): Promise<void>;

  /** Remove any persisted credentials. */
  clearCredentials(): Promise<void>;

  /**
   * Suggest pair symbols to fetch, derived from the account (e.g. held assets).
   * Optional: sources that can't or needn't auto-discover omit this.
   */
  discoverSymbols?(): Promise<string[]>;

  /**
   * All tradable pair symbols currently listed on the exchange, in the same
   * string format `symbols`/`discoverSymbols` use (e.g. "BTCUSDT", "BTC-USD").
   * Powers suggestions in the pair input. Optional: sources that can't or
   * needn't enumerate their full catalog omit this.
   */
  listSymbols?(): Promise<string[]>;

  /** Fetch and map remote transactions for the given window. */
  fetch(params: LiveSourceFetchParams): Promise<Transaction[]>;
}
