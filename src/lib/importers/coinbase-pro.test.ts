import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { CoinbaseProImporter } from '$lib/importers/coinbase-pro';
import type { IExchangeImporter } from '$lib/types';

const bn = (n: number | string) => new BigNumber(n);

const HEADER = 'portfolio,trade id,product,side,created at,size,size unit,price,fee,total,price/fee/total unit';

const makeRow = (
  tradeId: string,
  product: string,
  side: string,
  createdAt: string,
  size: string,
  sizeUnit: string,
  price = '0',
  fee = '0',
  total = '0',
  totalUnit = 'USD',
  portfolio = 'default',
) => `${portfolio},${tradeId},${product},${side},${createdAt},${size},${sizeUnit},${price},${fee},${total},${totalUnit}`;

const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('CoinbaseProImporter', () => {
  const importer: IExchangeImporter = new CoinbaseProImporter();

  it('has exchangeName "Coinbase Pro"', () => {
    expect(importer.exchangeName).toBe('Coinbase Pro');
  });

  it('has no preprocessors — fills are always buy/sell, never an inbound transfer eligible for reclassification', () => {
    expect(importer.preprocessors).toHaveLength(0);
  });

  it('detect() returns true for a header-only Coinbase Pro Fills CSV', () => {
    expect(importer.detect(HEADER)).toBe(true);
  });

  it('detect() returns true for a header + data-row CSV', () => {
    const csvText = csv(makeRow('90210123', 'ETH-USD', 'BUY', '2021-04-02T10:15:00.000Z', '1.2', 'ETH'));
    expect(importer.detect(csvText)).toBe(true);
  });

  it('detect() returns false for an empty CSV', () => {
    expect(importer.detect('')).toBe(false);
  });

  it('detect() returns false for an unrelated CSV header', () => {
    expect(importer.detect('Foo,Bar,Baz\n1,2,3')).toBe(false);
  });

  it('does not false-positive against Binance, Ledger, Revolut X, or the regular Coinbase header', () => {
    const binanceHeader = 'User ID,Time,Account,Operation,Coin,Change,Remark';
    const ledgerHeader = 'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash';
    const revolutHeader = 'Symbol,Type,Quantity,Price,Value,Fees,Date';
    const coinbaseHeader =
      'Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes';
    expect(importer.detect(binanceHeader)).toBe(false);
    expect(importer.detect(ledgerHeader)).toBe(false);
    expect(importer.detect(revolutHeader)).toBe(false);
    expect(importer.detect(coinbaseHeader)).toBe(false);
  });

  it('throws on empty CSV', () => {
    expect(() => importer.parse('')).toThrow();
  });

  it('parses a header-only CSV as an empty list', () => {
    expect(importer.parse(HEADER)).toHaveLength(0);
  });

  it('throws when required columns are missing', () => {
    expect(() => importer.parse('trade id,product,side\n123,ETH-USD,BUY')).toThrow(/Missing required columns/);
  });

  it('parses a BUY fill as a buy: fiat leg from Total, crypto leg from Size', () => {
    const input = csv(
      makeRow('90210123', 'ETH-USD', 'BUY', '2021-04-02T10:15:00.000Z', '1.2', 'ETH', '1500.00', '5.40', '-1805.40', 'USD'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('buy');
    expect(tx.fromAsset).toBe('USD');
    expect(tx.fromAmount!.isEqualTo(bn('1805.40'))).toBe(true);
    expect(tx.toAsset).toBe('ETH');
    expect(tx.toAmount!.isEqualTo(bn('1.2'))).toBe(true);
    expect(tx.feeAsset).toBe('USD');
    expect(tx.feeAmount!.isEqualTo(bn('5.40'))).toBe(true);
    expect(tx.fiatCurrency).toBe('USD');
    expect(tx.fiatValue!.isEqualTo(bn('1805.40'))).toBe(true);
    expect(tx.exchange).toBe('Coinbase Pro');
    expect(tx.date).toEqual(new Date('2021-04-02T10:15:00.000Z'));
  });

  it('parses a SELL fill as a sell: crypto leg from Size, fiat leg from Total', () => {
    const input = csv(
      makeRow('55501234', 'BTC-EUR', 'SELL', '2020-11-19T08:30:00.000Z', '0.05', 'BTC', '30000.00', '3.75', '1496.25', 'EUR'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('sell');
    expect(tx.fromAsset).toBe('BTC');
    expect(tx.fromAmount!.isEqualTo(bn('0.05'))).toBe(true);
    expect(tx.toAsset).toBe('EUR');
    expect(tx.toAmount!.isEqualTo(bn('1496.25'))).toBe(true);
    expect(tx.feeAmount!.isEqualTo(bn('3.75'))).toBe(true);
  });

  it('is case-insensitive on side (lowercase "buy"/"sell")', () => {
    const input = csv(
      makeRow('11122233', 'ETH-USD', 'buy', '2021-01-05T00:00:00.000Z', '0.5', 'ETH', '2000', '1', '-1001', 'USD'),
    );
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('buy');
  });

  it('throws on an unrecognized side value', () => {
    const input = csv(
      makeRow('44455566', 'ETH-USD', 'CONVERT', '2021-01-05T00:00:00.000Z', '0.5', 'ETH', '2000', '1', '-1001', 'USD'),
    );

    expect(() => importer.parse(input)).toThrow(/Unrecognized Coinbase Pro fill side/);
  });

  it('omits fee fields when the fee is zero', () => {
    const input = csv(
      makeRow('77788899', 'ETH-USD', 'BUY', '2021-01-05T00:00:00.000Z', '0.5', 'ETH', '2000', '0', '-1000', 'USD'),
    );
    const [tx] = importer.parse(input);

    expect(tx.feeAsset).toBeUndefined();
    expect(tx.feeAmount).toBeUndefined();
  });

  it('throws on a "created at" timestamp that is not strict ISO 8601, instead of silently falling back to engine-dependent native parsing', () => {
    const input = csv(
      makeRow('12312312', 'ETH-USD', 'BUY', '2021-01-05 00:00:00 UTC', '0.5', 'ETH', '2000', '1', '-1001', 'USD'),
    );

    expect(() => importer.parse(input)).toThrow(/Unrecognized Coinbase Pro timestamp format/);
  });

  it('assigns unique ids per row', () => {
    const input = csv(
      makeRow('11111111', 'ETH-USD', 'BUY', '2021-01-01T00:00:00.000Z', '0.1', 'ETH', '2000', '1', '-201', 'USD'),
      makeRow('22222222', 'ETH-USD', 'BUY', '2021-01-02T00:00:00.000Z', '0.2', 'ETH', '2000', '1', '-401', 'USD'),
    );
    const txs = importer.parse(input);

    expect(txs[0].id).not.toBe(txs[1].id);
  });

  it('skips empty lines and whitespace-only lines', () => {
    const input = [
      HEADER,
      '',
      '  ',
      makeRow('33333333', 'ETH-USD', 'BUY', '2021-01-01T00:00:00.000Z', '0.1', 'ETH', '2000', '1', '-201', 'USD'),
    ].join('\n');
    expect(importer.parse(input)).toHaveLength(1);
  });
});
