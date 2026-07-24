import { describe, it, expect } from 'vitest';
import { parseIsoTimestamp } from '$lib/importers/csv-util';

describe('parseIsoTimestamp', () => {
  it('parses a strict ISO 8601 timestamp with milliseconds and Z offset', () => {
    expect(parseIsoTimestamp('2022-01-21T20:11:41.693Z', 'test')).toEqual(
      new Date('2022-01-21T20:11:41.693Z'),
    );
  });

  it('parses a strict ISO 8601 timestamp without milliseconds', () => {
    expect(parseIsoTimestamp('2022-01-21T20:11:41Z', 'test')).toEqual(
      new Date('2022-01-21T20:11:41Z'),
    );
  });

  it('parses a numeric UTC offset instead of Z', () => {
    expect(parseIsoTimestamp('2022-01-21T20:11:41+02:00', 'test')).toEqual(
      new Date('2022-01-21T20:11:41+02:00'),
    );
  });

  it('trims surrounding whitespace before validating', () => {
    expect(parseIsoTimestamp('  2022-01-21T20:11:41Z  ', 'test')).toEqual(
      new Date('2022-01-21T20:11:41Z'),
    );
  });

  it('throws on a non-ISO format instead of silently falling back to native parsing', () => {
    expect(() => parseIsoTimestamp('2022-01-21 20:11:41 UTC', 'Widget')).toThrow(
      /Unrecognized Widget timestamp format/,
    );
  });

  it('throws on an empty string', () => {
    expect(() => parseIsoTimestamp('', 'Widget')).toThrow(/Unrecognized Widget timestamp format/);
  });
});
