import type { DateFormatId } from '$lib/types';
import { parseIsoTimestamp } from '$lib/importers/csv-util';

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const num = (s: string | undefined): number => Number(s ?? '0');

/** Builds date parts from named regex groups. `mon` (a month name) wins over `m`. */
const partsFromGroups = (g: Record<string, string | undefined>): DateParts => ({
  year: num(g.y),
  month: g.mon !== undefined ? MONTHS.indexOf(g.mon.slice(0, 3).toLowerCase()) + 1 : num(g.m),
  day: num(g.d),
  hour: num(g.h),
  minute: num(g.min),
  second: num(g.s),
});

interface PatternFormat {
  re: RegExp;
  /** Set when the format itself fixes the zone, overriding the config's timezone. */
  forceUtc?: boolean;
}

const TIME = String.raw`(?<h>\d{1,2}):(?<min>\d{2})`;
const TIME_S = String.raw`${TIME}:(?<s>\d{2})`;

const PATTERNS: Partial<Record<DateFormatId, PatternFormat>> = {
  'YYYY-MM-DD HH:mm:ss': { re: new RegExp(String.raw`^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2}) ${TIME_S}$`) },
  'YYYY-MM-DD HH:mm:ss UTC': {
    re: new RegExp(String.raw`^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2}) ${TIME_S} UTC$`),
    forceUtc: true,
  },
  'DD/MM/YYYY HH:mm': { re: new RegExp(String.raw`^(?<d>\d{1,2})/(?<m>\d{1,2})/(?<y>\d{4}) ${TIME}(?::(?<s>\d{2}))?$`) },
  'MM/DD/YYYY HH:mm': { re: new RegExp(String.raw`^(?<m>\d{1,2})/(?<d>\d{1,2})/(?<y>\d{4}) ${TIME}(?::(?<s>\d{2}))?$`) },
  'DD.MM.YYYY HH:mm': { re: new RegExp(String.raw`^(?<d>\d{1,2})\.(?<m>\d{1,2})\.(?<y>\d{4}) ${TIME}(?::(?<s>\d{2}))?$`) },
  'D MMM YYYY, HH:mm[:ss]': {
    re: new RegExp(String.raw`^(?<d>\d{1,2}) (?<mon>[A-Za-z]{3,9}) (?<y>\d{4}),? ${TIME}(?::(?<s>\d{2}))?$`),
  },
};

/** Builds the Date and rejects rollover (e.g. 31 Feb → 3 Mar) by reading the parts back. */
const toDate = (p: DateParts, utc: boolean): Date | undefined => {
  const date = utc
    ? new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second))
    : new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const readBack: DateParts = utc
    ? {
        year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
        hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(),
      }
    : {
        year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
        hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(),
      };
  const matches = (Object.keys(p) as (keyof DateParts)[]).every((k) => p[k] === readBack[k]);
  return matches ? date : undefined;
};

const parseUnix = (raw: string, multiplier: number): Date | undefined =>
  /^\d+$/.test(raw) ? new Date(Number(raw) * multiplier) : undefined;

const tryFormat = (raw: string, format: DateFormatId, timezone: 'utc' | 'local'): Date | undefined => {
  if (format === 'iso') {
    try {
      return parseIsoTimestamp(raw, 'ISO');
    } catch {
      return undefined;
    }
  }
  if (format === 'unix-s') return parseUnix(raw, 1000);
  if (format === 'unix-ms') return parseUnix(raw, 1);

  const pattern = PATTERNS[format];
  const groups = pattern?.re.exec(raw)?.groups;
  return pattern && groups
    ? toDate(partsFromGroups(groups), pattern.forceUtc === true || timezone === 'utc')
    : undefined;
};

/**
 * Parses `raw` with the first matching format. Never falls back to
 * `new Date(raw)`: non-ISO parsing is engine-dependent and breaks in WebKit
 * (Tauri on Linux). Throws when no format matches or the parts are out of range.
 */
export function parseDateWithFormats(
  raw: string,
  formats: readonly DateFormatId[],
  timezone: 'utc' | 'local',
): Date {
  const trimmed = (raw ?? '').trim();
  const date = formats.reduce<Date | undefined>(
    (found, format) => found ?? tryFormat(trimmed, format, timezone),
    undefined,
  );
  if (!date) {
    throw new Error(`Unrecognized date "${raw}" (expected ${formats.join(' or ')})`);
  }
  return date;
}
