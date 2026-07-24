import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { CoinbaseImporter } from '$lib/importers/coinbase';
import type { IExchangeImporter } from '$lib/types';

const bn = (n: number | string) => new BigNumber(n);

const HEADER =
  'Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes';

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

  it('parses the "YYYY-MM-DD HH:mm:ss UTC" timestamp format used by real Coinbase exports', () => {
    const input = csv(makeRow('2022-04-12 18:05:30 UTC', 'Buy', 'BTC', '0.01', 'USD', '20000', '200', '201', '1'));
    const [tx] = importer.parse(input);

    expect(tx.date).toEqual(new Date('2022-04-12T18:05:30.000Z'));
  });

  it('throws on a Timestamp matching neither the Coinbase nor the ISO 8601 format, instead of silently falling back to engine-dependent native parsing', () => {
    const input = csv(makeRow('04/12/2022 18:05:30', 'Buy', 'BTC', '0.01', 'USD', '20000', '200', '201', '1'));

    expect(() => importer.parse(input)).toThrow(/Unrecognized Coinbase timestamp format/);
  });

  it('strips currency-symbol prefixes (e.g. a "kr" DKK prefix) from fiat amount fields', () => {
    const input = csv(
      makeRow('2022-06-01T00:00:00Z', 'Buy', 'BTC', '0.002', 'DKK', 'kr140000.5', 'kr280.00', 'kr282.50', 'kr2.50'),
    );
    const [tx] = importer.parse(input);

    expect(tx.fiatValue!.isEqualTo(bn('282.50'))).toBe(true);
    expect(tx.feeAmount!.isEqualTo(bn('2.50'))).toBe(true);
  });

  it('uses the sign of Quantity Transacted, not the type keyword, to set direction for unrecognized fiat movement types', () => {
    const inbound = csv(
      makeRow('2022-07-01T00:00:00Z', 'Pro Withdrawal', 'EUR', '75', 'DKK', 'kr12.30', 'kr558.75', 'kr558.75', 'kr0.00'),
    );
    const [inTx] = importer.parse(inbound);
    expect(inTx.type).toBe('transfer');
    expect(inTx.toAsset).toBe('EUR');
    expect(inTx.toAmount!.isEqualTo(bn('75'))).toBe(true);
    expect(inTx.fromAsset).toBeUndefined();

    const outbound = csv(
      makeRow('2022-07-02T00:00:00Z', 'Exchange Deposit', 'EUR', '-40', 'DKK', 'kr12.30', '-kr298.00', '-kr298.00', 'kr0.00'),
    );
    const [outTx] = importer.parse(outbound);
    expect(outTx.type).toBe('transfer');
    expect(outTx.fromAsset).toBe('EUR');
    expect(outTx.fromAmount!.isEqualTo(bn('40'))).toBe(true);
    expect(outTx.toAsset).toBeUndefined();
  });

  it('accepts extra columns beyond the required set (ID, Sender Address, Recipient Address)', () => {
    const extraHeader = `ID,${HEADER},Sender Address,Recipient Address`;
    const input = [
      extraHeader,
      `7,${makeRow('2022-08-01T00:00:00Z', 'Buy', 'BTC', '0.01', 'USD', '20000', '200', '201', '1')},,`,
    ].join('\n');
    const [tx] = importer.parse(input);

    expect(tx.type).toBe('buy');
  });

  describe('with the "Transactions" / "User" preamble real exports include', () => {
    const withPreamble = (...lines: string[]) =>
      ['Transactions', 'User,Jane Example,ab12cd34-0000-4000-8000-000000000000', `ID,${HEADER},Sender Address,Recipient Address`, ...lines].join(
        '\n',
      );

    it('detect() returns true', () => {
      expect(importer.detect(withPreamble())).toBe(true);
    });

    it('parse() strips the preamble and parses the data rows', () => {
      const input = withPreamble(
        `3,${makeRow('2022-09-10T00:00:00Z', 'Buy', 'ETH', '0.75', 'USD', '1500.00', '1125.00', '1130.00', '5.00')},,`,
      );
      const [tx] = importer.parse(input);

      expect(tx.type).toBe('buy');
      expect(tx.toAsset).toBe('ETH');
      expect(tx.toAmount!.isEqualTo(bn('0.75'))).toBe(true);
    });
  });
});
