import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { RevolutXImporter } from '$lib/importers/revolut-x';

const header = 'Symbol,Type,Quantity,Price,Value,Fees,Date';

const makeCsv = (...rows: string[]): string =>
  [header, ...rows].join('\n');

describe('RevolutXImporter', () => {
  const importer = new RevolutXImporter();

  it('has the correct exchange name', () => {
    expect(importer.exchangeName).toBe('Revolut X');
  });

  it('throws on empty CSV', () => {
    expect(() => importer.parse('')).toThrow('CSV is empty');
  });

  it('throws on missing required columns', () => {
    expect(() => importer.parse('Symbol,Type\nBTC,Buy')).toThrow('Missing required columns');
  });

  it('skips "Other" rows (fiat deposits)', () => {
    const csv = makeCsv(
      'DKK,Other,,,500.00 DKK,0.00 DKK,"14 Apr 2021, 09:15:22"',
    );
    const txs = importer.parse(csv);
    expect(txs).toHaveLength(0);
  });

  it('parses a Buy with USD-prefixed values', () => {
    const csv = makeCsv(
      'BTC,Buy - Revolut X,0.01916167,$66800.02,$1280.00,$0.00,"28 Jun 2021, 14:30:00"',
    );
    const txs = importer.parse(csv);
    expect(txs).toHaveLength(1);

    const tx = txs[0];
    expect(tx.type).toBe('buy');
    expect(tx.toAsset).toBe('BTC');
    expect(tx.toAmount).toEqual(new BigNumber('0.01916167'));
    expect(tx.fromAsset).toBe('USD');
    expect(tx.fromAmount).toEqual(new BigNumber('1280.00'));
    expect(tx.fiatCurrency).toBe('USD');
    expect(tx.fiatValue).toEqual(new BigNumber('1280.00'));
    expect(tx.feeAmount).toBeUndefined();
    expect(tx.exchange).toBe('Revolut X');
  });

  it('parses a Buy with DKK-suffixed values', () => {
    const csv = makeCsv(
      'BTC,Buy - Revolut X,0.005,450000.00 DKK,2250.00 DKK,10.00 DKK,"10 Sep 2021, 11:00:00"',
    );
    const txs = importer.parse(csv);
    expect(txs).toHaveLength(1);

    const tx = txs[0];
    expect(tx.type).toBe('buy');
    expect(tx.fromAsset).toBe('DKK');
    expect(tx.fromAmount).toEqual(new BigNumber('2250.00'));
    expect(tx.fiatCurrency).toBe('DKK');
    expect(tx.fiatValue).toEqual(new BigNumber('2250.00'));
    expect(tx.feeAsset).toBe('DKK');
    expect(tx.feeAmount).toEqual(new BigNumber('10.00'));
  });

  it('parses a Sell transaction', () => {
    const csv = makeCsv(
      'BTC,Sell - Revolut X,0.01,$70000.00,$700.00,$1.50,"05 Feb 2021, 08:00:00"',
    );
    const txs = importer.parse(csv);
    expect(txs).toHaveLength(1);

    const tx = txs[0];
    expect(tx.type).toBe('sell');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount).toEqual(new BigNumber('0.01'));
    expect(tx.toAsset).toBe('USD');
    expect(tx.toAmount).toEqual(new BigNumber('700.00'));
    expect(tx.fiatCurrency).toBe('USD');
    expect(tx.fiatValue).toEqual(new BigNumber('700.00'));
    expect(tx.feeAsset).toBe('USD');
    expect(tx.feeAmount).toEqual(new BigNumber('1.50'));
  });

  it('parses a Send (outbound transfer)', () => {
    const csv = makeCsv(
      'BTC,Send,0.02133545,439980.15 DKK,9387.17 DKK,27.07 DKK,"28 Jun 2021, 15:45:10"',
    );
    const txs = importer.parse(csv);
    expect(txs).toHaveLength(1);

    const tx = txs[0];
    expect(tx.type).toBe('transfer');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount).toEqual(new BigNumber('0.02133545'));
    expect(tx.fiatCurrency).toBe('DKK');
    expect(tx.fiatValue).toEqual(new BigNumber('9387.17'));
    expect(tx.feeAsset).toBe('DKK');
    expect(tx.feeAmount).toEqual(new BigNumber('27.07'));
    expect(tx.toAsset).toBeUndefined();
  });

  it('parses a Receive (inbound transfer)', () => {
    const csv = makeCsv(
      'ETH,Receive,1.5,2500.00 DKK,3750.00 DKK,0.00 DKK,"20 Nov 2021, 10:00:00"',
    );
    const txs = importer.parse(csv);
    expect(txs).toHaveLength(1);

    const tx = txs[0];
    expect(tx.type).toBe('transfer');
    expect(tx.toAsset).toBe('ETH');
    expect(tx.toAmount).toEqual(new BigNumber('1.5'));
    expect(tx.fiatCurrency).toBe('DKK');
    expect(tx.fiatValue).toEqual(new BigNumber('3750.00'));
    expect(tx.fromAsset).toBeUndefined();
  });

  it('parses dates correctly', () => {
    const csv = makeCsv(
      'BTC,Buy - Revolut X,0.01,$50000.00,$500.00,$0.00,"5 Mar 2021, 09:05"',
    );
    const txs = importer.parse(csv);
    const date = txs[0].date;
    expect(date.getFullYear()).toBe(2021);
    expect(date.getMonth()).toBe(2); // March
    expect(date.getDate()).toBe(5);
  });

  it('handles a mixed CSV with Other rows filtered out', () => {
    const csv = makeCsv(
      'DKK,Other,,,500.00 DKK,0.00 DKK,"14 Apr 2021, 09:15:22"',
      'DKK,Other,,,500.00 DKK,0.00 DKK,"14 Apr 2021, 09:17"',
      'BTC,Buy - Revolut X,0.01916167,$66800.02,$1280.00,$0.00,"28 Jun 2021, 14:30:00"',
      'BTC,Send,0.02133545,439980.15 DKK,9387.17 DKK,27.07 DKK,"28 Jun 2021, 15:45:10"',
    );
    const txs = importer.parse(csv);
    expect(txs).toHaveLength(2);
    expect(txs[0].type).toBe('buy');
    expect(txs[1].type).toBe('transfer');
  });

  it('parses a Learn reward as an airdrop', () => {
    const csv = makeCsv(
      'FLR,Learn reward,42.123456789,,,,"3 Mar 2022, 11:20:00"',
    );
    const txs = importer.parse(csv);
    expect(txs).toHaveLength(1);

    const tx = txs[0];
    expect(tx.type).toBe('airdrop');
    expect(tx.toAsset).toBe('FLR');
    expect(tx.toAmount).toEqual(new BigNumber('42.123456789'));
    expect(tx.fromAsset).toBeUndefined();
    expect(tx.fromAmount).toBeUndefined();
    expect(tx.fiatValue).toBeUndefined();
    expect(tx.exchange).toBe('Revolut X');
  });

  it('generates unique IDs per transaction', () => {
    const csv = makeCsv(
      'BTC,Buy - Revolut X,0.01,$50000.00,$500.00,$0.00,"5 Mar 2021, 09:05"',
      'ETH,Buy - Revolut X,1.0,$3000.00,$3000.00,$0.00,"6 Mar 2021, 10:00:00"',
    );
    const txs = importer.parse(csv);
    const ids = txs.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
