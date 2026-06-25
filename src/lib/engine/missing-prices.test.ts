import { describe, it, expect } from 'vitest';
import { groupMissingPrices } from '$lib/engine/missing-prices';
import type { MissingPrice } from '$lib/engine/enrich-fiat-values';

describe('groupMissingPrices', () => {
  it('returns an empty array for no missing prices', () => {
    expect(groupMissingPrices([])).toEqual([]);
  });

  it('groups failures by asset and counts the dates', () => {
    const missing: MissingPrice[] = [
      { asset: 'FOO', date: '2022-04-12' },
      { asset: 'FOO', date: '2022-06-30' },
      { asset: 'BAR', date: '2023-01-05' },
    ];

    const groups = groupMissingPrices(missing);

    const foo = groups.find((g) => g.asset === 'FOO')!;
    const bar = groups.find((g) => g.asset === 'BAR')!;
    expect(foo.count).toBe(2);
    expect(bar.count).toBe(1);
  });

  it('sorts dates ascending within a group', () => {
    const missing: MissingPrice[] = [
      { asset: 'FOO', date: '2022-11-01' },
      { asset: 'FOO', date: '2022-03-15' },
      { asset: 'FOO', date: '2022-07-22' },
    ];

    const [group] = groupMissingPrices(missing);

    expect(group.dates).toEqual(['2022-03-15', '2022-07-22', '2022-11-01']);
  });

  it('builds a range string from earliest to latest when there are multiple dates', () => {
    const missing: MissingPrice[] = [
      { asset: 'FOO', date: '2022-09-09' },
      { asset: 'FOO', date: '2022-02-02' },
    ];

    const [group] = groupMissingPrices(missing);

    expect(group.range).toBe('2022-02-02 → 2022-09-09');
  });

  it('uses the single date as the range when there is only one', () => {
    const missing: MissingPrice[] = [{ asset: 'FOO', date: '2022-05-18' }];

    const [group] = groupMissingPrices(missing);

    expect(group.range).toBe('2022-05-18');
  });

  it('orders groups by count descending', () => {
    const missing: MissingPrice[] = [
      { asset: 'RARE', date: '2021-01-01' },
      { asset: 'COMMON', date: '2021-02-01' },
      { asset: 'COMMON', date: '2021-03-01' },
      { asset: 'COMMON', date: '2021-04-01' },
      { asset: 'MID', date: '2021-05-01' },
      { asset: 'MID', date: '2021-06-01' },
    ];

    const groups = groupMissingPrices(missing);

    expect(groups.map((g) => g.asset)).toEqual(['COMMON', 'MID', 'RARE']);
  });
});
