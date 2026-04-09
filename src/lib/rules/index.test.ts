import { describe, it, expect } from 'vitest';
import type { TaxRules } from '$lib/types/tax-rules';
import { makeResolver, findCountry } from '$lib/rules';

const makeStubRules = (taxYear: number): TaxRules => ({
  country: 'Test',
  countryCode: 'TS',
  currency: 'TST',
  taxYear,
  lastUpdated: '2024-01-01',
  costBasis: { allowed: ['fifo'], default: 'fifo' },
  cryptoToCryptoTaxable: true,
  holdingPeriod: { enabled: false, thresholdDays: 0, exemptFromTax: false },
  incomeTypes: [],
  notes: [],
});

describe('makeResolver', () => {
  it('returns the matching year when date falls exactly on a tax year', () => {
    const r2024 = makeStubRules(2024);
    const r2025 = makeStubRules(2025);
    const resolve = makeResolver([r2024, r2025]);

    expect(resolve(new Date('2024-06-01'))).toBe(r2024);
    expect(resolve(new Date('2025-01-01'))).toBe(r2025);
  });

  it('returns the most recent prior rules when no exact year match exists', () => {
    const r2024 = makeStubRules(2024);
    const r2025 = makeStubRules(2025);
    const resolve = makeResolver([r2024, r2025]);

    // 2026 has no rules — should fall back to 2025
    expect(resolve(new Date('2026-11-15'))).toBe(r2025);
  });

  it('falls back to the earliest rules for dates before any known year', () => {
    const r2024 = makeStubRules(2024);
    const r2025 = makeStubRules(2025);
    const resolve = makeResolver([r2024, r2025]);

    expect(resolve(new Date('2022-03-01'))).toBe(r2024);
  });

  it('works correctly with a single rules entry', () => {
    const r2024 = makeStubRules(2024);
    const resolve = makeResolver([r2024]);

    expect(resolve(new Date('2023-01-01'))).toBe(r2024);
    expect(resolve(new Date('2024-06-01'))).toBe(r2024);
    expect(resolve(new Date('2030-01-01'))).toBe(r2024);
  });

  it('handles unsorted input correctly', () => {
    const r2023 = makeStubRules(2023);
    const r2025 = makeStubRules(2025);
    const r2024 = makeStubRules(2024);
    // Deliberately pass out of order
    const resolve = makeResolver([r2025, r2023, r2024]);

    expect(resolve(new Date('2024-01-01'))).toBe(r2024);
    expect(resolve(new Date('2025-06-01'))).toBe(r2025);
  });
});

describe('findCountry', () => {
  it('returns the correct config for Denmark', () => {
    const config = findCountry('DK');
    expect(config).toBeDefined();
    expect(config!.currency).toBe('DKK');
    expect(config!.country).toBe('Denmark');
  });

  it('returns the correct config for Czechia', () => {
    const config = findCountry('CZ');
    expect(config).toBeDefined();
    expect(config!.currency).toBe('CZK');
    expect(config!.country).toBe('Czechia');
  });

  it('returns undefined for an unknown country code', () => {
    expect(findCountry('XX')).toBeUndefined();
  });

  it('CZ resolver uses 2024 rules for 2024 dates', () => {
    const config = findCountry('CZ')!;
    const rules = config.resolve(new Date('2024-06-01'));
    expect(rules.holdingPeriod.enabled).toBe(false);
  });

  it('CZ resolver uses 2025 rules for 2025 dates', () => {
    const config = findCountry('CZ')!;
    const rules = config.resolve(new Date('2025-06-01'));
    expect(rules.holdingPeriod.enabled).toBe(true);
    expect(rules.holdingPeriod.thresholdDays).toBe(1095);
    expect(rules.holdingPeriod.exemptFromTax).toBe(true);
  });
});
