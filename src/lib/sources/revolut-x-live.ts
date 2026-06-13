import BigNumber from 'bignumber.js';
import { invoke } from '@tauri-apps/api/core';
import type {
  ILiveSource,
  IImportPreprocessor,
  LiveSourceFetchParams,
  Transaction,
} from '$lib/types';
import { isTauri } from '$lib/runtime';

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
    exchange: 'Revolut X',
  };
};

const withinWindow = (date: Date, from?: Date, to?: Date): boolean =>
  (!from || date >= from) && (!to || date <= to);

export class RevolutXLiveSource implements ILiveSource {
  readonly exchangeName = 'Revolut X';
  readonly preprocessors: IImportPreprocessor[] = [];
  readonly requiresSymbols = false;
  readonly symbolsNote =
    'Fetches all your Revolut X exchange activity: historical orders plus private trade fills (for assets you currently hold). Trades made in the main Revolut app (not the Revolut X exchange) are not exposed by this API — use a CSV export for those. The API does not report fees.';
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
    const startMs = params.from ? params.from.getTime() : null;
    const endMs = params.to ? params.to.getTime() : null;

    const symbols = await this.heldPairSymbols();

    const [orders, tradesPerSymbol] = await Promise.all([
      invoke<RevolutOrder[]>('revolut_x_fetch_orders', { startMs, endMs }),
      Promise.all(
        symbols.map((symbol) =>
          invoke<RevolutTrade[]>('revolut_x_fetch_trades', { symbol, startMs, endMs }),
        ),
      ),
    ]);

    const orderTxs = orders
      .map(orderToTransaction)
      .filter((tx): tx is Transaction => tx !== null);

    // Skip trade fills already represented by a fetched order, so the same
    // execution isn't counted twice.
    const orderIds = new Set(orders.map((o) => o.id));
    const tradeTxs = tradesPerSymbol
      .flat()
      .filter((t) => !orderIds.has(t.oid))
      .map(tradeToTransaction);

    return [...orderTxs, ...tradeTxs]
      .filter((tx) => withinWindow(tx.date, params.from, params.to))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
