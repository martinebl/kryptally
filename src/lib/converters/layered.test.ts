import { describe, it, expect, vi } from 'vitest';
import BigNumber from 'bignumber.js';
import { createLayeredCryptoToFiatConverter } from '$lib/converters/layered';
import type { ICryptoToFiatConverter } from '$lib/types';

const bn = (n: number) => new BigNumber(n);
const date = new Date('2024-01-15');

const makeConverter = (rate: number): ICryptoToFiatConverter => ({
  getRate: async () => bn(rate),
});

const makeFailingConverter = (): ICryptoToFiatConverter => ({
  getRate: async () => { throw new Error('no data'); },
});

describe('createLayeredCryptoToFiatConverter', () => {
  it('returns the result from the first converter that succeeds', async () => {
    const converter = createLayeredCryptoToFiatConverter([
      makeConverter(100),
      makeConverter(200),
    ]);

    const rate = await converter.getRate('BTC', 'USD', date);

    expect(rate.isEqualTo(bn(100))).toBe(true);
  });

  it('falls back to the next converter when the first throws', async () => {
    const converter = createLayeredCryptoToFiatConverter([
      makeFailingConverter(),
      makeConverter(200),
    ]);

    const rate = await converter.getRate('BTC', 'USD', date);

    expect(rate.isEqualTo(bn(200))).toBe(true);
  });

  it('throws when all converters fail', async () => {
    const converter = createLayeredCryptoToFiatConverter([
      makeFailingConverter(),
      makeFailingConverter(),
    ]);

    await expect(converter.getRate('BTC', 'USD', date)).rejects.toThrow();
  });

  it('does not call later converters when an earlier one succeeds', async () => {
    const secondSpy = vi.fn(async () => bn(200));
    const second: ICryptoToFiatConverter = { getRate: secondSpy };

    const converter = createLayeredCryptoToFiatConverter([
      makeConverter(100),
      second,
    ]);

    await converter.getRate('BTC', 'USD', date);

    expect(secondSpy).not.toHaveBeenCalled();
  });
});