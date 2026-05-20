export type CostBasisMethod = 'fifo' | 'lifo' | 'hifo' | 'average';

export interface CostBasisConfig {
  allowed: CostBasisMethod[];
  default: CostBasisMethod;
}

/** Crypto-relevant event types that map to income categories */
export type TaxableEventType =
  | 'sell'          // sell crypto for fiat
  | 'trade'         // crypto-to-crypto swap
  | 'mining'        // mining reward
  | 'staking'       // staking reward
  | 'airdrop'       // airdrop receipt
  | 'fee';          // fee payment (may be a disposal)

export interface TaxBracket {
  min: number;
  max: number | null; // null = no upper limit
  rate: number;       // decimal, e.g. 0.37 = 37%
  label?: string;     // e.g. "Bundskat", "Topskat"
}

export interface LossRules {
  deductible: boolean;
  offsetAgainstGains: boolean;
  offsetAgainstIncome: boolean;
  carryForward: boolean;
  carryForwardYears: number | null;  // null = unlimited
  effectiveRate?: number | null;     // if losses are deducted at a different rate
}

export interface HoldingPeriodRule {
  enabled: boolean;
  thresholdDays: number;
  exemptFromTax: boolean;            // e.g. Germany: hold >1yr = tax free
  longTermBrackets?: TaxBracket[];   // separate rates for long-term
}

export interface IncomeType {
  label: string;                     // e.g. "Kapitalindkomst", "B-indkomst"
  description?: string;              // human-readable explanation
  events: TaxableEventType[];            // which crypto events fall under this income type
  brackets: TaxBracket[];
  lossRules: LossRules;
  /** Additional flat-rate contributions that apply before brackets, e.g. AM-bidrag 8% */
  contributions?: Array<{
    name: string;
    rate: number;
    appliesToGross: boolean;         // true = deducted from gross before bracket calc
  }>;
}

export interface TaxRules {
  country: string;
  countryCode: string;       // ISO 3166-1 alpha-2
  currency: string;          // ISO 4217
  taxYear: number;
  lastUpdated: string;       // ISO 8601

  costBasis: CostBasisConfig;
  cryptoToCryptoTaxable: boolean;

  holdingPeriod: HoldingPeriodRule;
  incomeTypes: IncomeType[];

  /** Free-form notes for users about this jurisdiction */
  notes: string[];
}

/** Returns the most applicable TaxRules for a given transaction date. */
export type RulesResolver = (date: Date) => TaxRules;

export interface CountryConfig {
  countryCode: string;
  country: string;
  currency: string;
  defaultCostBasisMethod: CostBasisMethod;
  resolve: RulesResolver;
}
