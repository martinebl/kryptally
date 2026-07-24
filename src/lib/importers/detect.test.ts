import { describe, it, expect } from 'vitest';
import {
  BinanceImporter,
  LedgerImporter,
  RevolutXImporter,
  CoinbaseImporter,
  detectExchange,
} from '$lib/importers';
import type { IExchangeImporter } from '$lib/types';

const BINANCE_HEADER =
  'User ID,Time,Account,Operation,Coin,Change,Remark';
const LEDGER_HEADER =
  'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date';
const REVOLUT_HEADER = 'Symbol,Type,Quantity,Price,Value,Fees,Date';
const COINBASE_HEADER =
  'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes';

const importers: IExchangeImporter[] = [
  new BinanceImporter(),
  new LedgerImporter(),
  new RevolutXImporter(),
  new CoinbaseImporter(),
];

describe('detectExchange', () => {
  it('detects a header-only Binance CSV', () => {
    expect(detectExchange(BINANCE_HEADER, importers)).toHaveLength(1);
    expect(detectExchange(BINANCE_HEADER, importers)[0].exchangeName).toBe('Binance');
  });

  it('detects Binance CSV with a single data row following the header', () => {
    const csv = [BINANCE_HEADER, '123,20-03-15 10:00:00,Spot,Deposit,USD,545,'].join('\n');
    const matched = detectExchange(csv, importers);
    expect(matched).toHaveLength(1);
    expect(matched[0].exchangeName).toBe('Binance');
  });

  it('detects a header-only Ledger CSV', () => {
    const matched = detectExchange(LEDGER_HEADER, importers);
    expect(matched).toHaveLength(1);
    expect(matched[0].exchangeName).toBe('Ledger');
  });

  it('detects a header-only Revolut X CSV', () => {
    const matched = detectExchange(REVOLUT_HEADER, importers);
    expect(matched).toHaveLength(1);
    expect(matched[0].exchangeName).toBe('Revolut X');
  });

  it('detects a header-only Coinbase CSV', () => {
    const matched = detectExchange(COINBASE_HEADER, importers);
    expect(matched).toHaveLength(1);
    expect(matched[0].exchangeName).toBe('Coinbase');
  });

  it('returns an empty array for an unrelated/garbage CSV', () => {
    expect(detectExchange('Foo,Bar,Baz\n1,2,3', importers)).toEqual([]);
  });

  it('returns an empty array for an empty CSV', () => {
    expect(detectExchange('', importers)).toEqual([]);
  });

  it('returns an empty array for a blank/whitespace CSV', () => {
    expect(detectExchange('   \n\n   ', importers)).toEqual([]);
  });

  it('does not false-positive a Binance header against Ledger or Revolut X', () => {
    expect(new LedgerImporter().detect(BINANCE_HEADER)).toBe(false);
    expect(new RevolutXImporter().detect(BINANCE_HEADER)).toBe(false);
  });

  it('does not false-positive a Ledger header against Binance or Revolut X', () => {
    expect(new BinanceImporter().detect(LEDGER_HEADER)).toBe(false);
    expect(new RevolutXImporter().detect(LEDGER_HEADER)).toBe(false);
  });

  it('does not false-positive a Revolut X header against Binance or Ledger', () => {
    expect(new BinanceImporter().detect(REVOLUT_HEADER)).toBe(false);
    expect(new LedgerImporter().detect(REVOLUT_HEADER)).toBe(false);
  });

  it('does not false-positive a Coinbase header against Binance, Ledger, or Revolut X', () => {
    expect(new BinanceImporter().detect(COINBASE_HEADER)).toBe(false);
    expect(new LedgerImporter().detect(COINBASE_HEADER)).toBe(false);
    expect(new RevolutXImporter().detect(COINBASE_HEADER)).toBe(false);
  });

  it('does not false-positive Binance, Ledger, or Revolut X headers against Coinbase', () => {
    expect(new CoinbaseImporter().detect(BINANCE_HEADER)).toBe(false);
    expect(new CoinbaseImporter().detect(LEDGER_HEADER)).toBe(false);
    expect(new CoinbaseImporter().detect(REVOLUT_HEADER)).toBe(false);
  });

  it('accepts a CSV with extra columns beyond the required set', () => {
    const extraBinance = [BINANCE_HEADER, ',SomeExtraColumn'].join(',');
    const matched = detectExchange(extraBinance, importers);
    expect(matched).toHaveLength(1);
    expect(matched[0].exchangeName).toBe('Binance');
  });

  it('detects a full Ledger CSV export with multiple rows', () => {
    const csv = [
      LEDGER_HEADER,
      '2024-01-05T10:00:00.000Z,Confirmed,BTC,IN,0.5,0.0001,hash1,Led,Btc,USD,30000,30000',
      '2024-01-06T10:00:00.000Z,Confirmed,ETH,OUT,1.0,0.0002,hash2,Led,Eth,USD,2000,2010',
    ].join('\n');
    const matched = detectExchange(csv, importers);
    expect(matched).toHaveLength(1);
    expect(matched[0].exchangeName).toBe('Ledger');
  });
});