import { describe, it, expect } from 'vitest';
import {
  emptyConfig,
  duplicateConfig,
  distinctColumnValues,
  guessKind,
  guessDelimiter,
  addRulesForValues,
  previewImport,
} from '$lib/importers/custom/editor-helpers';
import type { CustomImporterConfig } from '$lib/types';

describe('emptyConfig', () => {
  it('creates a fresh draft with the given id and sensible defaults', () => {
    const c = emptyConfig('id-1');
    expect(c).toMatchObject({
      schemaVersion: 1, id: 'id-1', name: '', header: { mode: 'auto' }, delimiter: ',',
      decimalSeparator: '.', dateFormats: ['iso'], type: { mode: 'column', rules: [] }, preprocessors: [],
    });
  });
});

describe('duplicateConfig', () => {
  it('copies a config under a new id and a free "(copy)" name', () => {
    const source: CustomImporterConfig = { ...emptyConfig('src'), name: 'Ledger', columns: { date: 'D', asset: 'A', amount: 'Q' } };
    const copy = duplicateConfig(source, 'new-id', ['Ledger', 'Ledger (copy)']);
    expect(copy).toMatchObject({ id: 'new-id', name: 'Ledger (copy 2)', columns: { date: 'D', asset: 'A', amount: 'Q' } });
    expect(copy.columns).not.toBe(source.columns);
  });
});

describe('distinctColumnValues', () => {
  it('returns the trimmed distinct non-blank values in first-seen order', () => {
    const rows = [{ K: 'Buy' }, { K: ' Sell ' }, { K: 'Buy' }, { K: '' }, { K: 'Deposit' }];
    expect(distinctColumnValues(rows, 'K')).toEqual(['Buy', 'Sell', 'Deposit']);
  });

  it('returns nothing without a column', () => {
    expect(distinctColumnValues([{ K: 'x' }], undefined)).toEqual([]);
  });
});

describe('guessKind', () => {
  it.each([
    ['Buy', 'buy'], ['Market sell', 'sell'], ['Crypto Deposit', 'transfer-in'], ['Receive', 'transfer-in'],
    ['Withdrawal', 'transfer-out'], ['Send', 'transfer-out'], ['Staking reward', 'staking'],
    ['Airdrop', 'airdrop'], ['Network fee', 'fee'], ['Mining payout', 'mining'], ['Something odd', 'ignore'],
  ])('guesses %s → %s', (value, kind) => {
    expect(guessKind(value)).toBe(kind);
  });
});

describe('addRulesForValues', () => {
  it('adds an equals rule for each value no existing rule matches', () => {
    const existing = [{ match: 'startsWith' as const, value: 'buy', kind: 'buy' as const }];
    expect(addRulesForValues(existing, ['Buy - Market', 'Withdrawal'])).toEqual([
      ...existing,
      { match: 'equals', value: 'Withdrawal', kind: 'transfer-out' },
    ]);
  });
});

describe('previewImport', () => {
  const config: CustomImporterConfig = {
    ...emptyConfig('p'),
    name: 'Preview',
    requiredColumns: ['D', 'A', 'Q'],
    columns: { date: 'D', asset: 'A', amount: 'Q' },
    type: { mode: 'fixed', kind: 'transfer-in' },
  };

  it('returns at most `limit` parsed transactions plus the total count', () => {
    const csv = ['D,A,Q', ...Array.from({ length: 4 }, (_, i) => `2022-03-0${i + 1}T00:00:00Z,BTC,${i + 1}`)].join('\n');
    const result = previewImport(config, csv, 2);
    expect(result.error).toBeUndefined();
    expect(result.transactions).toHaveLength(2);
    expect(result.total).toBe(4);
  });

  it('returns the error message instead of throwing', () => {
    const result = previewImport(config, 'D,A,Q\nnope,BTC,1', 10);
    expect(result.error).toMatch(/Row 1: Unrecognized date/);
    expect(result.transactions).toEqual([]);
  });
});

describe('guessDelimiter', () => {
  it('picks the delimiter that splits lines into the most fields', () => {
    expect(guessDelimiter('Statement\nDate;Kind;Coin;Qty\n01.02.2022;Buy;BTC;1,5')).toBe(';');
    expect(guessDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(guessDelimiter('a\tb\tc\n1\t2,5\t3')).toBe('\t');
  });

  it('defaults to comma for single-column input', () => {
    expect(guessDelimiter('justone')).toBe(',');
  });
});
