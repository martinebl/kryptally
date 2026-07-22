import { describe, it, expect } from 'vitest';
import { suggestSymbols, MIN_SUGGESTION_QUERY_LENGTH, MAX_SUGGESTIONS } from '$lib/sources/symbol-suggestions';

describe('suggestSymbols', () => {
  it('returns nothing below the minimum query length', () => {
    const query = 'B'.repeat(MIN_SUGGESTION_QUERY_LENGTH - 1);
    expect(suggestSymbols(['BTCUSDT', 'BTCEUR'], query, [])).toEqual([]);
  });

  it('matches anywhere in the symbol, not just as a prefix', () => {
    const available = ['BTCUSDT', 'ETHUSDT', 'BTCEUR'];
    expect(suggestSymbols(available, 'USDT', [])).toEqual(
      expect.arrayContaining(['BTCUSDT', 'ETHUSDT']),
    );
    expect(suggestSymbols(available, 'USDT', [])).not.toContain('BTCEUR');
  });

  it('is case-insensitive and trims the query', () => {
    expect(suggestSymbols(['BTCUSDT'], '  btc  ', [])).toEqual(['BTCUSDT']);
  });

  it('excludes symbols already added', () => {
    expect(suggestSymbols(['BTCUSDT', 'BTCEUR'], 'BTC', ['BTCUSDT'])).toEqual(['BTCEUR']);
  });

  it('ranks prefix matches above other substring matches, then alphabetically', () => {
    const available = ['ETHBTC', 'BTCEUR', 'BTCUSDT'];
    expect(suggestSymbols(available, 'BTC', [])).toEqual(['BTCEUR', 'BTCUSDT', 'ETHBTC']);
  });

  it('truncates to at most MAX_SUGGESTIONS results', () => {
    const available = Array.from({ length: MAX_SUGGESTIONS + 5 }, (_, i) => `BTC${i.toString().padStart(2, '0')}`);
    expect(suggestSymbols(available, 'BTC', [])).toHaveLength(MAX_SUGGESTIONS);
  });
});
