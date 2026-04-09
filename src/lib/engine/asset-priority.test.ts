import { describe, it, expect } from 'vitest';
import { resolvePriorityAsset } from '$lib/engine/asset-priority';

const priorityList = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'SOL'];

describe('resolvePriorityAsset', () => {
  it('returns the listed asset when only one side is on the list', () => {
    const result = resolvePriorityAsset('BTC', 'SMALLCOIN', priorityList);
    expect(result).toEqual({ priorityAsset: 'BTC', prioritySide: 'from' });
  });

  it('returns the listed asset regardless of which side it is on', () => {
    const result = resolvePriorityAsset('SMALLCOIN', 'BTC', priorityList);
    expect(result).toEqual({ priorityAsset: 'BTC', prioritySide: 'to' });
  });

  it('picks the stablecoin over a crypto asset', () => {
    const result = resolvePriorityAsset('USDT', 'BTC', priorityList);
    expect(result).toEqual({ priorityAsset: 'USDT', prioritySide: 'from' });
  });

  it('picks the higher-ranked asset within the same category', () => {
    const result = resolvePriorityAsset('ETH', 'BTC', priorityList);
    expect(result).toEqual({ priorityAsset: 'BTC', prioritySide: 'to' });
  });

  it('returns null when neither asset is on the list', () => {
    const result = resolvePriorityAsset('SMALLCOIN_A', 'SMALLCOIN_B', priorityList);
    expect(result).toBeNull();
  });

  it('uses the default priority list when none is provided', () => {
    const result = resolvePriorityAsset('BTC', 'SMALLCOIN');
    expect(result).toEqual({ priorityAsset: 'BTC', prioritySide: 'from' });
  });

  it('returns null for an empty priority list', () => {
    expect(resolvePriorityAsset('BTC', 'ETH', [])).toBeNull();
  });

  it('is case-insensitive', () => {
    const result = resolvePriorityAsset('btc', 'smallcoin', priorityList);
    expect(result).toEqual({ priorityAsset: 'btc', prioritySide: 'from' });
  });

  it('preserves the original asset casing in the result', () => {
    const result = resolvePriorityAsset('Eth', 'btc', priorityList);
    expect(result).toEqual({ priorityAsset: 'btc', prioritySide: 'to' });
  });

  it('returns from side when both assets have equal priority (same asset)', () => {
    const result = resolvePriorityAsset('BTC', 'BTC', priorityList);
    expect(result).toEqual({ priorityAsset: 'BTC', prioritySide: 'from' });
  });
});
