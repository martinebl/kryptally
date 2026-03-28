import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { LedgerImporter } from '$lib/importers/ledger';
import type { IExchangeImporter } from '$lib/types';

const bn = (n: number | string) => new BigNumber(n);

const HEADER =
  'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export';

const makeRow = (
  date: string,
  ticker: string,
  type: string,
  amount: string,
  fees: string,
  hash = 'abc123',
  status = 'Confirmed',
  account = 'My Bitcoin',
  xpub = 'xpub6...',
  cvTicker = 'USD',
  cvAtOp = '0',
  cvAtExport = '0',
) => `${date},${status},${ticker},${type},${amount},${fees},${hash},${account},${xpub},${cvTicker},${cvAtOp},${cvAtExport}`;

const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('LedgerImporter', () => {
  const importer: IExchangeImporter = new LedgerImporter();

  it('has exchangeName "Ledger"', () => {
    expect(importer.exchangeName).toBe('Ledger');
  });

  it('parses an IN operation as a transfer', () => {
    const input = csv(
      makeRow('2024-01-15T10:30:00.000Z', 'BTC', 'IN', '0.5', '0'),
    );
    const txs = importer.parse(input);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('transfer');
    expect(txs[0].toAsset).toBe('BTC');
    expect(txs[0].toAmount!.isEqualTo(bn('0.5'))).toBe(true);
    expect(txs[0].date).toBe('2024-01-15T10:30:00.000Z');
    expect(txs[0].exchange).toBe('Ledger');
  });

  it('parses an OUT operation as a transfer', () => {
    const input = csv(
      makeRow('2024-02-01T08:00:00.000Z', 'ETH', 'OUT', '-1.2', '0.001'),
    );
    const txs = importer.parse(input);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('transfer');
    expect(txs[0].fromAsset).toBe('ETH');
    expect(txs[0].fromAmount!.isEqualTo(bn('1.2'))).toBe(true);
    expect(txs[0].feeAsset).toBe('ETH');
    expect(txs[0].feeAmount!.isEqualTo(bn('0.001'))).toBe(true);
  });

  it('parses a FEES operation as a fee', () => {
    const input = csv(
      makeRow('2024-03-10T12:00:00.000Z', 'BTC', 'FEES', '-0.00012', '0.00012'),
    );
    const txs = importer.parse(input);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('fee');
    expect(txs[0].feeAsset).toBe('BTC');
    expect(txs[0].feeAmount!.isEqualTo(bn('0.00012'))).toBe(true);
  });

  it('assigns unique ids based on tx hash', () => {
    const input = csv(
      makeRow('2024-01-15T10:30:00.000Z', 'BTC', 'IN', '0.5', '0', 'hash1'),
      makeRow('2024-01-16T10:30:00.000Z', 'BTC', 'IN', '0.3', '0', 'hash2'),
    );
    const txs = importer.parse(input);

    expect(txs[0].id).not.toBe(txs[1].id);
    expect(txs[0].id).toContain('hash1');
  });

  it('sets fiatValue to zero (to be filled by converter layer)', () => {
    const input = csv(
      makeRow('2024-01-15T10:30:00.000Z', 'BTC', 'IN', '0.5', '0'),
    );
    const txs = importer.parse(input);

    expect(txs[0].fiatValue.isZero()).toBe(true);
    expect(txs[0].fiatCurrency).toBe('');
  });

  it('handles multiple rows', () => {
    const input = csv(
      makeRow('2024-01-15T10:30:00.000Z', 'BTC', 'IN', '0.5', '0', 'h1'),
      makeRow('2024-01-16T08:00:00.000Z', 'ETH', 'OUT', '-2.0', '0.005', 'h2'),
      makeRow('2024-01-17T12:00:00.000Z', 'BTC', 'FEES', '-0.0001', '0.0001', 'h3'),
    );
    const txs = importer.parse(input);

    expect(txs).toHaveLength(3);
    expect(txs[0].type).toBe('transfer');
    expect(txs[1].type).toBe('transfer');
    expect(txs[2].type).toBe('fee');
  });

  it('skips empty lines and whitespace-only lines', () => {
    const input = [HEADER, '', '  ', makeRow('2024-01-15T10:30:00.000Z', 'BTC', 'IN', '0.5', '0')].join('\n');
    const txs = importer.parse(input);

    expect(txs).toHaveLength(1);
  });

  it('handles NFT_IN as a transfer', () => {
    const input = csv(
      makeRow('2024-04-01T00:00:00.000Z', 'ETH', 'NFT_IN', '1', '0'),
    );
    const txs = importer.parse(input);

    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('transfer');
    expect(txs[0].toAsset).toBe('ETH');
  });

  it('throws on empty CSV', () => {
    expect(() => importer.parse('')).toThrow();
  });

  it('throws on CSV with only a header', () => {
    expect(() => importer.parse(HEADER)).not.toThrow();
    expect(importer.parse(HEADER)).toHaveLength(0);
  });

  it('stores the tx hash in notes', () => {
    const input = csv(
      makeRow('2024-01-15T10:30:00.000Z', 'BTC', 'IN', '0.5', '0', 'abc123def'),
    );
    const txs = importer.parse(input);

    expect(txs[0].notes).toContain('abc123def');
  });
});