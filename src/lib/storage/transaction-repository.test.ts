import { describe, it, expect, vi } from 'vitest';
import BigNumber from 'bignumber.js';
import {
  createTransactionRepository,
  serializeTransaction,
  deserializeTransaction,
} from './transaction-repository';
import type { Transaction } from '$lib/types';
import type { IStorage } from './storage';

const createInMemoryStorage = (initial: Record<string, string> = {}): IStorage => {
  const data = new Map(Object.entries(initial));
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
};

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'binance-1723627293000-0',
  date: new Date('2024-08-14T09:21:33Z'),
  type: 'buy',
  fromAsset: 'EUR',
  fromAmount: new BigNumber('512.34'),
  toAsset: 'BTC',
  toAmount: new BigNumber('0.0123456789012345'),
  exchange: 'Binance',
  ...overrides,
});

describe('serializeTransaction / deserializeTransaction', () => {
  it('round-trips a full transaction preserving BigNumber precision and Date', () => {
    const original = makeTx({
      feeAsset: 'BNB',
      feeAmount: new BigNumber('0.000123456789012345678'),
      fiatCurrency: 'DKK',
      fiatValue: new BigNumber('3821.07'),
      notes: 'some note',
    });

    const restored = deserializeTransaction(serializeTransaction(original));

    expect(restored.id).toBe(original.id);
    expect(restored.date).toBeInstanceOf(Date);
    expect(restored.date.getTime()).toBe(original.date.getTime());
    expect(restored.type).toBe('buy');
    expect(restored.fromAmount).toBeInstanceOf(BigNumber);
    expect(restored.fromAmount!.toFixed()).toBe('512.34');
    expect(restored.toAmount!.toFixed()).toBe('0.0123456789012345');
    expect(restored.feeAmount!.toFixed()).toBe('0.000123456789012345678');
    expect(restored.fiatValue!.toFixed()).toBe('3821.07');
    expect(restored.fiatCurrency).toBe('DKK');
    expect(restored.notes).toBe('some note');
    expect(restored.exchange).toBe('Binance');
  });

  it('leaves absent optional fields undefined after round-trip', () => {
    const original: Transaction = {
      id: 'ledger-0xabc',
      date: new Date('2023-03-07T18:02:11Z'),
      type: 'transfer',
      toAsset: 'ETH',
      toAmount: new BigNumber('1.5'),
    };

    const serialized = serializeTransaction(original);
    expect('fromAsset' in serialized).toBe(false);
    expect('feeAmount' in serialized).toBe(false);

    const restored = deserializeTransaction(serialized);
    expect(restored.fromAsset).toBeUndefined();
    expect(restored.fromAmount).toBeUndefined();
    expect(restored.feeAsset).toBeUndefined();
    expect(restored.fiatValue).toBeUndefined();
  });
});

describe('createTransactionRepository', () => {
  it('loads an empty list when nothing is stored', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());
    expect(await repo.load()).toEqual([]);
  });

  it('ignores corrupted stored data instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = createTransactionRepository(
      createInMemoryStorage({ 'kryptax-transactions': '{not valid json' })
    );

    expect(await repo.load()).toEqual([]);

    warn.mockRestore();
  });

  it('round-trips merged transactions through load', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());
    const txs = [makeTx(), makeTx({ id: 'binance-1723627299000-1', date: new Date('2024-08-14T09:21:39Z'), type: 'sell' })];

    await repo.merge(txs);
    const loaded = await repo.load();

    expect(loaded).toHaveLength(2);
    expect(loaded[0].fromAmount!.toFixed()).toBe('512.34');
    expect(loaded[1].type).toBe('sell');
  });

  it('does not duplicate when the same batch is merged twice', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());
    const txs = [makeTx(), makeTx({ date: new Date('2024-09-02T11:45:00Z'), type: 'sell' })];

    await repo.merge(txs);
    const merged = await repo.merge(txs);

    expect(merged).toHaveLength(2);
    expect(await repo.load()).toHaveLength(2);
  });

  it('dedupes overlapping batches on content even when ids differ', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());
    const shared = makeTx({ id: 'binance-1723627293000-4' });
    const sharedAgain = makeTx({ id: 'binance-1723627293000-0' }); // same content, different positional id
    const newer = makeTx({ id: 'binance-1726300000000-1', date: new Date('2024-09-14T08:26:40Z') });

    await repo.merge([shared]);
    const merged = await repo.merge([sharedAgain, newer]);

    expect(merged).toHaveLength(2);
  });

  it('lets the new version win on duplicate content (refreshed enrichment)', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());
    const original = makeTx({ fiatValue: new BigNumber('100'), fiatCurrency: 'DKK' });
    const reimported = makeTx({ fiatValue: new BigNumber('250.5'), fiatCurrency: 'DKK' });

    await repo.merge([original]);
    const merged = await repo.merge([reimported]);

    expect(merged).toHaveLength(1);
    expect(merged[0].fiatValue!.toFixed()).toBe('250.5');
  });

  it('keeps identical transactions within one batch distinct, without duplicating on re-merge', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());
    const twin = () => makeTx({ id: 'revolut-x-1723627293000-7' });

    await repo.merge([twin(), twin()]);
    const merged = await repo.merge([twin(), twin()]);

    expect(merged).toHaveLength(2);
  });

  it('keeps existing transactions in position and appends new ones', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());
    const first = makeTx();
    const second = makeTx({ date: new Date('2024-10-01T14:00:00Z'), type: 'sell' });

    await repo.merge([first]);
    const merged = await repo.merge([first, second]);

    expect(merged[0].type).toBe('buy');
    expect(merged[1].type).toBe('sell');
  });

  it('clears all stored transactions', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());
    await repo.merge([makeTx()]);

    await repo.clear();

    expect(await repo.load()).toEqual([]);
  });

  it('does not lose entries when merges overlap', async () => {
    const repo = createTransactionRepository(createInMemoryStorage());

    await Promise.all([
      repo.merge([makeTx()]),
      repo.merge([makeTx({ date: new Date('2024-11-11T11:11:11Z'), type: 'sell' })]),
    ]);

    expect(await repo.load()).toHaveLength(2);
  });
});
