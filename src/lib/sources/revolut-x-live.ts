import BigNumber from 'bignumber.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ILiveSource,
  IImportPreprocessor,
  LiveSourceFetchParams,
  Transaction,
} from '$lib/types';
import { isTauri } from '$lib/runtime';
import { isFiat, isStablecoin } from '$lib/converters/fiat-currencies';

/**
 * A historical order from Revolut X. A market/limit buy or sell is one order;
 * `filled_quantity` is the executed base amount and `filled_amount` the executed
 * quote amount. Fully-unfilled or rejected orders have `filled_quantity` 0.
 */
interface RevolutOrder {
  id: string;
  symbol: string; // e.g. "BTC/USD"
  side: 'buy' | 'sell';
  filled_quantity: string; // base asset
  filled_amount?: string; // quote asset (when reported)
  average_fill_price?: string;
  price: string;
  status: string;
  created_date: number; // epoch ms
  updated_date: number; // epoch ms
}

/** One private trade fill (compact wire field names). */
interface RevolutTrade {
  tid: string; // trade id
  p: string; // price (quote per unit of base)
  pc: string; // price currency (quote asset)
  q: string; // quantity (base asset)
  qc: string; // quantity currency (base asset)
  s: 'buy' | 'sell'; // side
  oid: string; // id of the order this fill belongs to
  tdt: number; // trade timestamp (epoch ms)
  im: boolean; // is-maker flag
}

interface RevolutBalance {
  currency: string;
  total: string;
}

interface RevolutPair {
  base: string;
  quote: string;
  status: 'active' | 'inactive';
}

/** Split a Revolut pair symbol ("BTC/USD" or "BTC-USD") into base and quote. */
const splitSymbol = (symbol: string): { base: string; quote: string } | null => {
  const parts = symbol.split(/[/-]/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { base: parts[0], quote: parts[1] };
};

/** Build the buy/sell sides shared by order and trade mappers. */
const sides = (base: string, quote: string, baseAmount: BigNumber, quoteAmount: BigNumber, isBuy: boolean) =>
  isBuy
    ? { fromAsset: quote, fromAmount: quoteAmount, toAsset: base, toAmount: baseAmount }
    : { fromAsset: base, fromAmount: baseAmount, toAsset: quote, toAmount: quoteAmount };

/**
 * The trade's quote leg already carries the executed fiat value, so use it
 * directly when the quote is a fiat currency (or a USD-pegged stablecoin,
 * valued 1:1 in USD). This avoids a CoinGecko price lookup during enrichment;
 * a quote in another fiat is later converted fiat→fiat to the tax currency.
 * Crypto-quoted pairs return nothing here and fall back to a rate lookup.
 */
const fiatFromQuote = (quote: string, quoteAmount: BigNumber) => {
  if (isFiat(quote)) return { fiatCurrency: quote.toUpperCase(), fiatValue: quoteAmount };
  if (isStablecoin(quote)) return { fiatCurrency: 'USD', fiatValue: quoteAmount };
  return {};
};

/**
 * Map an executed Revolut X order to a Transaction. The base side is
 * `filled_quantity`; the quote side is `filled_amount` when present, otherwise
 * quantity × (average fill price, falling back to the order price). The orders
 * list carries no fee, so fees are left to fiat enrichment / review.
 */
const orderToTransaction = (order: RevolutOrder): Transaction | null => {
  const filledQty = new BigNumber(order.filled_quantity || '0');
  if (!filledQty.isGreaterThan(0)) return null;

  const split = splitSymbol(order.symbol);
  if (!split) return null;
  const { base, quote } = split;

  const quoteAmount = order.filled_amount
    ? new BigNumber(order.filled_amount)
    : filledQty.multipliedBy(new BigNumber(order.average_fill_price || order.price || '0'));

  return {
    id: `revolut-x-live-order-${order.id}`,
    date: new Date(order.updated_date ?? order.created_date),
    type: order.side === 'buy' ? 'buy' : 'sell',
    ...sides(base, quote, filledQty, quoteAmount, order.side === 'buy'),
    ...fiatFromQuote(quote, quoteAmount),
    exchange: 'Revolut X',
  };
};

/** Map a private trade fill to a Transaction. Quote amount is quantity × price. */
const tradeToTransaction = (trade: RevolutTrade): Transaction => {
  const base = trade.qc;
  const quote = trade.pc;
  const quantity = new BigNumber(trade.q);
  const quoteAmount = quantity.multipliedBy(new BigNumber(trade.p));

  return {
    id: `revolut-x-live-trade-${trade.tid}`,
    date: new Date(trade.tdt),
    type: trade.s === 'buy' ? 'buy' : 'sell',
    ...sides(base, quote, quantity, quoteAmount, trade.s === 'buy'),
    ...fiatFromQuote(quote, quoteAmount),
    exchange: 'Revolut X',
  };
};

const withinWindow = (date: Date, from?: Date, to?: Date): boolean =>
  (!from || date >= from) && (!to || date <= to);

/**
 * Revolut X only serves a window of at most ~30 days per query, so a wider range
 * must be split. Use a span just under 30 days to stay safely inside the server's
 * inclusive cap.
 */
const CHUNK_MS = 29 * 24 * 60 * 60 * 1000;

/** Delay between sequential requests, to stay clear of rate limits. */
const REQUEST_DELAY_MS = 75;

/** Backend event fired (with `{ waitMs }`) when a request is rate limited and backing off. */
const RATE_LIMITED_EVENT = 'revolut-x://rate-limited';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Split [startMs, endMs] into consecutive, non-overlapping spans of at most
 * CHUNK_MS each. Each span after the first starts 1ms past the previous end.
 */
export const dateChunks = (startMs: number, endMs: number): Array<[number, number]> => {
  if (endMs < startMs) return [];
  const chunks: Array<[number, number]> = [];
  let start = startMs;
  while (start <= endMs) {
    const end = Math.min(start + CHUNK_MS, endMs);
    chunks.push([start, end]);
    start = end + 1;
  }
  return chunks;
};

export class RevolutXLiveSource implements ILiveSource {
  readonly exchangeName = 'Revolut X';
  readonly preprocessors: IImportPreprocessor[] = [];
  readonly requiresSymbols = false;
  readonly requiresDateRange = true;
  readonly whatFetches = [
    { label: 'Historical orders across your full Revolut X account history.', included: true },
    { label: 'Private trade fills for assets you currently hold.', included: true },
    {
      label:
        'Trades made in the main Revolut app (not the X exchange) — these aren\'t exposed by the API; export them as a CSV.',
      included: false,
    },
    {
      label:
        "Trading fees — Revolut's API doesn't report them, so cost basis may be slightly understated. Add them via CSV import for exact figures.",
      included: false,
    },
  ];
  readonly keyLabel = 'API key';
  readonly secretLabel = 'Ed25519 private key (PEM)';

  isAvailable(): boolean {
    return isTauri();
  }

  async hasCredentials(): Promise<boolean> {
    return invoke<boolean>('revolut_x_has_credentials');
  }

  async saveCredentials(apiKey: string, secret: string): Promise<void> {
    await invoke('revolut_x_save_credentials', { apiKey, secret });
  }

  async clearCredentials(): Promise<void> {
    await invoke('revolut_x_clear_credentials');
  }

  /** Active pairs whose base asset the user currently holds, as `BASE-QUOTE`. */
  private async heldPairSymbols(): Promise<string[]> {
    const [balances, pairs] = await Promise.all([
      invoke<RevolutBalance[]>('revolut_x_fetch_balances'),
      invoke<Record<string, RevolutPair>>('revolut_x_fetch_pairs'),
    ]);

    const held = new Set(
      balances.filter((b) => new BigNumber(b.total || '0').isGreaterThan(0)).map((b) => b.currency),
    );

    const symbols = Object.values(pairs)
      .filter((p) => p.status === 'active' && held.has(p.base))
      .map((p) => `${p.base}-${p.quote}`);

    return [...new Set(symbols)];
  }

  async fetch(params: LiveSourceFetchParams): Promise<Transaction[]> {
    // The API needs a bounded window per request; the UI makes both dates
    // mandatory, but fall back here to keep the optional type contract sound.
    const endMs = (params.to ?? new Date()).getTime();
    const startMs = (params.from ?? new Date(endMs - CHUNK_MS)).getTime();

    // Surface backend rate-limit backoffs to the caller so the UI can show a
    // countdown. Unsubscribed in `finally` once the fetch settles.
    const unlisten = await listen<{ waitMs: number }>(RATE_LIMITED_EVENT, (event) => {
      params.onRateLimit?.({ waitMs: event.payload.waitMs });
    });

    try {
      return await this.fetchWindows(params, startMs, endMs);
    } finally {
      unlisten();
    }
  }

  private async fetchWindows(
    params: LiveSourceFetchParams,
    startMs: number,
    endMs: number,
  ): Promise<Transaction[]> {
    const symbols = await this.heldPairSymbols();
    const chunks = dateChunks(startMs, endMs);

    // Progress is reported per date period (chunk); within a period we still
    // issue one orders request + one trades request per symbol, paced to stay
    // clear of rate limits.
    const total = chunks.length;
    const totalRequests = chunks.length * (1 + symbols.length);
    let completed = 0;
    let requestsDone = 0;
    params.onProgress?.({ completed, total });

    const orders: RevolutOrder[] = [];
    const trades: RevolutTrade[] = [];

    // Pause between requests, but not after the very last one.
    const paceAfterRequest = async () => {
      requestsDone += 1;
      if (requestsDone < totalRequests) await delay(REQUEST_DELAY_MS);
    };

    for (const [chunkStart, chunkEnd] of chunks) {
      const page = await invoke<RevolutOrder[]>('revolut_x_fetch_orders', {
        startMs: chunkStart,
        endMs: chunkEnd,
      });
      orders.push(...page);
      await paceAfterRequest();

      for (const symbol of symbols) {
        const fills = await invoke<RevolutTrade[]>('revolut_x_fetch_trades', {
          symbol,
          startMs: chunkStart,
          endMs: chunkEnd,
        });
        trades.push(...fills);
        await paceAfterRequest();
      }

      completed += 1;
      params.onProgress?.({ completed, total });
    }

    // Collapse any records seen in more than one chunk to a single entry.
    const uniqueOrders = [...new Map(orders.map((o) => [o.id, o])).values()];
    const uniqueTrades = [...new Map(trades.map((t) => [t.tid, t])).values()];

    const orderTxs = uniqueOrders
      .map(orderToTransaction)
      .filter((tx): tx is Transaction => tx !== null);

    // Skip trade fills already represented by a fetched order, so the same
    // execution isn't counted twice.
    const orderIds = new Set(uniqueOrders.map((o) => o.id));
    const tradeTxs = uniqueTrades
      .filter((t) => !orderIds.has(t.oid))
      .map(tradeToTransaction);

    return [...orderTxs, ...tradeTxs]
      .filter((tx) => withinWindow(tx.date, params.from, params.to))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
