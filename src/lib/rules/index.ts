import type { TaxRules } from '$lib/types/tax-rules';
import dkRules from './dk/dk-2024.json';
import czRules from './cz/cz-2024.json';

export const availableRules: TaxRules[] = [
  dkRules as TaxRules,
  czRules as TaxRules,
];

export const findRules = (countryCode: string): TaxRules | undefined =>
  availableRules.find((r) => r.countryCode === countryCode);

