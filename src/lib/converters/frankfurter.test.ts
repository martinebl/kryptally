import { describe, it, expect, vi, beforeEach } from 'vitest';
import BigNumber from 'bignumber.js';
import { createFrankfurterFiatConverter } from '$lib/converters/frankfurter';

const makeResponse = (base: string, quote: string, rate: number, date = '2024-01-15') =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ amount: 1.0, base, date, rates: { [quote]: rate } }),
  });

describe('createFrankfurterFiatConverter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the exchange rate as a BigNumber', async () => {
    vi.stubGlobal('fetch', vi.fn(() => makeResponse('USD', 'DKK', 6.815)));
    const converter = createFrankfurterFiatConverter();

    const rate = await converter.getRate('USD', 'DKK', new Date('2024-01-15'));

    expect(rate.isEqualTo(new BigNumber('6.815'))).toBe(true);
  });

  it('builds the correct URL with YYYY-MM-DD date', async () => {
    vi.stubGlobal('fetch', vi.fn(() => makeResponse('USD', 'DKK', 6.815)));
    const converter = createFrankfurterFiatConverter();

    await converter.getRate('USD', 'DKK', new Date('2024-03-05'));

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.frankfurter.dev/v1/2024-03-05'),
    );
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('base=USD'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('symbols=DKK'));
  });

  it('returns 1 for same-currency conversion without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const converter = createFrankfurterFiatConverter();

    const rate = await converter.getRate('DKK', 'DKK', new Date('2024-01-15'));

    expect(rate.isEqualTo(new BigNumber(1))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches results — second call with same currencies and date does not fetch again', async () => {
    const fetchMock = vi.fn(() => makeResponse('USD', 'DKK', 6.815));
    vi.stubGlobal('fetch', fetchMock);
    const converter = createFrankfurterFiatConverter();

    await converter.getRate('USD', 'DKK', new Date('2024-01-15'));
    await converter.getRate('USD', 'DKK', new Date('2024-01-15'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches again for a different date', async () => {
    const fetchMock = vi.fn(() => makeResponse('USD', 'DKK', 6.815));
    vi.stubGlobal('fetch', fetchMock);
    const converter = createFrankfurterFiatConverter();

    await converter.getRate('USD', 'DKK', new Date('2024-01-15'));
    await converter.getRate('USD', 'DKK', new Date('2024-01-16'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches using the requested date, not the response date (handles weekends)', async () => {
    // API returns Friday's rate when Saturday is requested
    const fetchMock = vi.fn(() => makeResponse('USD', 'DKK', 6.815, '2024-01-12'));
    vi.stubGlobal('fetch', fetchMock);
    const converter = createFrankfurterFiatConverter();

    await converter.getRate('USD', 'DKK', new Date('2024-01-13')); // Saturday
    await converter.getRate('USD', 'DKK', new Date('2024-01-13')); // same Saturday again

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when API returns non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })));
    const converter = createFrankfurterFiatConverter();

    await expect(converter.getRate('USD', 'DKK', new Date('2024-01-15')))
      .rejects.toThrow('Frankfurter API error: 404');
  });

  it('throws when requested currency is not in response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => makeResponse('USD', 'EUR', 0.92)));
    const converter = createFrankfurterFiatConverter();

    await expect(converter.getRate('USD', 'XYZ', new Date('2024-01-15')))
      .rejects.toThrow('No XYZ rate');
  });
});