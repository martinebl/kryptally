import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { parseDecimal, parseMoneyCell } from '$lib/importers/custom/parse-number';

const bn = (n: string) => new BigNumber(n);

describe('parseDecimal', () => {
  it('parses a plain dot-decimal number', () => {
    expect(parseDecimal('0.03817', '.')).toEqual(bn('0.03817'));
  });

  it('keeps the sign', () => {
    expect(parseDecimal('-12.5', '.')).toEqual(bn('-12.5'));
  });

  it('strips comma thousands separators for dot decimals', () => {
    expect(parseDecimal('4,213.77', '.')).toEqual(bn('4213.77'));
  });

  it('handles comma decimals with dot or space thousands separators', () => {
    expect(parseDecimal('4.213,77', ',')).toEqual(bn('4213.77'));
    expect(parseDecimal('4 213,77', ',')).toEqual(bn('4213.77'));
  });

  it('strips currency symbols and codes', () => {
    expect(parseDecimal('$91.40', '.')).toEqual(bn('91.40'));
    expect(parseDecimal('91,40 kr', ',')).toEqual(bn('91.40'));
  });

  it('parses exponent notation', () => {
    expect(parseDecimal('1e-8', '.')).toEqual(bn('0.00000001'));
    expect(parseDecimal('-2.5E3', '.')).toEqual(bn('-2500'));
  });

  it('treats a blank cell as zero', () => {
    expect(parseDecimal('', '.')).toEqual(bn('0'));
    expect(parseDecimal('  ', '.')).toEqual(bn('0'));
    expect(parseDecimal(undefined, '.')).toEqual(bn('0'));
  });

  it('throws on a non-numeric value', () => {
    expect(() => parseDecimal('abc', '.')).toThrow(/Invalid number "abc"/);
  });
});

describe('parseMoneyCell', () => {
  it('returns undefined for a blank cell', () => {
    expect(parseMoneyCell('', '.')).toBeUndefined();
  });

  it('reads a known symbol prefix', () => {
    expect(parseMoneyCell('$1,034.20', '.')).toEqual({ amount: bn('1034.20'), currency: 'USD' });
    expect(parseMoneyCell('€7', '.')).toEqual({ amount: bn('7'), currency: 'EUR' });
    expect(parseMoneyCell('£0.55', '.')).toEqual({ amount: bn('0.55'), currency: 'GBP' });
  });

  it('reads a currency code suffix or prefix', () => {
    expect(parseMoneyCell('612.30 DKK', '.')).toEqual({ amount: bn('612.30'), currency: 'DKK' });
    expect(parseMoneyCell('SEK 18,5', ',')).toEqual({ amount: bn('18.5'), currency: 'SEK' });
  });

  it('returns the amount without a currency when none is present', () => {
    expect(parseMoneyCell('42.1', '.')).toEqual({ amount: bn('42.1'), currency: undefined });
  });
});
