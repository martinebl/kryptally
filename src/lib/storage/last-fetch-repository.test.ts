import { describe, it, expect } from 'vitest';
import { createLastFetchRepository } from './last-fetch-repository';
import type { IStorage } from './storage';

const createInMemoryStorage = (initial: Record<string, string> = {}): IStorage => {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
};

describe('createLastFetchRepository', () => {
  it('returns null when nothing has been fetched yet', async () => {
    const repo = createLastFetchRepository(createInMemoryStorage());
    expect(await repo.get('binance')).toBeNull();
  });

  it('round-trips a saved fetch date', async () => {
    const repo = createLastFetchRepository(createInMemoryStorage());
    const date = new Date('2024-05-12T10:00:00Z');

    await repo.set('binance', date);

    expect(await repo.get('binance')).toEqual(date);
  });

  it('keeps last-fetch dates separate per exchange', async () => {
    const repo = createLastFetchRepository(createInMemoryStorage());
    const binanceDate = new Date('2024-05-12T10:00:00Z');
    const ledgerDate = new Date('2024-06-01T08:30:00Z');

    await repo.set('binance', binanceDate);
    await repo.set('ledger', ledgerDate);

    expect(await repo.get('binance')).toEqual(binanceDate);
    expect(await repo.get('ledger')).toEqual(ledgerDate);
  });

  it('returns null instead of throwing when storage.get rejects', async () => {
    const storage: IStorage = {
      get: async () => { throw new Error('unavailable'); },
      set: async () => {},
      remove: async () => {},
    };
    const repo = createLastFetchRepository(storage);

    expect(await repo.get('binance')).toBeNull();
  });

  it('does not throw when storage.set rejects', async () => {
    const storage: IStorage = {
      get: async () => null,
      set: async () => { throw new Error('unavailable'); },
      remove: async () => {},
    };
    const repo = createLastFetchRepository(storage);

    await expect(repo.set('binance', new Date())).resolves.toBeUndefined();
  });
});
