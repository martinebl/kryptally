import type { IStorage } from '$lib/storage/storage';
import type { CustomImporterConfig } from '$lib/types';

const KEY = 'kryptally-custom-importers';

const SUPPORTED_SCHEMA_VERSION = 1;

/** Every stored entry, including ones this build cannot read. */
const parseAll = (raw: string | null): unknown[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Ignoring corrupted stored custom importers', e);
    return [];
  }
};

const isSupported = (entry: unknown): entry is CustomImporterConfig =>
  (entry as CustomImporterConfig | null)?.schemaVersion === SUPPORTED_SCHEMA_VERSION;

const parse = (raw: string | null): CustomImporterConfig[] => parseAll(raw).filter(isSupported);

export interface ICustomImporterRepository {
  /** All user-defined importer configs, in creation order. */
  list(): Promise<CustomImporterConfig[]>;
  /** Insert, or replace the config with the same id. Returns the updated list. */
  save(config: CustomImporterConfig): Promise<CustomImporterConfig[]>;
  /** Returns the updated list. */
  remove(id: string): Promise<CustomImporterConfig[]>;
}

export const createCustomImporterRepository = (storage: IStorage): ICustomImporterRepository => {
  // Read-modify-write on one key; queue so overlapping writes can't drop each other.
  let pendingWrite: Promise<unknown> = Promise.resolve();

  const update = (fn: (configs: CustomImporterConfig[]) => CustomImporterConfig[]) => {
    const write = pendingWrite
      .catch(() => {}) // a failed earlier write must not block later ones
      .then(async () => {
        const all = parseAll(await storage.get(KEY));
        const next = fn(all.filter(isSupported));
        // Entries from a newer schema are skipped, not deleted.
        const unsupported = all.filter((entry) => !isSupported(entry));
        await storage.set(KEY, JSON.stringify([...unsupported, ...next]));
        return next;
      });
    pendingWrite = write;
    return write;
  };

  return {
    list: async () => parse(await storage.get(KEY)),
    save: (config) =>
      update((configs) =>
        configs.some((c) => c.id === config.id)
          ? configs.map((c) => (c.id === config.id ? config : c))
          : [...configs, config],
      ),
    remove: (id) => update((configs) => configs.filter((c) => c.id !== id)),
  };
};
