import { describe, it, expect, vi } from 'vitest';
import BigNumber from 'bignumber.js';
import { createPriceRepository, serializePricesByAsset, deserializePricesByAsset } from './price-repository';
import type { PricesByAsset } from '$lib/converters/csv-prices';
import type { IStorage } from './storage';

const createInMemoryStorage = (initial: Record<string, string> = {}): IStorage => {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
};

describe('serializePricesByAsset / deserializePricesByAsset', () => {
  it('round-trips a PricesByAsset map and preserves BigNumber precision', () => {
    const original: PricesByAsset = new Map([
      [
        'solana',
        {
          prices: new Map([
            ['2025-02-10', new BigNumber('173.987654321098765')],
            ['2025-02-11', new BigNumber('180.5')],
          ]),
          currency: 'USD',
        },
      ],
    ]);

    const json = serializePricesByAsset(original);
    const restored = deserializePricesByAsset(json);

    expect(restored.size).toBe(1);
    const sol = restored.get('solana')!;
    expect(sol.currency).toBe('USD');
    expect(sol.prices.size).toBe(2);
    expect(sol.prices.get('2025-02-10')!.toFixed()).toBe('173.987654321098765');
    expect(sol.prices.get('2025-02-11')!.toFixed()).toBe('180.5');
    expect(sol.prices.get('2025-02-10')).toBeInstanceOf(BigNumber);
  });

  it('round-trips multiple assets', () => {
    const original: PricesByAsset = new Map([
      ['ethereum', { prices: new Map([['2024-07-04', new BigNumber('3100')]]), currency: 'EUR' }],
      ['polkadot', { prices: new Map([['2024-07-04', new BigNumber('6.25')]]), currency: 'USD' }],
    ]);

    const restored = deserializePricesByAsset(serializePricesByAsset(original));

    expect(restored.size).toBe(2);
    expect(restored.get('ethereum')!.currency).toBe('EUR');
    expect(restored.get('polkadot')!.prices.get('2024-07-04')!.toFixed()).toBe('6.25');
  });

  it('round-trips an empty map', () => {
    const restored = deserializePricesByAsset(serializePricesByAsset(new Map()));
    expect(restored.size).toBe(0);
  });
});

describe('createPriceRepository', () => {
  it('round-trips a saved entry through mergeInto', async () => {
    const repo = createPriceRepository(createInMemoryStorage());

    await repo.save('cardano', { prices: new Map([['2024-03-15', new BigNumber('0.71')]]), currency: 'USD' });

    const target: PricesByAsset = new Map();
    await repo.mergeInto(target);

    expect(target.size).toBe(1);
    expect(target.get('cardano')!.prices.get('2024-03-15')!.toFixed()).toBe('0.71');
  });

  it('keeps previously saved assets when saving another', async () => {
    const repo = createPriceRepository(createInMemoryStorage());

    await repo.save('cardano', { prices: new Map([['2024-03-15', new BigNumber('0.71')]]), currency: 'USD' });
    await repo.save('chainlink', { prices: new Map([['2024-03-16', new BigNumber('19.4')]]), currency: 'EUR' });

    const target: PricesByAsset = new Map();
    await repo.mergeInto(target);

    expect(target.size).toBe(2);
    expect(target.get('cardano')!.currency).toBe('USD');
    expect(target.get('chainlink')!.currency).toBe('EUR');
  });

  it('does not lose entries when saves overlap', async () => {
    const repo = createPriceRepository(createInMemoryStorage());

    await Promise.all([
      repo.save('cardano', { prices: new Map([['2024-03-15', new BigNumber('0.71')]]), currency: 'USD' }),
      repo.save('chainlink', { prices: new Map([['2024-03-16', new BigNumber('19.4')]]), currency: 'USD' }),
    ]);

    const target: PricesByAsset = new Map();
    await repo.mergeInto(target);

    expect(target.size).toBe(2);
  });

  it('lets stored entries win over existing target entries when merging', async () => {
    const repo = createPriceRepository(createInMemoryStorage());
    await repo.save('cardano', { prices: new Map([['2024-03-15', new BigNumber('0.71')]]), currency: 'USD' });

    const target: PricesByAsset = new Map([
      ['cardano', { prices: new Map([['2024-03-15', new BigNumber('0.5')]]), currency: 'EUR' }],
    ]);
    await repo.mergeInto(target);

    expect(target.get('cardano')!.currency).toBe('USD');
    expect(target.get('cardano')!.prices.get('2024-03-15')!.toFixed()).toBe('0.71');
  });

  it('ignores corrupted stored data instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = createPriceRepository(createInMemoryStorage({ 'kryptax-price-data': '{not valid json' }));

    const target: PricesByAsset = new Map([
      ['ethereum', { prices: new Map([['2024-07-04', new BigNumber('3100')]]), currency: 'EUR' }],
    ]);
    await expect(repo.mergeInto(target)).resolves.toBeUndefined();
    expect(target.size).toBe(1);

    warn.mockRestore();
  });

  it('rejects the failing save but keeps subsequent saves working', async () => {
    const storage = createInMemoryStorage();
    const failingSet = vi.spyOn(storage, 'set').mockRejectedValueOnce(new Error('quota exceeded'));
    const repo = createPriceRepository(storage);

    await expect(
      repo.save('cardano', { prices: new Map([['2024-03-15', new BigNumber('0.71')]]), currency: 'USD' })
    ).rejects.toThrow('quota exceeded');

    await repo.save('chainlink', { prices: new Map([['2024-03-16', new BigNumber('19.4')]]), currency: 'USD' });

    const target: PricesByAsset = new Map();
    await repo.mergeInto(target);
    expect(target.has('chainlink')).toBe(true);

    failingSet.mockRestore();
  });
});
