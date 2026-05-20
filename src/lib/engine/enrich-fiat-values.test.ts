import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { enrichFiatValues } from '$lib/engine/enrich-fiat-values';
import type { Transaction } from '$lib/types/transaction';
import type { ICryptoToFiatConverter } from '$lib/types/converters';

const bn = (n: number | string) => new BigNumber(n);

const makeTx = (overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'date'>): Transaction => ({
  ...overrides,
});

const mockConverter: ICryptoToFiatConverter = {
  getRate: async (asset: string, fiatCurrency: string, _datetime: Date) => {
    // Crypto rates (returned as-is regardless of target currency for simplicity)
    const cryptoRates: Record<string, BigNumber> = {
      BTC: bn('60000'),
      ETH: bn('3000'),
    };
    if (cryptoRates[asset]) return cryptoRates[asset];

    // Fiat-to-fiat rates (from → to)
    const fiatKey = `${asset}-${fiatCurrency}`;
    const fiatRates: Record<string, BigNumber> = {
      'USD-DKK': bn('7'),
      'EUR-DKK': bn('7.5'),
      'EUR-CZK': bn('25'),
    };
    const rate = fiatRates[fiatKey];
    if (!rate) throw new Error(`No rate for ${asset}/${fiatCurrency}`);
    return rate;
  },
};

describe('enrichFiatValues', () => {
  it('enriches a buy transaction using toAsset', async () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'buy',
      date: new Date('2024-01-15'),
      toAsset: 'BTC',
      toAmount: bn('0.5'),
    })];

    const result = await enrichFiatValues(txs, mockConverter, 'DKK');

    expect(result.transactions[0].fiatCurrency).toBe('DKK');
    expect(result.transactions[0].fiatValue!.isEqualTo(bn('30000'))).toBe(true);
  });

  it('enriches a sell transaction using fromAsset', async () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'sell',
      date: new Date('2024-01-15'),
      fromAsset: 'ETH',
      fromAmount: bn('2'),
    })];

    const result = await enrichFiatValues(txs, mockConverter, 'DKK');

    expect(result.transactions[0].fiatValue!.isEqualTo(bn('6000'))).toBe(true);
  });

  it('enriches a fee transaction using feeAsset', async () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'fee',
      date: new Date('2024-01-15'),
      feeAsset: 'BTC',
      feeAmount: bn('0.001'),
    })];

    const result = await enrichFiatValues(txs, mockConverter, 'DKK');

    expect(result.transactions[0].fiatValue!.isEqualTo(bn('60'))).toBe(true);
  });

  it('passes through transactions already in the target currency', async () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'buy',
      date: new Date('2024-01-15'),
      toAsset: 'BTC',
      toAmount: bn('0.5'),
      fiatCurrency: 'DKK',
      fiatValue: bn('29000'),
    })];

    const result = await enrichFiatValues(txs, mockConverter, 'DKK');

    expect(result.transactions[0].fiatCurrency).toBe('DKK');
    expect(result.transactions[0].fiatValue!.isEqualTo(bn('29000'))).toBe(true);
  });

  it('converts fiatValue when it is in a different currency than the target', async () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'buy',
      date: new Date('2024-06-15'),
      toAsset: 'BTC',
      toAmount: bn('0.1'),
      fiatCurrency: 'EUR',
      fiatValue: bn('4000'),
    })];

    const result = await enrichFiatValues(txs, mockConverter, 'DKK');

    // 4000 EUR * 7.5 EUR→DKK = 30000 DKK
    expect(result.transactions[0].fiatCurrency).toBe('DKK');
    expect(result.transactions[0].fiatValue!.isEqualTo(bn('30000'))).toBe(true);
    expect(result.failed).toBe(0);
  });

  it('leaves fiatValue undefined when converter throws', async () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'buy',
      date: new Date('2024-01-15'),
      toAsset: 'UNKNOWN',
      toAmount: bn('100'),
    })];

    const result = await enrichFiatValues(txs, mockConverter, 'DKK');

    expect(result.transactions[0].fiatValue).toBeUndefined();
    expect(result.failed).toBe(1);
  });

  it('does not mutate the original transactions', async () => {
    const original = makeTx({
      id: 'tx-1',
      type: 'buy',
      date: new Date('2024-01-15'),
      toAsset: 'BTC',
      toAmount: bn('0.5'),
    });

    const result = await enrichFiatValues([original], mockConverter, 'DKK');

    expect(original.fiatValue).toBeUndefined();
    expect(result.transactions[0].fiatValue).toBeDefined();
  });

  it('enriches a trade using fromAsset for proceeds', async () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'trade',
      date: new Date('2024-01-15'),
      fromAsset: 'BTC',
      fromAmount: bn('0.1'),
      toAsset: 'ETH',
      toAmount: bn('2'),
    })];

    const result = await enrichFiatValues(txs, mockConverter, 'DKK');

    // Trade proceeds = value of what you gave up
    expect(result.transactions[0].fiatValue!.isEqualTo(bn('6000'))).toBe(true);
  });

  it('uses the default priority list to pick toAsset when it ranks higher', async () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'trade',
      date: new Date('2024-01-15'),
      fromAsset: 'SMALLCOIN',
      fromAmount: bn('100'),
      toAsset: 'BTC',
      toAmount: bn('0.1'),
    })];

    const result = await enrichFiatValues(txs, mockConverter, 'DKK');

    expect(result.transactions[0].fiatValue!.isEqualTo(bn('6000'))).toBe(true);
  });
});
