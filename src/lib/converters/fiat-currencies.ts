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

/**
 * Active ISO 4217 currency codes. Broader than FIAT_CURRENCIES (which is
 * "what Frankfurter can convert"): used to decide whether a quote currency is
 * fiat at all, e.g. so a buy paid in ARS isn't mistaken for a crypto trade.
 */
export const ISO_4217_CURRENCIES = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN',
  'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF',
  'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB',
  'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG',
  'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF',
  'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA',
  'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO',
  'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD',
  'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN',
  'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX',
  'USD', 'UYU', 'UZS', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XOF', 'XPF', 'YER', 'ZAR', 'ZMW',
  'ZWL',
]);

/** True when `code` is any ISO 4217 fiat currency, whether or not it can be converted. */
export const isIsoFiat = (code: string): boolean => ISO_4217_CURRENCIES.has(code.toUpperCase());
