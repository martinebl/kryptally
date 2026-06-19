/**
 * Fiat currencies supported by Frankfurter. These are never crypto assets,
 * so callers can route them directly to the fiat converter instead of a
 * crypto price lookup.
 */
export const FIAT_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'HKD', 'SGD', 'KRW',
  'SEK', 'NOK', 'DKK', 'TRY', 'BRL', 'ZAR', 'MXN', 'INR', 'PLN', 'CZK',
  'HUF', 'RON', 'BGN', 'ISK', 'NZD', 'PHP', 'IDR', 'MYR', 'THB',
]);

/**
 * USD-pegged stablecoins. Treat as exactly 1 USD for fiat value purposes,
 * rather than trying to look them up as volatile crypto.
 */
export const STABLECOINS = new Set([
  'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'GUSD', 'USDP', 'FRAX',
  'LUSD', 'FDUSD', 'PYUSD', 'USDD',
]);

/** True when `code` is a fiat currency Frankfurter can convert. */
export const isFiat = (code: string): boolean => FIAT_CURRENCIES.has(code.toUpperCase());

/** True when `code` is a USD-pegged stablecoin. */
export const isStablecoin = (code: string): boolean => STABLECOINS.has(code.toUpperCase());
