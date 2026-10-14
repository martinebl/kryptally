import { describe, it, expect } from 'vitest';
import { createCustomImporterRepository } from '$lib/storage/custom-importer-repository';
import type { IStorage } from '$lib/storage/storage';
import type { CustomImporterConfig } from '$lib/types';

const KEY = 'kryptally-custom-importers';

const createInMemoryStorage = (initial: Record<string, string> = {}): IStorage => {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
};

const config = (id: string, name = `Exchange ${id}`): CustomImporterConfig => ({
  schemaVersion: 1,
  id,
  name,
  header: { mode: 'auto' },
  requiredColumns: ['D', 'A', 'Q'],
  delimiter: ',',
  decimalSeparator: '.',
  dateFormats: ['iso'],
  timezone: 'utc',
  columns: { date: 'D', asset: 'A', amount: 'Q' },
  type: { mode: 'fixed', kind: 'buy' },
  preprocessors: [],
});

describe('createCustomImporterRepository', () => {
  it('lists nothing when empty', async () => {
    expect(await createCustomImporterRepository(createInMemoryStorage()).list()).toEqual([]);
  });

  it('lists nothing when the stored value is corrupt', async () => {
    const repo = createCustomImporterRepository(createInMemoryStorage({ [KEY]: '{oops' }));
    expect(await repo.list()).toEqual([]);
  });

  it('skips entries with an unsupported schema version', async () => {
    const stored = JSON.stringify([config('a'), { ...config('b'), schemaVersion: 7 }]);
    const repo = createCustomImporterRepository(createInMemoryStorage({ [KEY]: stored }));
    expect((await repo.list()).map((c) => c.id)).toEqual(['a']);
  });

  it('saves new configs and updates existing ones by id', async () => {
    const repo = createCustomImporterRepository(createInMemoryStorage());
    await repo.save(config('a'));
    await repo.save(config('b'));
    await repo.save(config('a', 'Renamed'));
    expect(await repo.list()).toEqual([config('a', 'Renamed'), config('b')]);
  });

  it('removes a config by id', async () => {
    const repo = createCustomImporterRepository(createInMemoryStorage());
    await repo.save(config('a'));
    await repo.save(config('b'));
    await repo.remove('a');
    expect((await repo.list()).map((c) => c.id)).toEqual(['b']);
  });

  it('does not lose writes issued concurrently', async () => {
    const repo = createCustomImporterRepository(createInMemoryStorage());
    await Promise.all([repo.save(config('a')), repo.save(config('b')), repo.save(config('c'))]);
    expect((await repo.list()).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});
