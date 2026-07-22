import type { TaxRules, CountryConfig, CostBasisMethod } from '$lib/types/tax-rules';
import dkRules2024 from './dk/dk-2024.json';
import dkRules2025 from './dk/dk-2025.json';
import dkRules2026 from './dk/dk-2026.json';
import czRules2024 from './cz/cz-2024.json';
import czRules2025 from './cz/cz-2025.json';

/**
 * Builds a RulesResolver from a list of TaxRules.
 * For a given date, returns the most recent rules whose taxYear <= that year.
 * Falls back to the earliest available rules for dates before any known year.
 */
export const makeResolver = (rulesByYear: TaxRules[]) => {
  const sorted = [...rulesByYear].sort((a, b) => a.taxYear - b.taxYear);
  return (date: Date): TaxRules => {
    const year = date.getUTCFullYear();
    let best = sorted[0];
    for (const r of sorted) {
      if (r.taxYear <= year) best = r;
    }
    return best;
  };
};

export const availableCountries: CountryConfig[] = [
  {
    countryCode: 'DK',
    country: 'Denmark',
    currency: 'DKK',
    defaultCostBasisMethod: 'fifo',
    resolve: makeResolver([dkRules2024 as TaxRules, dkRules2025 as TaxRules, dkRules2026 as TaxRules]),
  },
  {
    countryCode: 'CZ',
    country: 'Czechia',
    currency: 'CZK',
    defaultCostBasisMethod: 'fifo',
    resolve: makeResolver([czRules2024 as TaxRules, czRules2025 as TaxRules]),
  },
];

export const findCountry = (countryCode: string): CountryConfig | undefined =>
  availableCountries.find((c) => c.countryCode === countryCode);

/** Cost-basis methods a country's tax rules allow, resolved for `date` (defaults to today). */
export const allowedCostBasisMethods = (
  country: CountryConfig,
  date: Date = new Date(),
): CostBasisMethod[] => country.resolve(date).costBasis.allowed;

export { costBasisMethodDescriptions } from './cost-basis-methods';
