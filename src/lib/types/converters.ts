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

/** Current ("spot") prices for a batch of assets, keyed by the asset string supplied */
export interface CurrentPricesResult {
  prices: Map<string, BigNumber>;
  unpriced: string[];
}

/** Fetches current prices for many assets at once */
export interface ICurrentPriceFetcher {
  /**
   * Returns current prices for `assets` in `fiatCurrency`, keyed by the exact
   * asset string supplied. Assets that cannot be priced are listed in `unpriced`.
   */
  fetchCurrentPrices(assets: string[], fiatCurrency: string): Promise<CurrentPricesResult>;
}
