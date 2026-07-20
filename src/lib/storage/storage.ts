export interface IStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const createLocalStorageStorage = (): IStorage => ({
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => localStorage.setItem(key, value),
  remove: async (key) => localStorage.removeItem(key),
});

const DB_NAME = 'kryptally';
const STORE_NAME = 'kv';

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

interface KVRecord {
  key: string;
  value: string;
}

export const createIndexedDBStorage = (): IStorage => {
  // Opened lazily and cached so every get/set/remove reuses the same
  // connection instead of racing separate indexedDB.open() calls.
  let dbPromise: Promise<IDBDatabase> | null = null;

  const openDb = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          // Let the next call retry instead of replaying this rejection forever.
          dbPromise = null;
          reject(request.error);
        };
      });
    }
    return dbPromise;
  };

  const withStore = async <T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> => {
    const db = await openDb();
    return requestToPromise(fn(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)));
  };

  return {
    get: async (key) => {
      const record = await withStore<KVRecord | undefined>('readonly', (store) => store.get(key));
      return record?.value ?? null;
    },

    set: async (key, value) => {
      await withStore('readwrite', (store) => store.put({ key, value }));
    },

    remove: async (key) => {
      await withStore('readwrite', (store) => store.delete(key));
    },
  };
};
