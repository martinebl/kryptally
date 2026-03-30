import type BigNumber from 'bignumber.js';

/** Converts a crypto asset to its fiat value at a given point in time */
export interface ICryptoToFiatConverter {
  /** Returns the price of 1 unit of `asset` in `fiatCurrency` at `datetime` */
  getRate(asset: string, fiatCurrency: string, datetime: Date): Promise<BigNumber>;
}

/** Converts between two fiat currencies on a given date */
export interface IFiatConverter {
  /** Returns the exchange rate from `fromCurrency` to `toCurrency` on `date` (i.e. 1 fromCurrency = X toCurrency) */
  getRate(fromCurrency: string, toCurrency: string, date: Date): Promise<BigNumber>;
}
