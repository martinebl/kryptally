import { describe, it, expect } from 'vitest';
import { parseDateWithFormats } from '$lib/importers/custom/parse-date';

describe('parseDateWithFormats', () => {
  it('parses strict ISO 8601 with an offset', () => {
    expect(parseDateWithFormats('2022-07-19T08:41:07.000Z', ['iso'], 'utc'))
      .toEqual(new Date('2022-07-19T08:41:07.000Z'));
  });

  it('parses "YYYY-MM-DD HH:mm:ss" as UTC when timezone is utc', () => {
    expect(parseDateWithFormats('2020-11-03 17:05:44', ['YYYY-MM-DD HH:mm:ss'], 'utc'))
      .toEqual(new Date(Date.UTC(2020, 10, 3, 17, 5, 44)));
  });

  it('parses "YYYY-MM-DD HH:mm:ss" as local time when timezone is local', () => {
    expect(parseDateWithFormats('2020-11-03 17:05:44', ['YYYY-MM-DD HH:mm:ss'], 'local'))
      .toEqual(new Date(2020, 10, 3, 17, 5, 44));
  });

  it('parses the "UTC" suffixed format as UTC regardless of timezone setting', () => {
    expect(parseDateWithFormats('2019-02-14 03:22:10 UTC', ['YYYY-MM-DD HH:mm:ss UTC'], 'local'))
      .toEqual(new Date(Date.UTC(2019, 1, 14, 3, 22, 10)));
  });

  it('distinguishes DD/MM and MM/DD', () => {
    expect(parseDateWithFormats('04/09/2023 13:15', ['DD/MM/YYYY HH:mm'], 'utc'))
      .toEqual(new Date(Date.UTC(2023, 8, 4, 13, 15)));
    expect(parseDateWithFormats('04/09/2023 13:15', ['MM/DD/YYYY HH:mm'], 'utc'))
      .toEqual(new Date(Date.UTC(2023, 3, 9, 13, 15)));
  });

  it('parses dotted European dates', () => {
    expect(parseDateWithFormats('27.06.2024 07:08', ['DD.MM.YYYY HH:mm'], 'utc'))
      .toEqual(new Date(Date.UTC(2024, 5, 27, 7, 8)));
  });

  it('parses "D MMM YYYY, HH:mm[:ss]" with and without seconds', () => {
    expect(parseDateWithFormats('9 Oct 2022, 21:47:13', ['D MMM YYYY, HH:mm[:ss]'], 'local'))
      .toEqual(new Date(2022, 9, 9, 21, 47, 13));
    expect(parseDateWithFormats('17 Jan 2021, 06:02', ['D MMM YYYY, HH:mm[:ss]'], 'local'))
      .toEqual(new Date(2021, 0, 17, 6, 2, 0));
  });

  it('parses unix seconds and milliseconds', () => {
    expect(parseDateWithFormats('1650000000', ['unix-s'], 'utc')).toEqual(new Date(1650000000 * 1000));
    expect(parseDateWithFormats('1650000000123', ['unix-ms'], 'utc')).toEqual(new Date(1650000000123));
  });

  it('tries formats in order and uses the first that matches', () => {
    expect(parseDateWithFormats('2021-05-06T07:08:09Z', ['YYYY-MM-DD HH:mm:ss UTC', 'iso'], 'utc'))
      .toEqual(new Date('2021-05-06T07:08:09Z'));
  });

  it('throws on a value no format matches', () => {
    expect(() => parseDateWithFormats('yesterday', ['iso', 'DD/MM/YYYY HH:mm'], 'utc'))
      .toThrow(/Unrecognized date "yesterday"/);
  });

  it('throws on out-of-range parts instead of rolling over', () => {
    expect(() => parseDateWithFormats('31/02/2023 10:00', ['DD/MM/YYYY HH:mm'], 'utc')).toThrow();
    expect(() => parseDateWithFormats('2023-01-01 25:00:00', ['YYYY-MM-DD HH:mm:ss'], 'utc')).toThrow();
  });

  it('throws on an unknown month name', () => {
    expect(() => parseDateWithFormats('3 Foo 2021, 10:00', ['D MMM YYYY, HH:mm[:ss]'], 'utc')).toThrow();
  });
});
