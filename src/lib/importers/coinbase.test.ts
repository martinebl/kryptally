import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { CoinbaseImporter } from '$lib/importers/coinbase';
import type { IExchangeImporter } from '$lib/types';

const bn = (n: number | string) => new BigNumber(n);

const HEADER =
  'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes';

const makeRow = (
  timestamp: string,
  type: string,
  asset: string,
  quantity: string,
  spotCurrency = 'USD',
  spotPrice = '0',
  subtotal = '0',
  total = '0',
  fees = '0',
  notes = '',
) => `${timestamp},${type},${asset},${quantity},${spotCurrency},${spotPrice},${subtotal},${total},${fees},${notes}`;

const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('CoinbaseImporter', () => {
  const importer: IExchangeImporter = new CoinbaseImporter();

  it('has exchangeName "Coinbase"', () => {
    expect(importer.exchangeName).toBe('Coinbase');
  });

  it('detect() returns true for a header-only Coinbase CSV', () => {
    expect(importer.detect(HEADER)).toBe(true);
  });

  it('detect() returns true for a header + data-row Coinbase CSV', () => {
    const csvText = csv(makeRow('2024-02-11T09:30:00Z', 'Buy', 'BTC', '0.0234'));
    expect(importer.detect(csvText)).toBe(true);
  });

  it('detect() returns false for an empty CSV', () => {
    expect(importer.detect('')).toBe(false);
  });

  it('detect() returns false for an unrelated CSV header', () => {
    expect(importer.detect('Foo,Bar,Baz\n1,2,3')).toBe(false);
  });

  it('detect() does not match a Binance, Ledger, or Revolut X header', () => {
    const binanceHeader = 'User ID,Time,Account,Operation,Coin,Change,Remark';
    const ledgerHeader = 'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash';
    const revolutHeader = 'Symbol,Type,Quantity,Price,Value,Fees,Date';
    expect(importer.detect(binanceHeader)).toBe(false);
    expect(importer.detect(ledgerHeader)).toBe(false);
    expect(importer.detect(revolutHeader)).toBe(false);
  });

  it('throws on empty CSV', () => {
    expect(() => importer.parse('')).toThrow();
  });

  it('parses a header-only CSV as an empty list', () => {
    expect(importer.parse(HEADER)).toHaveLength(0);
  });

  it('throws when required columns are missing', () => {
    expect(() => importer.parse('Timestamp,Transaction Type,Asset\n2024-01-01T00:00:00Z,Buy,BTC')).toThrow(
      /Missing required columns/,
    );
  });

  it('parses a Buy as a buy with fiat and crypto legs', () => {
    const input = csv(
      makeRow('2023-05-02T14:20:00Z', 'Buy', 'ETH', '1.5', 'USD', '1800.00', '2700.00', '2715.50', '15.50'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('buy');
    expect(tx.toAsset).toBe('ETH');
    expect(tx.toAmount!.isEqualTo(bn('1.5'))).toBe(true);
    expect(tx.fromAsset).toBe('USD');
    expect(tx.fromAmount!.isEqualTo(bn('2715.50'))).toBe(true);
    expect(tx.feeAsset).toBe('USD');
    expect(tx.feeAmount!.isEqualTo(bn('15.50'))).toBe(true);
    expect(tx.fiatCurrency).toBe('USD');
    expect(tx.fiatValue!.isEqualTo(bn('2715.50'))).toBe(true);
    expect(tx.exchange).toBe('Coinbase');
    expect(tx.date).toEqual(new Date('2023-05-02T14:20:00Z'));
  });

  it('parses a Sell as a sell with fiat and crypto legs', () => {
    const input = csv(
      makeRow('2023-06-10T08:00:00Z', 'Sell', 'BTC', '0.1', 'USD', '30000.00', '3000.00', '2990.00', '10.00'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('sell');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount!.isEqualTo(bn('0.1'))).toBe(true);
    expect(tx.toAsset).toBe('USD');
    expect(tx.toAmount!.isEqualTo(bn('2990.00'))).toBe(true);
    expect(tx.feeAmount!.isEqualTo(bn('10.00'))).toBe(true);
  });

  it('parses a Send as an outbound transfer with no fiat counter-leg', () => {
    const input = csv(
      makeRow('2023-07-01T12:00:00Z', 'Send', 'ETH', '0.5', 'USD', '1900.00', '950.00', '950.00'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('transfer');
    expect(tx.fromAsset).toBe('ETH');
    expect(tx.fromAmount!.isEqualTo(bn('0.5'))).toBe(true);
    expect(tx.toAsset).toBeUndefined();
    expect(tx.fiatValue!.isEqualTo(bn('950.00'))).toBe(true);
  });

  it('parses a Receive as an inbound transfer with no fiat counter-leg', () => {
    const input = csv(
      makeRow('2023-07-05T09:00:00Z', 'Receive', 'BTC', '0.02', 'USD', '29000.00', '580.00', '580.00'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('transfer');
    expect(tx.toAsset).toBe('BTC');
    expect(tx.toAmount!.isEqualTo(bn('0.02'))).toBe(true);
    expect(tx.fromAsset).toBeUndefined();
  });

  it('parses a Convert as a trade with only the source leg (no destination column in the CSV)', () => {
    const input = csv(
      makeRow('2023-08-01T00:00:00Z', 'Convert', 'USDC', '500', 'USD', '1.00', '500.00', '500.00'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('trade');
    expect(tx.fromAsset).toBe('USDC');
    expect(tx.fromAmount!.isEqualTo(bn('500'))).toBe(true);
    expect(tx.toAsset).toBeUndefined();
  });

  it('maps a staking-style reward type to staking income', () => {
    const input = csv(
      makeRow('2023-09-01T00:00:00Z', 'Staking Income', 'DOT', '3.2', 'USD', '5.00', '16.00', '16.00'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('staking');
    expect(tx.toAsset).toBe('DOT');
    expect(tx.fiatValue!.isEqualTo(bn('16.00'))).toBe(true);
  });

  it('maps a Coinbase Earn / learning reward type to airdrop', () => {
    const input = csv(
      makeRow('2023-09-15T00:00:00Z', 'Coinbase Earn', 'ALGO', '10', 'USD', '0.20', '2.00', '2.00'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('airdrop');
    expect(tx.toAsset).toBe('ALGO');
  });

  it('falls back to an inbound transfer for an unrecognized transaction type', () => {
    const input = csv(
      makeRow('2023-10-01T00:00:00Z', 'Some New Feature', 'XLM', '25'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('transfer');
    expect(tx.toAsset).toBe('XLM');
  });

  it('omits fee fields when the fee is zero', () => {
    const input = csv(
      makeRow('2023-07-05T09:00:00Z', 'Receive', 'BTC', '0.02', 'USD', '29000.00', '580.00', '580.00', '0'),
    );
    const [tx] = importer.parse(input);

    expect(tx.feeAsset).toBeUndefined();
    expect(tx.feeAmount).toBeUndefined();
  });

  it('leaves fiatValue undefined when Total is blank or zero', () => {
    const input = csv(
      makeRow('2023-07-05T09:00:00Z', 'Receive', 'BTC', '0.02'),
    );
    const [tx] = importer.parse(input);

    expect(tx.fiatValue).toBeUndefined();
  });

  it('carries Notes through when present', () => {
    const input = csv(
      makeRow('2023-07-05T09:00:00Z', 'Receive', 'BTC', '0.02', 'USD', '0', '0', '0', '0', 'From external wallet'),
    );
    const [tx] = importer.parse(input);

    expect(tx.notes).toBe('From external wallet');
  });

  it('assigns unique ids per row', () => {
    const input = csv(
      makeRow('2023-01-01T00:00:00Z', 'Buy', 'BTC', '0.01', 'USD', '20000', '200', '201', '1'),
      makeRow('2023-01-02T00:00:00Z', 'Buy', 'BTC', '0.02', 'USD', '20500', '410', '412', '2'),
    );
    const txs = importer.parse(input);

    expect(txs[0].id).not.toBe(txs[1].id);
  });

  it('exposes the reclassify-inbound-as-buys preprocessor', () => {
    expect(importer.preprocessors.length).toBeGreaterThan(0);
    expect(importer.preprocessors[0].id).toBe('reclassify-inbound-as-buys');
  });

  it('skips empty lines and whitespace-only lines', () => {
    const input = [HEADER, '', '  ', makeRow('2023-01-01T00:00:00Z', 'Buy', 'BTC', '0.01', 'USD', '20000', '200', '201', '1')].join(
      '\n',
    );
    expect(importer.parse(input)).toHaveLength(1);
  });
});
