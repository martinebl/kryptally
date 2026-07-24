import BigNumber from 'bignumber.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ILiveSource, IImportPreprocessor, LiveSourceFetchParams, Transaction } from '$lib/types';
import { isTauri } from '$lib/runtime';
import { isFiat, isStablecoin } from '$lib/converters/fiat-currencies';

/** One executed trade fill from the Advanced Trade API. */
interface CoinbaseFill {
  entry_id?: string;
  trade_id?: string;
  order_id: string;
  trade_time: string; // ISO 8601
  price: string; // quote per unit of base
  size: string; // base amount, unless size_in_quote
  commission?: string; // fee, in the quote asset
  product_id: string; // "BASE-QUOTE", e.g. "BTC-USD"
  size_in_quote?: boolean;
  side: 'BUY' | 'SELL';
}

/** Backend event fired (with `{ waitMs }`) when a request is rate limited and backing off. */
const RATE_LIMITED_EVENT = 'coinbase://rate-limited';

const splitProductId = (productId: string): { base: string; quote: string } | null => {
  const parts = productId.split('-');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { base: parts[0], quote: parts[1] };
};

/** Build the buy/sell sides shared by the fill mapper. */
const sides = (base: string, quote: string, baseAmount: BigNumber, quoteAmount: BigNumber, isBuy: boolean) =>
  isBuy
    ? { fromAsset: quote, fromAmount: quoteAmount, toAsset: base, toAmount: baseAmount }
    : { fromAsset: base, fromAmount: baseAmount, toAsset: quote, toAmount: quoteAmount };

/**
 * A fill's quote leg already carries the executed fiat value when the quote
 * is a fiat currency (or a USD-pegged stablecoin, valued 1:1 in USD). This
 * avoids a CoinGecko price lookup during enrichment; a quote in another fiat
 * is later converted fiat→fiat to the tax currency.
 */
const fiatFromQuote = (quote: string, quoteAmount: BigNumber) => {
  if (isFiat(quote)) return { fiatCurrency: quote.toUpperCase(), fiatValue: quoteAmount };
  if (isStablecoin(quote)) return { fiatCurrency: 'USD', fiatValue: quoteAmount };
  return {};
};

/**
 * Map an Advanced Trade fill to a Transaction. `size` is the base-asset
 * amount unless `size_in_quote` is set, in which case it's the quote amount
 * and the base amount is derived from price instead.
 */
const fillToTransaction = (fill: CoinbaseFill): Transaction | null => {
  const split = splitProductId(fill.product_id);
  if (!split) return null;
  const { base, quote } = split;

  const size = new BigNumber(fill.size);
  const price = new BigNumber(fill.price);
  if (!size.isGreaterThan(0) || price.isNaN() || price.isZero()) return null;

  const baseAmount = fill.size_in_quote ? size.div(price) : size;
  const quoteAmount = fill.size_in_quote ? size : size.times(price);
  const fee = new BigNumber(fill.commission ?? '0');
  const isBuy = fill.side === 'BUY';

  return {
    id: `coinbase-live-fill-${fill.entry_id ?? fill.trade_id ?? fill.order_id}`,
    date: new Date(fill.trade_time),
    type: isBuy ? 'buy' : 'sell',
    ...sides(base, quote, baseAmount, quoteAmount, isBuy),
    ...fiatFromQuote(quote, quoteAmount),
    ...(fee.isGreaterThan(0) ? { feeAsset: quote, feeAmount: fee } : {}),
    exchange: 'Coinbase',
  };
};

const withinWindow = (date: Date, from?: Date, to?: Date): boolean =>
  (!from || date >= from) && (!to || date <= to);

export class CoinbaseLiveSource implements ILiveSource {
  readonly exchangeName = 'Coinbase';
  readonly preprocessors: IImportPreprocessor[] = [];
  readonly requiresSymbols = false;
  readonly requiresDateRange = true;
  readonly whatFetches = [
    { label: 'Executed buy/sell trade fills across your full Coinbase account history.', included: true },
    {
      label:
        "Sends, receives, staking rewards, and Coinbase Earn payouts — Coinbase's trading API doesn't expose these; import them via CSV instead.",
      included: false,
    },
  ];
  readonly keyLabel = 'CDP API key name';
  readonly secretLabel = 'Ed25519 private key (PEM)';

  isAvailable(): boolean {
    return isTauri();
  }

  async hasCredentials(): Promise<boolean> {
    return invoke<boolean>('coinbase_has_credentials');
  }

  async saveCredentials(apiKey: string, secret: string): Promise<void> {
    await invoke('coinbase_save_credentials', { apiKey, secret });
  }

  async clearCredentials(): Promise<void> {
    await invoke('coinbase_clear_credentials');
  }

  async fetch(params: LiveSourceFetchParams): Promise<Transaction[]> {
    // The API needs a bounded window per request; the UI makes both dates
    // mandatory (requiresDateRange), but fall back here to keep the optional
    // type contract sound.
    const endMs = (params.to ?? new Date()).getTime();
    const startMs = (params.from ?? new Date(0)).getTime();

    // Surface backend rate-limit backoffs to the caller so the UI can show a
    // countdown. Unsubscribed in `finally` once the fetch settles.
    const unlisten = await listen<{ waitMs: number }>(RATE_LIMITED_EVENT, (event) => {
      params.onRateLimit?.({ waitMs: event.payload.waitMs });
    });

    try {
      const fills = await invoke<CoinbaseFill[]>('coinbase_fetch_fills', { startMs, endMs });
      params.onProgress?.({ completed: 1, total: 1 });

      return fills
        .map(fillToTransaction)
        .filter((tx): tx is Transaction => tx !== null)
        .filter((tx) => withinWindow(tx.date, params.from, params.to))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    } finally {
      unlisten();
    }
  }
}
