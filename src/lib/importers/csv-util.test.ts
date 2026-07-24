import { describe, it, expect } from 'vitest';
import { parseIsoTimestamp, toNumeric } from '$lib/importers/csv-util';

describe('parseIsoTimestamp', () => {
  it('parses a strict ISO 8601 timestamp with milliseconds and Z offset', () => {
    expect(parseIsoTimestamp('2019-08-14T05:42:17.250Z', 'test')).toEqual(
      new Date('2019-08-14T05:42:17.250Z'),
    );
  });

  it('parses a strict ISO 8601 timestamp without milliseconds', () => {
    expect(parseIsoTimestamp('2019-08-14T05:42:17Z', 'test')).toEqual(
      new Date('2019-08-14T05:42:17Z'),
    );
  });

  it('parses a numeric UTC offset instead of Z', () => {
    expect(parseIsoTimestamp('2019-08-14T05:42:17+02:00', 'test')).toEqual(
      new Date('2019-08-14T05:42:17+02:00'),
    );
  });

  it('trims surrounding whitespace before validating', () => {
    expect(parseIsoTimestamp('  2019-08-14T05:42:17Z  ', 'test')).toEqual(
      new Date('2019-08-14T05:42:17Z'),
    );
  });

  it('throws on a non-ISO format instead of silently falling back to native parsing', () => {
    expect(() => parseIsoTimestamp('2019-08-14 05:42:17 UTC', 'Widget')).toThrow(
      /Unrecognized Widget timestamp format/,
    );
  });

  it('throws on an empty string', () => {
    expect(() => parseIsoTimestamp('', 'Widget')).toThrow(/Unrecognized Widget timestamp format/);
  });
});

describe('toNumeric', () => {
  it('strips a leading currency symbol prefix', () => {
    expect(toNumeric('kr42.75')).toBe('42.75');
  });

  it('preserves a leading minus sign ahead of a currency prefix', () => {
    expect(toNumeric('-kr42.75')).toBe('-42.75');
  });

  it('leaves a plain number unchanged', () => {
    expect(toNumeric('42.75')).toBe('42.75');
  });

  it('returns an empty string for an empty input', () => {
    expect(toNumeric('')).toBe('');
  });
});
