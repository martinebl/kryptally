import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { reclassifyInboundAsBuys } from '$lib/preprocessors/reclassify-inbound-as-buys';
import type { Transaction, IImportPreprocessor } from '$lib/types';

const bn = (n: number | string) => new BigNumber(n);

const makeTx = (overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'date'>): Transaction => ({
  fiatCurrency: '',
  fiatValue: bn(0),
  ...overrides,
});

describe('reclassifyInboundAsBuys', () => {
  const preprocessor: IImportPreprocessor = reclassifyInboundAsBuys;

  it('has expected id and label', () => {
    expect(preprocessor.id).toBe('reclassify-inbound-as-buys');
    expect(preprocessor.label).toBeTruthy();
  });

  it('reclassifies an inbound transfer with fiat data as a buy', () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'transfer',
      date: new Date('2024-01-15T10:30:00.000Z'),
      toAsset: 'BTC',
      toAmount: bn('0.5'),
      fiatCurrency: 'DKK',
      fiatValue: bn('50000'),
    })];

    const result = preprocessor.apply(txs);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('buy');
    expect(result[0].toAsset).toBe('BTC');
    expect(result[0].toAmount!.isEqualTo(bn('0.5'))).toBe(true);
    expect(result[0].fromAsset).toBe('DKK');
    expect(result[0].fromAmount!.isEqualTo(bn('50000'))).toBe(true);
    expect(result[0].fiatCurrency).toBe('DKK');
    expect(result[0].fiatValue.isEqualTo(bn('50000'))).toBe(true);
  });

  it('does not modify outbound transfers', () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'transfer',
      date: new Date('2024-01-15T10:30:00.000Z'),
      fromAsset: 'BTC',
      fromAmount: bn('0.5'),
      fiatCurrency: 'DKK',
      fiatValue: bn('50000'),
    })];

    const result = preprocessor.apply(txs);

    expect(result[0].type).toBe('transfer');
  });

  it('does not modify inbound transfers without fiat data', () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'transfer',
      date: new Date('2024-01-15T10:30:00.000Z'),
      toAsset: 'BTC',
      toAmount: bn('0.5'),
    })];

    const result = preprocessor.apply(txs);

    expect(result[0].type).toBe('transfer');
  });

  it('does not modify inbound transfers with zero fiat value', () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'transfer',
      date: new Date('2024-01-15T10:30:00.000Z'),
      toAsset: 'BTC',
      toAmount: bn('0.5'),
      fiatCurrency: 'DKK',
      fiatValue: bn(0),
    })];

    const result = preprocessor.apply(txs);

    expect(result[0].type).toBe('transfer');
  });

  it('does not modify non-transfer transactions', () => {
    const txs = [makeTx({
      id: 'tx-1',
      type: 'sell',
      date: new Date('2024-01-15T10:30:00.000Z'),
      fromAsset: 'BTC',
      fromAmount: bn('0.5'),
      fiatCurrency: 'DKK',
      fiatValue: bn('50000'),
    })];

    const result = preprocessor.apply(txs);

    expect(result[0].type).toBe('sell');
  });

  it('only reclassifies eligible transactions in a mixed list', () => {
    const txs = [
      makeTx({
        id: 'tx-1',
        type: 'transfer',
        date: new Date('2024-01-15T10:30:00.000Z'),
        toAsset: 'BTC',
        toAmount: bn('0.5'),
        fiatCurrency: 'DKK',
        fiatValue: bn('50000'),
      }),
      makeTx({
        id: 'tx-2',
        type: 'transfer',
        date: new Date('2024-01-16T10:30:00.000Z'),
        fromAsset: 'BTC',
        fromAmount: bn('0.3'),
        fiatCurrency: 'DKK',
        fiatValue: bn('30000'),
      }),
      makeTx({
        id: 'tx-3',
        type: 'fee',
        date: new Date('2024-01-17T10:30:00.000Z'),
        feeAsset: 'BTC',
        feeAmount: bn('0.0001'),
      }),
    ];

    const result = preprocessor.apply(txs);

    expect(result[0].type).toBe('buy');
    expect(result[1].type).toBe('transfer');
    expect(result[2].type).toBe('fee');
  });

  it('isEligible returns true for inbound transfers with fiat data', () => {
    const tx = makeTx({
      id: 'tx-1',
      type: 'transfer',
      date: new Date('2024-01-15T10:30:00.000Z'),
      toAsset: 'BTC',
      toAmount: bn('0.5'),
      fiatCurrency: 'DKK',
      fiatValue: bn('50000'),
    });

    expect(preprocessor.isEligible(tx)).toBe(true);
  });

  it('isEligible returns false for non-eligible transactions', () => {
    const outbound = makeTx({
      id: 'tx-1',
      type: 'transfer',
      date: new Date('2024-01-15T10:30:00.000Z'),
      fromAsset: 'BTC',
      fromAmount: bn('0.5'),
    });
    const fee = makeTx({
      id: 'tx-2',
      type: 'fee',
      date: new Date('2024-01-15T10:30:00.000Z'),
      feeAsset: 'BTC',
      feeAmount: bn('0.0001'),
    });

    expect(preprocessor.isEligible(outbound)).toBe(false);
    expect(preprocessor.isEligible(fee)).toBe(false);
  });

  it('only transforms selected transactions when selectedIds is provided', () => {
    const txs = [
      makeTx({
        id: 'tx-1',
        type: 'transfer',
        date: new Date('2024-01-15T10:30:00.000Z'),
        toAsset: 'BTC',
        toAmount: bn('0.5'),
        fiatCurrency: 'DKK',
        fiatValue: bn('50000'),
      }),
      makeTx({
        id: 'tx-2',
        type: 'transfer',
        date: new Date('2024-01-16T10:30:00.000Z'),
        toAsset: 'ETH',
        toAmount: bn('2.0'),
        fiatCurrency: 'DKK',
        fiatValue: bn('30000'),
      }),
    ];

    const result = preprocessor.apply(txs, new Set(['tx-1']));

    expect(result[0].type).toBe('buy');
    expect(result[1].type).toBe('transfer');
  });

  it('transforms all eligible when selectedIds is not provided', () => {
    const txs = [
      makeTx({
        id: 'tx-1',
        type: 'transfer',
        date: new Date('2024-01-15T10:30:00.000Z'),
        toAsset: 'BTC',
        toAmount: bn('0.5'),
        fiatCurrency: 'DKK',
        fiatValue: bn('50000'),
      }),
      makeTx({
        id: 'tx-2',
        type: 'transfer',
        date: new Date('2024-01-16T10:30:00.000Z'),
        toAsset: 'ETH',
        toAmount: bn('2.0'),
        fiatCurrency: 'DKK',
        fiatValue: bn('30000'),
      }),
    ];

    const result = preprocessor.apply(txs);

    expect(result[0].type).toBe('buy');
    expect(result[1].type).toBe('buy');
  });

  it('does not mutate the original transactions', () => {
    const original = makeTx({
      id: 'tx-1',
      type: 'transfer',
      date: new Date('2024-01-15T10:30:00.000Z'),
      toAsset: 'BTC',
      toAmount: bn('0.5'),
      fiatCurrency: 'DKK',
      fiatValue: bn('50000'),
    });

    preprocessor.apply([original]);

    expect(original.type).toBe('transfer');
  });
});