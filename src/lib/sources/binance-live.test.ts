import { describe, it, expect, beforeEach, vi } from 'vitest';
import BigNumber from 'bignumber.js';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('$lib/runtime', () => ({
  isTauri: () => true,
}));

import { BinanceLiveSource } from '$lib/sources/binance-live';

const setupResponses = (responses: {
  trades?: Record<string, unknown[]>;
  deposits?: unknown[];
  withdrawals?: unknown[];
}) => {
  invokeMock.mockImplementation((command: string, args?: { symbol?: string }) => {
    if (command === 'binance_fetch_trades') {
      return Promise.resolve(responses.trades?.[args?.symbol ?? ''] ?? []);
    }
    if (command === 'binance_fetch_deposits') {
      return Promise.resolve(responses.deposits ?? []);
    }
    if (command === 'binance_fetch_withdrawals') {
      return Promise.resolve(responses.withdrawals ?? []);
    }
    return Promise.resolve(null);
  });
};

describe('BinanceLiveSource', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('exposes the expected metadata', () => {
    const source = new BinanceLiveSource();
    expect(source.exchangeName).toBe('Binance');
    expect(source.preprocessors).toEqual([]);
    expect(source.isAvailable()).toBe(true);
  });

  it('maps a buy trade — base/quote split via quote-asset suffix', async () => {
    setupResponses({
      trades: {
        ETHUSDT: [
          {
            symbol: 'ETHUSDT',
            id: 4711,
            price: '2500.00',
            qty: '0.4',
            quoteQty: '1000',
            commission: '0.0004',
            commissionAsset: 'ETH',
            time: Date.UTC(2024, 5, 17, 12, 30, 0),
            isBuyer: true,
          },
        ],
      },
    });

    const txs = await new BinanceLiveSource().fetch({ symbols: ['ETHUSDT'] });

    expect(txs).toHaveLength(1);
    const [tx] = txs;
    expect(tx.type).toBe('buy');
    expect(tx.fromAsset).toBe('USDT');
    expect(tx.fromAmount?.eq(new BigNumber('1000'))).toBe(true);
    expect(tx.toAsset).toBe('ETH');
    expect(tx.toAmount?.eq(new BigNumber('0.4'))).toBe(true);
    expect(tx.feeAsset).toBe('ETH');
    expect(tx.feeAmount?.eq(new BigNumber('0.0004'))).toBe(true);
    expect(tx.exchange).toBe('Binance');
  });

  it('maps a sell trade with the inflow/outflow swapped', async () => {
    setupResponses({
      trades: {
        BTCUSDT: [
          {
            symbol: 'BTCUSDT',
            id: 9001,
            price: '60000',
            qty: '0.02',
            quoteQty: '1200',
            commission: '1.2',
            commissionAsset: 'USDT',
            time: Date.UTC(2025, 1, 3, 8, 0, 0),
            isBuyer: false,
          },
        ],
      },
    });

    const [tx] = await new BinanceLiveSource().fetch({ symbols: ['BTCUSDT'] });

    expect(tx.type).toBe('sell');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount?.eq(new BigNumber('0.02'))).toBe(true);
    expect(tx.toAsset).toBe('USDT');
    expect(tx.toAmount?.eq(new BigNumber('1200'))).toBe(true);
    expect(tx.feeAsset).toBe('USDT');
  });

  it('drops trades whose symbol cannot be split into a known base/quote pair', async () => {
    setupResponses({
      trades: {
        FOOBAR: [
          {
            symbol: 'FOOBAR',
            id: 1,
            price: '1',
            qty: '1',
            quoteQty: '1',
            commission: '0',
            commissionAsset: 'FOO',
            time: Date.UTC(2024, 0, 1),
            isBuyer: true,
          },
        ],
      },
    });

    const txs = await new BinanceLiveSource().fetch({ symbols: ['FOOBAR'] });
    expect(txs).toHaveLength(0);
  });

  it('maps deposits as transfers with toAsset/toAmount only', async () => {
    setupResponses({
      deposits: [
        {
          amount: '1.5',
          coin: 'SOL',
          insertTime: Date.UTC(2024, 8, 22, 14, 0, 0),
          txId: 'tx-abc',
        },
      ],
    });

    const [tx] = await new BinanceLiveSource().fetch({ symbols: [] });

    expect(tx.type).toBe('transfer');
    expect(tx.toAsset).toBe('SOL');
    expect(tx.toAmount?.eq(new BigNumber('1.5'))).toBe(true);
    expect(tx.fromAsset).toBeUndefined();
    expect(tx.notes).toBe('Deposit');
  });

  it('maps withdrawals (including their fee) as transfers with fromAsset/fromAmount', async () => {
    setupResponses({
      withdrawals: [
        {
          id: 'w-77',
          amount: '50',
          transactionFee: '0.5',
          coin: 'USDT',
          applyTime: '2024-11-04 09:15:30',
        },
      ],
    });

    const [tx] = await new BinanceLiveSource().fetch({ symbols: [] });

    expect(tx.type).toBe('transfer');
    expect(tx.fromAsset).toBe('USDT');
    expect(tx.fromAmount?.eq(new BigNumber('50'))).toBe(true);
    expect(tx.feeAsset).toBe('USDT');
    expect(tx.feeAmount?.eq(new BigNumber('0.5'))).toBe(true);
    expect(tx.date.toISOString()).toBe('2024-11-04T09:15:30.000Z');
    expect(tx.notes).toBe('Withdrawal');
  });

  it('filters out transactions outside the requested date window', async () => {
    const inWindow = Date.UTC(2025, 2, 15);
    const outOfWindow = Date.UTC(2024, 0, 1);

    setupResponses({
      deposits: [
        { amount: '1', coin: 'BTC', insertTime: inWindow, txId: 'a' },
        { amount: '2', coin: 'BTC', insertTime: outOfWindow, txId: 'b' },
      ],
    });

    const txs = await new BinanceLiveSource().fetch({
      symbols: [],
      from: new Date(Date.UTC(2025, 0, 1)),
      to: new Date(Date.UTC(2025, 11, 31)),
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].id).toContain('a');
  });

  it('returns transactions sorted by date', async () => {
    setupResponses({
      deposits: [
        { amount: '1', coin: 'BTC', insertTime: Date.UTC(2025, 5, 1), txId: 'late' },
        { amount: '1', coin: 'BTC', insertTime: Date.UTC(2025, 0, 1), txId: 'early' },
      ],
    });

    const txs = await new BinanceLiveSource().fetch({ symbols: [] });

    expect(txs.map((t) => t.id)).toEqual([
      expect.stringContaining('early'),
      expect.stringContaining('late'),
    ]);
  });

  it('passes credentials through to the Tauri layer', async () => {
    invokeMock.mockResolvedValue(undefined);
    const source = new BinanceLiveSource();

    await source.saveCredentials('key-1', 'secret-2');
    expect(invokeMock).toHaveBeenCalledWith('binance_save_credentials', {
      apiKey: 'key-1',
      secret: 'secret-2',
    });

    invokeMock.mockResolvedValue(true);
    await expect(source.hasCredentials()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('binance_has_credentials');

    invokeMock.mockResolvedValue(undefined);
    await source.clearCredentials();
    expect(invokeMock).toHaveBeenCalledWith('binance_clear_credentials');
  });
});
