import BigNumber from 'bignumber.js';
import type { Transaction } from '$lib/types';
import type { IStorage } from './storage';

const KEY = 'kryptax-transactions';

type SerializedTransaction = {
  id: string;
  date: string;
  type: Transaction['type'];
  fromAsset?: string;
  fromAmount?: string;
  toAsset?: string;
  toAmount?: string;
  feeAsset?: string;
  feeAmount?: string;
  fiatCurrency?: string;
  fiatValue?: string;
  exchange?: string;
  notes?: string;
};

type SerializedStore = Record<string, SerializedTransaction>;

export const serializeTransaction = (tx: Transaction): SerializedTransaction => ({
  id: tx.id,
  date: tx.date.toISOString(),
  type: tx.type,
  ...(tx.fromAsset !== undefined ? { fromAsset: tx.fromAsset } : {}),
  ...(tx.fromAmount !== undefined ? { fromAmount: tx.fromAmount.toFixed() } : {}),
  ...(tx.toAsset !== undefined ? { toAsset: tx.toAsset } : {}),
  ...(tx.toAmount !== undefined ? { toAmount: tx.toAmount.toFixed() } : {}),
  ...(tx.feeAsset !== undefined ? { feeAsset: tx.feeAsset } : {}),
  ...(tx.feeAmount !== undefined ? { feeAmount: tx.feeAmount.toFixed() } : {}),
  ...(tx.fiatCurrency !== undefined ? { fiatCurrency: tx.fiatCurrency } : {}),
  ...(tx.fiatValue !== undefined ? { fiatValue: tx.fiatValue.toFixed() } : {}),
  ...(tx.exchange !== undefined ? { exchange: tx.exchange } : {}),
  ...(tx.notes !== undefined ? { notes: tx.notes } : {}),
});

export const deserializeTransaction = (tx: SerializedTransaction): Transaction => ({
  id: tx.id,
  date: new Date(tx.date),
  type: tx.type,
  ...(tx.fromAsset !== undefined ? { fromAsset: tx.fromAsset } : {}),
  ...(tx.fromAmount !== undefined ? { fromAmount: new BigNumber(tx.fromAmount) } : {}),
  ...(tx.toAsset !== undefined ? { toAsset: tx.toAsset } : {}),
  ...(tx.toAmount !== undefined ? { toAmount: new BigNumber(tx.toAmount) } : {}),
  ...(tx.feeAsset !== undefined ? { feeAsset: tx.feeAsset } : {}),
  ...(tx.feeAmount !== undefined ? { feeAmount: new BigNumber(tx.feeAmount) } : {}),
  ...(tx.fiatCurrency !== undefined ? { fiatCurrency: tx.fiatCurrency } : {}),
  ...(tx.fiatValue !== undefined ? { fiatValue: new BigNumber(tx.fiatValue) } : {}),
  ...(tx.exchange !== undefined ? { exchange: tx.exchange } : {}),
  ...(tx.notes !== undefined ? { notes: tx.notes } : {}),
});

// Importer ids embed the transaction's position in the uploaded file, so the
// same real-world transaction can carry a different id in an overlapping
// export. Identity is therefore derived from content. Fiat enrichment is
// excluded so a re-import with better price data replaces the stored entry.
const contentKey = (tx: SerializedTransaction): string =>
  [
    tx.exchange ?? '',
    tx.date,
    tx.type,
    tx.fromAsset ?? '',
    tx.fromAmount ?? '',
    tx.toAsset ?? '',
    tx.toAmount ?? '',
    tx.feeAsset ?? '',
    tx.feeAmount ?? '',
    tx.notes ?? '',
  ].join('|');

/**
 * Key each transaction by content, suffixed with its occurrence index within
 * the batch so legitimate identical transactions stay distinct while the nth
 * occurrence still matches the nth occurrence of an overlapping upload.
 */
const keyByContent = (txs: SerializedTransaction[]): [string, SerializedTransaction][] => {
  const seen = new Map<string, number>();
  return txs.map((tx) => {
    const base = contentKey(tx);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return [`${base}#${occurrence}`, tx];
  });
};

const parseStore = (raw: string | null): SerializedStore => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SerializedStore;
  } catch (e) {
    console.warn('Ignoring corrupted stored transaction data', e);
    return {};
  }
};

export interface ITransactionRepository {
  /** Load all stored transactions in insertion order. */
  load(): Promise<Transaction[]>;
  /**
   * Merge incoming transactions into the store, deduplicating on content;
   * incoming entries replace stored duplicates. Returns the full merged list.
   */
  merge(incoming: Transaction[]): Promise<Transaction[]>;
  clear(): Promise<void>;
}

export const createTransactionRepository = (storage: IStorage): ITransactionRepository => {
  // Merges are read-modify-write on a single key; queue them so overlapping
  // merges cannot read the same snapshot and lose each other's entries.
  let pendingWrite: Promise<unknown> = Promise.resolve();

  return {
    load: async () =>
      Object.values(parseStore(await storage.get(KEY))).map(deserializeTransaction),

    merge: (incoming) => {
      const write = pendingWrite
        .catch(() => {}) // a failed earlier merge must not block later ones
        .then(async () => {
          const store = parseStore(await storage.get(KEY));
          keyByContent(incoming.map(serializeTransaction)).forEach(([key, tx]) => {
            store[key] = tx;
          });
          await storage.set(KEY, JSON.stringify(store));
          return Object.values(store).map(deserializeTransaction);
        });
      pendingWrite = write;
      return write;
    },

    clear: () => {
      const write = pendingWrite.catch(() => {}).then(() => storage.remove(KEY));
      pendingWrite = write;
      return write;
    },
  };
};
