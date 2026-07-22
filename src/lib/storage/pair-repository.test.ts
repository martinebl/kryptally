import { describe, it, expect } from 'vitest';
import { createPairRepository } from './pair-repository';
import type { IStorage } from './storage';

const createInMemoryStorage = (initial: Record<string, string> = {}): IStorage => {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
};

describe('createPairRepository', () => {
  it('returns empty arrays when nothing is stored for the exchange', async () => {
    const repo = createPairRepository(createInMemoryStorage());

    const result = await repo.load('Binance');

    expect(result).toEqual({ symbols: [], autoDetectedSymbols: [] });
  });

  it('returns empty arrays when the stored value is corrupt JSON', async () => {
    const repo = createPairRepository(createInMemoryStorage({ 'kryptally-pairs-Binance': 'not json' }));

    const result = await repo.load('Binance');

    expect(result).toEqual({ symbols: [], autoDetectedSymbols: [] });
  });

  it('round-trips saved pairs for the given exchange', async () => {
    const repo = createPairRepository(createInMemoryStorage());

    await repo.save('Binance', { symbols: ['BTCUSDT', 'ETHUSDT'], autoDetectedSymbols: ['BTCUSDT'] });
    const result = await repo.load('Binance');

    expect(result).toEqual({ symbols: ['BTCUSDT', 'ETHUSDT'], autoDetectedSymbols: ['BTCUSDT'] });
  });

  it('keeps different exchanges independent', async () => {
    const repo = createPairRepository(createInMemoryStorage());

    await repo.save('Binance', { symbols: ['BTCUSDT'], autoDetectedSymbols: [] });
    await repo.save('Revolut X', { symbols: ['BTC-USD'], autoDetectedSymbols: ['BTC-USD'] });

    expect(await repo.load('Binance')).toEqual({ symbols: ['BTCUSDT'], autoDetectedSymbols: [] });
    expect(await repo.load('Revolut X')).toEqual({ symbols: ['BTC-USD'], autoDetectedSymbols: ['BTC-USD'] });
  });

  it('clears the stored pairs for an exchange', async () => {
    const repo = createPairRepository(createInMemoryStorage());
    await repo.save('Binance', { symbols: ['BTCUSDT'], autoDetectedSymbols: ['BTCUSDT'] });

    await repo.clear('Binance');

    expect(await repo.load('Binance')).toEqual({ symbols: [], autoDetectedSymbols: [] });
  });
});
