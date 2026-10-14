import type { IStorage } from '$lib/storage/storage';
import type { CustomImporterConfig } from '$lib/types';

const KEY = 'kryptally-custom-importers';

const SUPPORTED_SCHEMA_VERSION = 1;

const parse = (raw: string | null): CustomImporterConfig[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as CustomImporterConfig[]).filter((c) => c?.schemaVersion === SUPPORTED_SCHEMA_VERSION)
      : [];
  } catch (e) {
    console.warn('Ignoring corrupted stored custom importers', e);
    return [];
  }
};

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
        const next = fn(parse(await storage.get(KEY)));
        await storage.set(KEY, JSON.stringify(next));
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
