import { describe, it, expect } from 'vitest';
import { readTable, readHeaders } from '$lib/importers/custom/csv-table';

const comma = { header: { mode: 'auto' as const }, delimiter: ',' as const, requiredColumns: ['When', 'Coin'] };

describe('readTable', () => {
  it('reads a plain CSV with the header on the first line', () => {
    const table = readTable('When,Coin\n2021-01-01,BTC\n2021-01-02,ETH', comma);
    expect(table.headers).toEqual(['When', 'Coin']);
    expect(table.rows).toEqual([{ When: '2021-01-01', Coin: 'BTC' }, { When: '2021-01-02', Coin: 'ETH' }]);
  });

  it('auto mode skips a preamble until the line containing every required column', () => {
    const csv = ['Account statement', 'Owner,Someone,abc123', 'Id,When,Coin', '1,2021-01-01,BTC'].join('\n');
    const table = readTable(csv, comma);
    expect(table.headers).toEqual(['Id', 'When', 'Coin']);
    expect(table.rows).toEqual([{ Id: '1', When: '2021-01-01', Coin: 'BTC' }]);
  });

  it('auto mode without required columns picks the first line with the most fields', () => {
    const csv = ['Statement', 'Owner;Someone', 'Date;Kind;Coin;Qty', '01.02.2022;Buy;BTC;1'].join('\n');
    const table = readTable(csv, { header: { mode: 'auto' }, delimiter: ';', requiredColumns: [] });
    expect(table.headers).toEqual(['Date', 'Kind', 'Coin', 'Qty']);
  });

  it('skip mode drops exactly the configured number of lines', () => {
    const csv = ['junk', 'more junk', 'When,Coin', '2021-01-01,BTC'].join('\n');
    const table = readTable(csv, { ...comma, header: { mode: 'skip', rows: 2 } });
    expect(table.headers).toEqual(['When', 'Coin']);
    expect(table.rows).toHaveLength(1);
  });

  it('honours semicolon and tab delimiters', () => {
    expect(readTable('When;Coin\n2021;BTC', { ...comma, delimiter: ';' }).rows).toEqual([{ When: '2021', Coin: 'BTC' }]);
    expect(readTable('When\tCoin\n2021\tBTC', { ...comma, delimiter: '\t' }).rows).toEqual([{ When: '2021', Coin: 'BTC' }]);
  });

  it('skips blank lines and trims header names and a BOM', () => {
    const table = readTable('﻿When , Coin\n\n2021,BTC\n\n', comma);
    expect(table.headers).toEqual(['When', 'Coin']);
    expect(table.rows).toEqual([{ When: '2021', Coin: 'BTC' }]);
  });

  it('reports parse errors', () => {
    const table = readTable('When,Coin\n"2021,BTC', comma);
    expect(table.errors.length).toBeGreaterThan(0);
  });
});

describe('readHeaders', () => {
  it('returns just the header row after preamble handling', () => {
    expect(readHeaders('x\nWhen,Coin\n1,2', comma)).toEqual(['When', 'Coin']);
  });

  it('returns an empty list for empty input', () => {
    expect(readHeaders('', comma)).toEqual([]);
  });
});
