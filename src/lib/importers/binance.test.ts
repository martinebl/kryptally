import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { BinanceImporter } from '$lib/importers/binance';

const bn = (n: number | string) => new BigNumber(n);

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

const makeCSV = (...rows: string[]): string =>
  [HEADER, ...rows].join('\n');

describe('BinanceImporter', () => {
  const importer = new BinanceImporter();

  it('has expected exchange name', () => {
    expect(importer.exchangeName).toBe('Binance');
  });

  it('throws on empty CSV', () => {
    expect(() => importer.parse('')).toThrow('CSV is empty');
  });

  it('detect() returns true for a header-only Binance CSV', () => {
    expect(importer.detect(HEADER)).toBe(true);
  });

  it('detect() returns true for a header + data-row Binance CSV', () => {
    const csv = makeCSV('123,20-03-15 10:00:00,Spot,Deposit,USD,545,');
    expect(importer.detect(csv)).toBe(true);
  });

  it('detect() returns false for an empty CSV', () => {
    expect(importer.detect('')).toBe(false);
  });

  it('detect() returns false for an unrelated CSV header', () => {
    expect(importer.detect('Foo,Bar,Baz\n1,2,3')).toBe(false);
  });

  it('detect() does not match a Ledger or Revolut X header', () => {
    const ledgerHeader =
      'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date';
    const revolutHeader = 'Symbol,Type,Quantity,Price,Value,Fees,Date';
    expect(importer.detect(ledgerHeader)).toBe(false);
    expect(importer.detect(revolutHeader)).toBe(false);
  });

  it('throws on missing required columns', () => {
    expect(() => importer.parse('Foo,Bar\n1,2')).toThrow('Missing required columns');
  });

  it('parses a fiat deposit as a single transfer-in', () => {
    const csv = makeCSV(
      '123,20-03-15 10:00:00,Spot,Deposit,USD,545,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('transfer');
    expect(result[0].toAsset).toBe('USD');
    expect(result[0].toAmount!.isEqualTo(bn('545'))).toBe(true);
  });

  it('groups related rows by timestamp into a buy transaction', () => {
    const csv = makeCSV(
      '123,20-03-15 10:00:00,Spot,Transaction Related,USD,-545,',
      '123,20-03-15 10:00:01,Spot,Buy,BTC,0.012,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('buy');
    expect(result[0].fromAsset).toBe('USD');
    expect(result[0].fromAmount!.isEqualTo(bn('545'))).toBe(true);
    expect(result[0].toAsset).toBe('BTC');
    expect(result[0].toAmount!.isEqualTo(bn('0.012'))).toBe(true);
  });

  it('groups related rows into a sell transaction', () => {
    const csv = makeCSV(
      '123,20-03-15 10:00:00,Spot,Sell,BTC,-0.012,',
      '123,20-03-15 10:00:01,Spot,Transaction Related,USD,545,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('sell');
    expect(result[0].fromAsset).toBe('BTC');
    expect(result[0].fromAmount!.isEqualTo(bn('0.012'))).toBe(true);
    expect(result[0].toAsset).toBe('USD');
    expect(result[0].toAmount!.isEqualTo(bn('545'))).toBe(true);
  });

  it('groups a buy with a fee row', () => {
    const csv = makeCSV(
      '123,20-03-15 10:00:00,Spot,Transaction Related,USD,-100,',
      '123,20-03-15 10:00:00,Spot,Buy,BTC,0.002,',
      '123,20-03-15 10:00:00,Spot,Fee,BNB,-0.001,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('buy');
    expect(result[0].fromAsset).toBe('USD');
    expect(result[0].fromAmount!.isEqualTo(bn('100'))).toBe(true);
    expect(result[0].toAsset).toBe('BTC');
    expect(result[0].toAmount!.isEqualTo(bn('0.002'))).toBe(true);
    expect(result[0].feeAsset).toBe('BNB');
    expect(result[0].feeAmount!.isEqualTo(bn('0.001'))).toBe(true);
  });

  it('treats deposit + auto-conversion as a buy', () => {
    const csv = makeCSV(
      '123,21-07-20 14:00:00,Spot,Deposit,USD,545,',
      '123,21-07-20 14:00:01,Spot,Transaction Related,BUSD,545,',
      '123,21-07-20 14:00:01,Spot,Transaction Related,USD,-545,',
      '123,21-07-20 16:00:00,Spot,Deposit,USD,1007,',
      '123,21-07-20 16:00:01,Spot,Transaction Related,BUSD,1007,',
      '123,21-07-20 16:00:01,Spot,Transaction Related,USD,-1007,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(2);

    expect(result[0].type).toBe('buy');
    expect(result[0].fromAsset).toBe('USD');
    expect(result[0].fromAmount!.isEqualTo(bn('545'))).toBe(true);
    expect(result[0].toAsset).toBe('BUSD');
    expect(result[0].toAmount!.isEqualTo(bn('545'))).toBe(true);

    expect(result[1].type).toBe('buy');
    expect(result[1].fromAsset).toBe('USD');
    expect(result[1].fromAmount!.isEqualTo(bn('1007'))).toBe(true);
    expect(result[1].toAsset).toBe('BUSD');
    expect(result[1].toAmount!.isEqualTo(bn('1007'))).toBe(true);
  });

  it('handles a Binance Convert crypto-to-crypto swap as a trade', () => {
    const csv = makeCSV(
      '123,22-06-10 08:00:00,Spot,Binance Convert,TRX,-8461.00000053,',
      '123,22-06-10 08:00:00,Spot,Binance Convert,BTC,0.01311455,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('trade');
    expect(result[0].fromAsset).toBe('TRX');
    expect(result[0].fromAmount!.isEqualTo(bn('8461.00000053'))).toBe(true);
    expect(result[0].toAsset).toBe('BTC');
    expect(result[0].toAmount!.isEqualTo(bn('0.01311455'))).toBe(true);
  });

  it('handles a crypto-to-crypto trade', () => {
    const csv = makeCSV(
      '123,21-09-05 11:00:00,Spot,Transaction Related,BTC,-0.5,',
      '123,21-09-05 11:00:01,Spot,Transaction Related,ETH,8.0,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('trade');
    expect(result[0].fromAsset).toBe('BTC');
    expect(result[0].fromAmount!.isEqualTo(bn('0.5'))).toBe(true);
    expect(result[0].toAsset).toBe('ETH');
    expect(result[0].toAmount!.isEqualTo(bn('8.0'))).toBe(true);
  });

  it('treats Transaction Sell + Transaction Buy in same group as a trade, not a buy', () => {
    const csv = makeCSV(
      '123,21-09-05 11:00:00,Spot,Transaction Sell,TRX,-8000,',
      '123,21-09-05 11:00:01,Spot,Transaction Buy,BTC,0.5,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('trade');
    expect(result[0].fromAsset).toBe('TRX');
    expect(result[0].fromAmount!.isEqualTo(bn('8000'))).toBe(true);
    expect(result[0].toAsset).toBe('BTC');
    expect(result[0].toAmount!.isEqualTo(bn('0.5'))).toBe(true);
  });

  it('treats Sell + Buy in same group as a trade', () => {
    const csv = makeCSV(
      '123,21-09-05 11:00:00,Spot,Sell,TRX,-8000,',
      '123,21-09-05 11:00:01,Spot,Buy,BTC,0.5,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('trade');
    expect(result[0].fromAsset).toBe('TRX');
    expect(result[0].fromAmount!.isEqualTo(bn('8000'))).toBe(true);
    expect(result[0].toAsset).toBe('BTC');
    expect(result[0].toAmount!.isEqualTo(bn('0.5'))).toBe(true);
  });

  it('parses a withdrawal as a transfer-out', () => {
    const csv = makeCSV(
      '123,20-11-30 09:00:00,Spot,Withdraw,BTC,-0.5,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('transfer');
    expect(result[0].fromAsset).toBe('BTC');
    expect(result[0].fromAmount!.isEqualTo(bn('0.5'))).toBe(true);
  });

  it('keeps unrelated rows as separate transactions', () => {
    const csv = makeCSV(
      '123,20-03-15 10:00:00,Spot,Deposit,USD,545,',
      '123,21-09-05 11:00:00,Spot,Withdraw,BTC,-0.5,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(2);
  });

  it('handles multiple groups in the same CSV', () => {
    const csv = makeCSV(
      '123,20-03-15 10:00:00,Spot,Transaction Related,USD,-545,',
      '123,20-03-15 10:00:01,Spot,Buy,BTC,0.012,',
      '123,21-09-05 11:00:00,Spot,Deposit,USD,1000,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('buy');
    expect(result[1].type).toBe('transfer');
  });

  it('parses staking rewards', () => {
    const csv = makeCSV(
      '123,21-12-01 00:00:00,Spot,Staking Rewards,DOT,0.05,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('staking');
    expect(result[0].toAsset).toBe('DOT');
    expect(result[0].toAmount!.isEqualTo(bn('0.05'))).toBe(true);
  });

  it('sets exchange to Binance on all transactions', () => {
    const csv = makeCSV(
      '123,20-03-15 10:00:00,Spot,Deposit,USD,545,',
    );

    const result = importer.parse(csv);

    expect(result[0].exchange).toBe('Binance');
  });

  it('parses the date correctly', () => {
    const csv = makeCSV(
      '123,20-03-15 10:00:00,Spot,Deposit,USD,545,',
    );

    const result = importer.parse(csv);
    const d = result[0].date;

    expect(d.getUTCFullYear()).toBe(2020);
    expect(d.getUTCMonth()).toBe(2); // March = 2
    expect(d.getUTCDate()).toBe(15);
  });

  it('merges multiple same-coin rows within a group', () => {
    const csv = makeCSV(
      '123,22-08-20 15:30:00,Spot,Transaction Spend,USDT,-597.8206,',
      '123,22-08-20 15:30:00,Spot,Transaction Fee,BTC,-0.00000845,',
      '123,22-08-20 15:30:00,Spot,Transaction Spend,USDT,-341.71284,',
      '123,22-08-20 15:30:00,Spot,Transaction Fee,BTC,-0.00000483,',
      '123,22-08-20 15:30:00,Spot,Transaction Buy,BTC,0.00483,',
      '123,22-08-20 15:30:00,Spot,Transaction Buy,BTC,0.00845,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('buy');
    expect(result[0].toAsset).toBe('BTC');
    expect(result[0].toAmount!.isEqualTo(bn('0.01328'))).toBe(true);
    expect(result[0].fromAsset).toBe('USDT');
    expect(result[0].fromAmount!.isEqualTo(bn('939.53344'))).toBe(true);
    expect(result[0].feeAsset).toBe('BTC');
    expect(result[0].feeAmount!.isEqualTo(bn('0.00001328'))).toBe(true);
  });

  it('splits concurrent buys of different assets into separate transactions', () => {
    const csv = makeCSV(
      '123,22-08-20 15:30:00,Spot,Transaction Spend,USDT,-600,',
      '123,22-08-20 15:30:00,Spot,Transaction Buy,BTC,0.01,',
      '123,22-08-20 15:30:00,Spot,Transaction Buy,ETH,0.5,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(2);

    const btcTx = result.find((r) => r.toAsset === 'BTC')!;
    const ethTx = result.find((r) => r.toAsset === 'ETH')!;

    expect(btcTx.type).toBe('buy');
    expect(btcTx.toAmount!.isEqualTo(bn('0.01'))).toBe(true);
    expect(btcTx.fromAsset).toBe('USDT');

    expect(ethTx.type).toBe('buy');
    expect(ethTx.toAmount!.isEqualTo(bn('0.5'))).toBe(true);
    expect(ethTx.fromAsset).toBe('USDT');

    // Outflow should be split proportionally
    expect(btcTx.fromAmount!.plus(ethTx.fromAmount!).isEqualTo(bn('600'))).toBe(true);
  });

  it('recognizes Transaction Buy/Spend/Fee operation names', () => {
    const csv = makeCSV(
      '123,22-08-20 15:30:00,Spot,Transaction Spend,USDT,-100,',
      '123,22-08-20 15:30:00,Spot,Transaction Buy,BTC,0.002,',
      '123,22-08-20 15:30:00,Spot,Transaction Fee,BNB,-0.001,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('buy');
    expect(result[0].feeAsset).toBe('BNB');
    expect(result[0].feeAmount!.isEqualTo(bn('0.001'))).toBe(true);
  });

  it('handles a distribution (airdrop)', () => {
    const csv = makeCSV(
      '123,21-04-15 12:00:00,Spot,Distribution,LUNA,10.0,',
    );

    const result = importer.parse(csv);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('airdrop');
    expect(result[0].toAsset).toBe('LUNA');
    expect(result[0].toAmount!.isEqualTo(bn('10.0'))).toBe(true);
  });
});