import { describe, it, expect, beforeEach, vi } from 'vitest';
import BigNumber from 'bignumber.js';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('$lib/runtime', () => ({
  isTauri: () => true,
}));

import { CoinmateLiveSource } from '$lib/sources/coinmate-live';

interface WireTx {
  transactionId: number;
  timestamp: number;
  transactionType: string;
  amount: string;
  amountCurrency: string;
  price: string | null;
  priceCurrency: string | null;
  fee: string;
  feeCurrency: string;
  description: string | null;
  status: string;
  orderId: number | null;
}

const makeTx = (overrides: Partial<WireTx>): WireTx => ({
  transactionId: 1,
  timestamp: Date.UTC(2025, 5, 1, 12, 0, 0),
  transactionType: 'BUY',
  amount: '0.01',
  amountCurrency: 'BTC',
  price: '50000',
  priceCurrency: 'EUR',
  fee: '0',
  feeCurrency: 'EUR',
  description: null,
  status: 'OK',
  orderId: null,
  ...overrides,
});

const setup = (records: WireTx[]) => {
  invokeMock.mockImplementation((command: string) => {
    if (command === 'coinmate_fetch_transaction_history') {
      return Promise.resolve(records);
    }
    if (command === 'coinmate_has_credentials') return Promise.resolve(true);
    if (command === 'coinmate_save_credentials') return Promise.resolve(undefined);
    if (command === 'coinmate_clear_credentials') return Promise.resolve(undefined);
    return Promise.resolve(null);
  });
};

describe('CoinmateLiveSource', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('exposes the expected metadata', () => {
    const source = new CoinmateLiveSource();
    expect(source.exchangeName).toBe('Coinmate');
    expect(source.preprocessors).toEqual([]);
    expect(source.isAvailable()).toBe(true);
    expect(source.requiresSymbols).toBe(false);
    expect(source.requiresDateRange).toBe(false);
    expect(source.credentialFields.map((f) => f.id)).toEqual(['clientId', 'publicKey', 'privateKey']);
  });

  it('maps a BUY into a buy trade (quote out, base in, fee in feeCurrency)', async () => {
    setup([
      makeTx({
        transactionId: 11,
        transactionType: 'BUY',
        amount: '0.02055184',
        amountCurrency: 'BTC',
        price: '24243.86',
        priceCurrency: 'CZK',
        fee: '1.74',
        feeCurrency: 'CZK',
      }),
    ]);

    const [tx] = await new CoinmateLiveSource().fetch({});

    expect(tx.id).toBe('coinmate-live-tx-11');
    expect(tx.type).toBe('buy');
    expect(tx.fromAsset).toBe('CZK');
    expect(tx.fromAmount?.eq(new BigNumber('0.02055184').times('24243.86'))).toBe(true);
    expect(tx.toAsset).toBe('BTC');
    expect(tx.toAmount?.eq(new BigNumber('0.02055184'))).toBe(true);
    expect(tx.feeAsset).toBe('CZK');
    expect(tx.feeAmount?.eq(new BigNumber('1.74'))).toBe(true);
    expect(tx.exchange).toBe('Coinmate');
    // CZK is a fiat quote → used directly as the fiat value (no rate lookup).
    expect(tx.fiatCurrency).toBe('CZK');
    expect(tx.fiatValue?.eq(new BigNumber('0.02055184').times('24243.86'))).toBe(true);
  });

  it('maps a SELL with the legs swapped', async () => {
    setup([
      makeTx({
        transactionId: 12,
        transactionType: 'SELL',
        amount: '0.5',
        amountCurrency: 'BTC',
        price: '60000',
        priceCurrency: 'EUR',
        fee: '5',
        feeCurrency: 'EUR',
      }),
    ]);

    const [tx] = await new CoinmateLiveSource().fetch({});

    expect(tx.type).toBe('sell');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount?.eq(new BigNumber('0.5'))).toBe(true);
    expect(tx.toAsset).toBe('EUR');
    expect(tx.toAmount?.eq(new BigNumber('30000'))).toBe(true);
    expect(tx.feeAmount?.eq(new BigNumber('5'))).toBe(true);
    expect(tx.fiatCurrency).toBe('EUR');
  });

  it('treats INSTANT_BUY / QUICK_SELL as ordinary trades', async () => {
    setup([
      makeTx({ transactionId: 21, transactionType: 'INSTANT_BUY', amount: '1', amountCurrency: 'ETH', price: '2000', priceCurrency: 'USD', fee: '2', feeCurrency: 'USD' }),
      makeTx({ transactionId: 22, transactionType: 'QUICK_SELL', amount: '1', amountCurrency: 'ETH', price: '2000', priceCurrency: 'USDC', fee: '2', feeCurrency: 'USDC' }),
    ]);

    const txs = await new CoinmateLiveSource().fetch({});
    expect(txs).toHaveLength(2);
    const instant = txs.find((t) => t.id.endsWith('-21'))!;
    expect(instant.type).toBe('buy');
    // USD fiat → direct.
    expect(instant.fiatCurrency).toBe('USD');
    const quick = txs.find((t) => t.id.endsWith('-22'))!;
    expect(quick.type).toBe('sell');
    // USDC stablecoin → mapped 1:1 to USD fiat.
    expect(quick.fiatCurrency).toBe('USD');
  });

  it('drops trades with zero amount and trades whose price is null', async () => {
    setup([
      makeTx({ transactionId: 31, transactionType: 'BUY', amount: '0', price: '100', priceCurrency: 'EUR' }),
      makeTx({ transactionId: 32, transactionType: 'SELL', amount: '1', price: null, priceCurrency: null }),
    ]);

    const txs = await new CoinmateLiveSource().fetch({});
    expect(txs).toHaveLength(0);
  });

  it('maps a crypto-quoted trade and leaves it to price enrichment', async () => {
    setup([
      makeTx({
        transactionId: 40,
        transactionType: 'BUY',
        amount: '3',
        amountCurrency: 'ETH',
        price: '0.05',
        priceCurrency: 'BTC',
        fee: '0.0003',
        feeCurrency: 'BTC',
      }),
    ]);

    const [tx] = await new CoinmateLiveSource().fetch({});

    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount?.eq(new BigNumber('0.15'))).toBe(true); // 3 × 0.05
    // BTC is neither fiat nor a stablecoin — no inline fiat value, leave for enrichment.
    expect(tx.fiatCurrency).toBeUndefined();
    expect(tx.fiatValue).toBeUndefined();
  });

  it('maps a DEPOSIT as a transfer into the asset (with optional fee)', async () => {
    setup([
      makeTx({
        transactionId: 50,
        transactionType: 'DEPOSIT',
        amount: '1000',
        amountCurrency: 'CZK',
        fee: '0',
        feeCurrency: 'CZK',
        description: 'BANK_WIRE: 1000.00, CZK',
        status: 'PENDING',
      }),
    ]);

    const [tx] = await new CoinmateLiveSource().fetch({});

    expect(tx.type).toBe('transfer');
    expect(tx.toAsset).toBe('CZK');
    expect(tx.toAmount?.eq(new BigNumber('1000'))).toBe(true);
    expect(tx.fromAsset).toBeUndefined();
    expect(tx.feeAsset).toBeUndefined();
    expect(tx.notes).toBe('BANK_WIRE: 1000.00, CZK');
  });

  it('maps a WITHDRAWAL as a transfer out of the asset and attaches the fee', async () => {
    setup([
      makeTx({
        transactionId: 51,
        transactionType: 'WITHDRAWAL',
        amount: '0.05',
        amountCurrency: 'BTC',
        fee: '0.0005',
        feeCurrency: 'BTC',
        description: 'BTC withdrawal',
      }),
    ]);

    const [tx] = await new CoinmateLiveSource().fetch({});

    expect(tx.type).toBe('transfer');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount?.eq(new BigNumber('0.05'))).toBe(true);
    expect(tx.toAsset).toBeUndefined();
    expect(tx.feeAsset).toBe('BTC');
    expect(tx.feeAmount?.eq(new BigNumber('0.0005'))).toBe(true);
  });

  it('maps rewards/credits as incoming transfers and debits as outgoing transfers', async () => {
    setup([
      makeTx({ transactionId: 60, transactionType: 'NEW_USER_REWARD', amount: '5', amountCurrency: 'EUR', fee: '0', feeCurrency: 'EUR' }),
      makeTx({ transactionId: 61, transactionType: 'REFERRAL', amount: '10', amountCurrency: 'EUR', fee: '0', feeCurrency: 'EUR' }),
      makeTx({ transactionId: 62, transactionType: 'DEBIT', amount: '2.5', amountCurrency: 'EUR', fee: '0', feeCurrency: 'EUR' }),
    ]);

    const byId = Object.fromEntries((await new CoinmateLiveSource().fetch({})).map((t) => [t.id, t]));

    expect(byId['coinmate-live-tx-60'].type).toBe('transfer');
    expect(byId['coinmate-live-tx-60'].toAsset).toBe('EUR');
    expect(byId['coinmate-live-tx-61'].toAsset).toBe('EUR');
    expect(byId['coinmate-live-tx-62'].fromAsset).toBe('EUR');
  });

  it('skips voucher and OTHER transaction types', async () => {
    setup([
      makeTx({ transactionId: 70, transactionType: 'CREATE_VOUCHER', amount: '50', amountCurrency: 'EUR' }),
      makeTx({ transactionId: 71, transactionType: 'USED_VOUCHER', amount: '50', amountCurrency: 'EUR' }),
      makeTx({ transactionId: 72, transactionType: 'OTHER', amount: '1', amountCurrency: 'EUR' }),
    ]);

    const txs = await new CoinmateLiveSource().fetch({});
    expect(txs).toHaveLength(0);
  });

  it('skips CANCELED status rows regardless of type', async () => {
    setup([
      makeTx({ transactionId: 80, transactionType: 'BUY', amount: '1', price: '1', priceCurrency: 'EUR', amountCurrency: 'BTC', status: 'CANCELED' }),
      makeTx({ transactionId: 81, transactionType: 'WITHDRAWAL', amount: '1', amountCurrency: 'BTC', status: 'CANCELED' }),
      makeTx({ transactionId: 82, transactionType: 'BUY', amount: '1', price: '1', priceCurrency: 'EUR', amountCurrency: 'BTC', status: 'OK' }),
    ]);

    const txs = await new CoinmateLiveSource().fetch({});
    expect(txs.map((t) => t.id)).toEqual(['coinmate-live-tx-82']);
  });

  it('filters out transactions outside the requested window', async () => {
    setup([
      makeTx({ transactionId: 90, timestamp: Date.UTC(2024, 0, 1), transactionType: 'DEPOSIT', amount: '1', amountCurrency: 'EUR' }),
      makeTx({ transactionId: 91, timestamp: Date.UTC(2025, 5, 1), transactionType: 'DEPOSIT', amount: '1', amountCurrency: 'EUR' }),
    ]);

    const txs = await new CoinmateLiveSource().fetch({
      from: new Date(Date.UTC(2025, 0, 1)),
      to: new Date(Date.UTC(2025, 11, 31)),
    });

    expect(txs.map((t) => t.id)).toEqual(['coinmate-live-tx-91']);
  });

  it('returns transactions sorted by date and forwards the date window to the Tauri layer', async () => {
    setup([
      makeTx({ transactionId: 100, timestamp: Date.UTC(2025, 10, 1), transactionType: 'DEPOSIT', amount: '1', amountCurrency: 'EUR' }),
      makeTx({ transactionId: 101, timestamp: Date.UTC(2025, 1, 1), transactionType: 'DEPOSIT', amount: '1', amountCurrency: 'EUR' }),
    ]);

    const from = new Date(Date.UTC(2025, 0, 1));
    const to = new Date(Date.UTC(2025, 11, 31));
    const txs = await new CoinmateLiveSource().fetch({ from, to });

    expect(txs.map((t) => t.id)).toEqual(['coinmate-live-tx-101', 'coinmate-live-tx-100']);

    const [, args] = invokeMock.mock.calls.find((c) => c[0] === 'coinmate_fetch_transaction_history')!;
    expect(args.startMs).toBe(from.getTime());
    expect(args.endMs).toBe(to.getTime());
  });

  it('passes null for unbounded MS when no window is supplied', async () => {
    setup([]);

    await new CoinmateLiveSource().fetch({});

    const [, args] = invokeMock.mock.calls.find((c) => c[0] === 'coinmate_fetch_transaction_history')!;
    expect(args.startMs).toBeNull();
    expect(args.endMs).toBeNull();
  });

  it('omits the fee block when the fee is zero', async () => {
    setup([
      makeTx({
        transactionId: 110,
        transactionType: 'BUY',
        amount: '1',
        amountCurrency: 'BTC',
        price: '1000',
        priceCurrency: 'EUR',
        fee: '0',
        feeCurrency: 'EUR',
      }),
    ]);

    const [tx] = await new CoinmateLiveSource().fetch({});
    expect(tx.feeAsset).toBeUndefined();
    expect(tx.feeAmount).toBeUndefined();
  });

  it('passes credentials through to the Tauri layer', async () => {
    invokeMock.mockResolvedValue(undefined);
    const source = new CoinmateLiveSource();

    await source.saveCredentials({ clientId: '12345', publicKey: 'pub', privateKey: 'priv' });
    expect(invokeMock).toHaveBeenCalledWith('coinmate_save_credentials', {
      clientId: '12345',
      publicKey: 'pub',
      privateKey: 'priv',
    });

    invokeMock.mockResolvedValue(true);
    await expect(source.hasCredentials()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('coinmate_has_credentials');

    invokeMock.mockResolvedValue(undefined);
    await source.clearCredentials();
    expect(invokeMock).toHaveBeenCalledWith('coinmate_clear_credentials');
  });
});