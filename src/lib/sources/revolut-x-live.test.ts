import { describe, it, expect, beforeEach, vi } from 'vitest';
import BigNumber from 'bignumber.js';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  // The source subscribes to rate-limit events; return a no-op unlisten.
  listen: () => Promise.resolve(() => {}),
}));

vi.mock('$lib/runtime', () => ({
  isTauri: () => true,
}));

import { RevolutXLiveSource, dateChunks } from '$lib/sources/revolut-x-live';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHUNK_MS = 29 * DAY_MS;

interface WireOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  filled_quantity: string;
  filled_amount?: string;
  average_fill_price?: string;
  price: string;
  status: string;
  created_date: number;
  updated_date: number;
}

interface WireTrade {
  tid: string;
  p: string;
  pc: string;
  q: string;
  qc: string;
  s: 'buy' | 'sell';
  oid: string;
  tdt: number;
  im: boolean;
}

const makeOrder = (overrides: Partial<WireOrder>): WireOrder => ({
  id: 'order-1',
  symbol: 'BTC/USD',
  side: 'buy',
  filled_quantity: '0.01',
  filled_amount: '650',
  price: '65000',
  status: 'filled',
  created_date: Date.UTC(2025, 3, 10, 9, 0, 0),
  updated_date: Date.UTC(2025, 3, 10, 9, 30, 0),
  ...overrides,
});

const makeTrade = (overrides: Partial<WireTrade>): WireTrade => ({
  tid: 'trade-1',
  p: '65000',
  pc: 'USD',
  q: '0.01',
  qc: 'BTC',
  s: 'buy',
  oid: 'order-x',
  tdt: Date.UTC(2025, 3, 10, 9, 30, 0),
  im: false,
  ...overrides,
});

/** Wire up the four Tauri commands the source calls. */
const setup = (opts: {
  orders?: WireOrder[];
  tradesBySymbol?: Record<string, WireTrade[]>;
  balances?: { currency: string; total: string }[];
  pairs?: Record<string, { base: string; quote: string; status: 'active' | 'inactive' }>;
}) => {
  invokeMock.mockImplementation((command: string, args?: { symbol?: string }) => {
    switch (command) {
      case 'revolut_x_fetch_orders':
        return Promise.resolve(opts.orders ?? []);
      case 'revolut_x_fetch_trades':
        return Promise.resolve(opts.tradesBySymbol?.[args?.symbol ?? ''] ?? []);
      case 'revolut_x_fetch_balances':
        return Promise.resolve(opts.balances ?? []);
      case 'revolut_x_fetch_pairs':
        return Promise.resolve(opts.pairs ?? {});
      default:
        return Promise.resolve(null);
    }
  });
};

describe('RevolutXLiveSource', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('exposes the expected metadata', () => {
    const source = new RevolutXLiveSource();
    expect(source.exchangeName).toBe('Revolut X');
    expect(source.preprocessors).toEqual([]);
    expect(source.isAvailable()).toBe(true);
    expect(source.requiresSymbols).toBe(false);
  });

  it('maps a filled buy order — pay quote (filled_amount), receive base', async () => {
    setup({
      orders: [
        makeOrder({
          id: 'o-882',
          side: 'buy',
          symbol: 'ETH/EUR',
          filled_quantity: '0.75',
          filled_amount: '1800',
          updated_date: Date.UTC(2025, 2, 14, 11, 0, 0),
        }),
      ],
    });

    const txs = await new RevolutXLiveSource().fetch({});

    expect(txs).toHaveLength(1);
    const [tx] = txs;
    expect(tx.id).toBe('revolut-x-live-order-o-882');
    expect(tx.type).toBe('buy');
    expect(tx.fromAsset).toBe('EUR');
    expect(tx.fromAmount?.eq(new BigNumber('1800'))).toBe(true);
    expect(tx.toAsset).toBe('ETH');
    expect(tx.toAmount?.eq(new BigNumber('0.75'))).toBe(true);
    expect(tx.feeAsset).toBeUndefined();
    expect(tx.exchange).toBe('Revolut X');
    // Quote is fiat, so the executed value is used directly (no price lookup).
    expect(tx.fiatCurrency).toBe('EUR');
    expect(tx.fiatValue?.eq(new BigNumber('1800'))).toBe(true);
  });

  it('uses the quote leg as the fiat value, mapping stablecoins to USD and leaving crypto quotes unpriced', async () => {
    setup({
      orders: [],
      balances: [{ currency: 'BTC', total: '1' }, { currency: 'ETH', total: '1' }],
      pairs: {
        'BTC/USDC': { base: 'BTC', quote: 'USDC', status: 'active' },
        'ETH/BTC': { base: 'ETH', quote: 'BTC', status: 'active' },
      },
      tradesBySymbol: {
        'BTC-USDC': [makeTrade({ tid: 'stable', s: 'buy', qc: 'BTC', q: '0.02', pc: 'USDC', p: '50000' })],
        'ETH-BTC': [makeTrade({ tid: 'crypto', s: 'buy', qc: 'ETH', q: '3', pc: 'BTC', p: '0.05' })],
      },
    });

    const txs = await new RevolutXLiveSource().fetch({});
    const byId = Object.fromEntries(txs.map((t) => [t.id, t]));

    // Stablecoin quote → valued 1:1 in USD.
    const stable = byId['revolut-x-live-trade-stable'];
    expect(stable.fiatCurrency).toBe('USD');
    expect(stable.fiatValue?.eq(new BigNumber('1000'))).toBe(true); // 0.02 × 50000

    // Crypto quote → left for rate enrichment.
    const crypto = byId['revolut-x-live-trade-crypto'];
    expect(crypto.fiatCurrency).toBeUndefined();
    expect(crypto.fiatValue).toBeUndefined();
  });

  it('maps a sell order with the inflow/outflow swapped', async () => {
    setup({
      orders: [
        makeOrder({ id: 'o-9', side: 'sell', symbol: 'BTC/USD', filled_quantity: '0.05', filled_amount: '3050' }),
      ],
    });

    const [tx] = await new RevolutXLiveSource().fetch({});

    expect(tx.type).toBe('sell');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount?.eq(new BigNumber('0.05'))).toBe(true);
    expect(tx.toAsset).toBe('USD');
    expect(tx.toAmount?.eq(new BigNumber('3050'))).toBe(true);
  });

  it('computes the order quote amount from price when filled_amount is absent', async () => {
    setup({
      orders: [
        makeOrder({
          id: 'o-calc',
          side: 'buy',
          symbol: 'SOL/USD',
          filled_quantity: '2',
          filled_amount: undefined,
          average_fill_price: '150',
          price: '149',
        }),
      ],
    });

    const [tx] = await new RevolutXLiveSource().fetch({});

    expect(tx.fromAmount?.eq(new BigNumber('300'))).toBe(true); // 2 × 150
    expect(tx.toAmount?.eq(new BigNumber('2'))).toBe(true);
  });

  it('skips orders that never executed (zero filled quantity)', async () => {
    setup({
      orders: [
        makeOrder({ id: 'filled', filled_quantity: '0.01' }),
        makeOrder({ id: 'unfilled', filled_quantity: '0', status: 'cancelled' }),
      ],
    });

    const txs = await new RevolutXLiveSource().fetch({});

    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe('revolut-x-live-order-filled');
  });

  it('pulls private trade fills for held pairs when there are no historical orders', async () => {
    setup({
      orders: [],
      balances: [
        { currency: 'BTC', total: '0.0012' },
        { currency: 'USD', total: '0' },
      ],
      pairs: {
        'BTC/USD': { base: 'BTC', quote: 'USD', status: 'active' },
        'ETH/USD': { base: 'ETH', quote: 'USD', status: 'active' }, // not held
      },
      tradesBySymbol: {
        'BTC-USD': [
          makeTrade({ tid: 'f-1', s: 'buy', qc: 'BTC', q: '0.0012', pc: 'USD', p: '50000' }),
        ],
      },
    });

    const txs = await new RevolutXLiveSource().fetch({});

    expect(txs).toHaveLength(1);
    const [tx] = txs;
    expect(tx.id).toBe('revolut-x-live-trade-f-1');
    expect(tx.type).toBe('buy');
    expect(tx.fromAsset).toBe('USD');
    expect(tx.fromAmount?.eq(new BigNumber('60'))).toBe(true); // 0.0012 × 50000
    expect(tx.toAsset).toBe('BTC');
    expect(tx.toAmount?.eq(new BigNumber('0.0012'))).toBe(true);
  });

  it('does not double-count a fill already represented by a fetched order', async () => {
    setup({
      orders: [makeOrder({ id: 'order-42', symbol: 'BTC/USD', filled_quantity: '0.01', filled_amount: '650' })],
      balances: [{ currency: 'BTC', total: '0.01' }],
      pairs: { 'BTC/USD': { base: 'BTC', quote: 'USD', status: 'active' } },
      tradesBySymbol: {
        'BTC-USD': [
          makeTrade({ tid: 'fill-of-42', oid: 'order-42' }), // same order → deduped
          makeTrade({ tid: 'standalone', oid: 'order-99' }), // no matching order → kept
        ],
      },
    });

    const txs = await new RevolutXLiveSource().fetch({});

    expect(txs.map((t) => t.id).sort()).toEqual([
      'revolut-x-live-order-order-42',
      'revolut-x-live-trade-standalone',
    ]);
  });

  it('filters out activity outside the requested date window', async () => {
    setup({
      orders: [
        makeOrder({ id: 'in', updated_date: Date.UTC(2025, 5, 1) }),
        makeOrder({ id: 'out', updated_date: Date.UTC(2024, 0, 1) }),
      ],
    });

    const txs = await new RevolutXLiveSource().fetch({
      from: new Date(Date.UTC(2025, 0, 1)),
      to: new Date(Date.UTC(2025, 11, 31)),
    });

    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe('revolut-x-live-order-in');
  });

  it('returns transactions sorted by date', async () => {
    setup({
      orders: [
        makeOrder({ id: 'late', updated_date: Date.UTC(2025, 8, 1) }),
        makeOrder({ id: 'early', updated_date: Date.UTC(2025, 1, 1) }),
      ],
    });

    const txs = await new RevolutXLiveSource().fetch({});

    expect(txs.map((t) => t.id)).toEqual([
      'revolut-x-live-order-early',
      'revolut-x-live-order-late',
    ]);
  });

  it('chunks a wide range into ≤30-day windows, paces requests, and reports progress', async () => {
    setup({
      orders: [],
      balances: [{ currency: 'BTC', total: '0.5' }],
      pairs: { 'BTC/USD': { base: 'BTC', quote: 'USD', status: 'active' } },
      tradesBySymbol: {},
    });

    const from = new Date(Date.UTC(2024, 0, 1));
    const to = new Date(Date.UTC(2024, 3, 1)); // ~91 days
    const expectedChunks = dateChunks(from.getTime(), to.getTime());
    expect(expectedChunks.length).toBeGreaterThan(1);

    const progress: { completed: number; total: number }[] = [];
    await new RevolutXLiveSource().fetch({ from, to, onProgress: (p) => progress.push(p) });

    const orderCalls = invokeMock.mock.calls.filter((c) => c[0] === 'revolut_x_fetch_orders');
    const tradeCalls = invokeMock.mock.calls.filter((c) => c[0] === 'revolut_x_fetch_trades');

    // One orders request per chunk, one trades request per (symbol × chunk).
    expect(orderCalls).toHaveLength(expectedChunks.length);
    expect(tradeCalls).toHaveLength(expectedChunks.length); // 1 held symbol

    // Each call carries a concrete numeric window — never null.
    for (const [, args] of orderCalls) {
      expect(typeof args.startMs).toBe('number');
      expect(typeof args.endMs).toBe('number');
      expect(args.endMs - args.startMs).toBeLessThanOrEqual(CHUNK_MS);
    }

    // Progress is reported per date period, climbing monotonically to the
    // number of chunks.
    const total = expectedChunks.length;
    expect(progress[progress.length - 1]).toEqual({ completed: total, total });
    const completedSeq = progress.map((p) => p.completed);
    expect(completedSeq).toEqual([...completedSeq].sort((a, b) => a - b));
    expect(progress.every((p) => p.total === total)).toBe(true);
  });

  it('defaults the end of the window to ~now when "to" is omitted', async () => {
    setup({ orders: [] });

    const before = Date.now();
    await new RevolutXLiveSource().fetch({ from: new Date(before - 5 * DAY_MS) });
    const after = Date.now();

    const [, args] = invokeMock.mock.calls.find((c) => c[0] === 'revolut_x_fetch_orders')!;
    // Single chunk for a 5-day range; its end is "now".
    expect(args.endMs).toBeGreaterThanOrEqual(before);
    expect(args.endMs).toBeLessThanOrEqual(after);
  });

  it('passes credentials through to the Tauri layer', async () => {
    invokeMock.mockResolvedValue(undefined);
    const source = new RevolutXLiveSource();

    await source.saveCredentials('rev-key', 'pem-secret');
    expect(invokeMock).toHaveBeenCalledWith('revolut_x_save_credentials', {
      apiKey: 'rev-key',
      secret: 'pem-secret',
    });

    invokeMock.mockResolvedValue(true);
    await expect(source.hasCredentials()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('revolut_x_has_credentials');

    invokeMock.mockResolvedValue(undefined);
    await source.clearCredentials();
    expect(invokeMock).toHaveBeenCalledWith('revolut_x_clear_credentials');
  });
});

describe('dateChunks', () => {
  it('returns a single span when the range is under 30 days', () => {
    const start = Date.UTC(2025, 5, 1);
    const end = start + 10 * DAY_MS;
    expect(dateChunks(start, end)).toEqual([[start, end]]);
  });

  it('returns a single span when start equals end', () => {
    const t = Date.UTC(2025, 5, 1);
    expect(dateChunks(t, t)).toEqual([[t, t]]);
  });

  it('splits a long range into consecutive, non-overlapping spans that cover it', () => {
    const start = Date.UTC(2024, 0, 1);
    const end = start + 90 * DAY_MS;
    const chunks = dateChunks(start, end);

    expect(chunks.length).toBeGreaterThan(1);
    // Covers the whole range.
    expect(chunks[0][0]).toBe(start);
    expect(chunks[chunks.length - 1][1]).toBe(end);
    // No span exceeds the cap; spans are consecutive and non-overlapping.
    chunks.forEach(([s, e], i) => {
      expect(e - s).toBeLessThanOrEqual(CHUNK_MS);
      expect(e).toBeGreaterThanOrEqual(s);
      if (i > 0) expect(s).toBe(chunks[i - 1][1] + 1);
    });
  });

  it('returns no spans when end precedes start', () => {
    const start = Date.UTC(2025, 5, 1);
    expect(dateChunks(start, start - DAY_MS)).toEqual([]);
  });
});
