import BigNumber from 'bignumber.js';
import { invoke } from '@tauri-apps/api/core';
import type {
  ILiveSource,
  IImportPreprocessor,
  LiveSourceFetchParams,
  Transaction,
  TransactionType,
} from '$lib/types';
import { isTauri } from '$lib/runtime';

interface BinanceTrade {
  symbol: string;
  id: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
}

interface BinanceDeposit {
  amount: string;
  coin: string;
  insertTime: number;
  txId?: string;
}

interface BinanceWithdrawal {
  id: string;
  amount: string;
  transactionFee?: string;
  coin: string;
  applyTime: string;
  txId?: string;
}

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceAccount {
  balances: BinanceBalance[];
}

interface BinanceExchangeSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

interface BinanceExchangeInfo {
  symbols: BinanceExchangeSymbol[];
}

/**
 * Fallback quote-asset guesses for trades whose symbol isn't in the exchange's
 * current symbol list (e.g. a delisted pair, or the exchange-info fetch failed).
 * `tradeToTransaction` prefers the real `quoteAsset` from exchange info whenever
 * the traded symbol is known; this list only matters when it isn't, so an
 * incomplete list here no longer silently drops trades for any currently-listed
 * pair. Ordered longest-first so multi-char suffixes (e.g. "BUSD") match before
 * shorter ones that are also a suffix of them (e.g. "USD").
 */
const KNOWN_QUOTE_SUFFIXES = [
  'FDUSD', 'TUSD', 'BUSD', 'USDC', 'USDT', 'DAI',
  'BTC', 'ETH', 'BNB', 'TRY', 'BRL', 'EUR', 'GBP', 'AUD', 'JPY', 'RUB', 'ZAR', 'USD',
];

/**
 * Preferred quote assets for guessing a pair to auto-detect, in priority order.
 * Deliberately a short list of stablecoins and major cryptos only — no regional
 * fiat, since a stablecoin pair is available for virtually every held asset and
 * fiat pairs would never realistically be reached. This is a preference ordering,
 * not a completeness requirement, so it doesn't need `KNOWN_QUOTE_SUFFIXES`'s fiat
 * entries.
 */
const DISCOVERY_QUOTE_PREFERENCE = ['FDUSD', 'TUSD', 'BUSD', 'USDC', 'USDT', 'DAI', 'BTC', 'ETH', 'BNB'];

const splitSymbol = (symbol: string, knownQuote?: string): { base: string; quote: string } | null => {
  const quote = knownQuote ?? KNOWN_QUOTE_SUFFIXES.find((q) => symbol.endsWith(q) && symbol.length > q.length);
  if (!quote || symbol.length <= quote.length) return null;
  return { base: symbol.slice(0, symbol.length - quote.length), quote };
};

/** Binance withdrawal `applyTime` arrives as "YYYY-MM-DD HH:mm:ss" (UTC). */
const parseWithdrawalTime = (raw: string): Date => {
  const [datePart, timePart] = raw.split(' ');
  return new Date(`${datePart}T${timePart ?? '00:00:00'}Z`);
};

const tradeToTransaction = (trade: BinanceTrade, quoteBySymbol: Map<string, string>): Transaction | null => {
  const split = splitSymbol(trade.symbol, quoteBySymbol.get(trade.symbol));
  if (!split) return null;

  const { base, quote } = split;
  const qty = new BigNumber(trade.qty);
  const quoteQty = new BigNumber(trade.quoteQty);
  const fee = new BigNumber(trade.commission);

  const type: TransactionType = trade.isBuyer ? 'buy' : 'sell';
  const fromAsset = trade.isBuyer ? quote : base;
  const fromAmount = trade.isBuyer ? quoteQty : qty;
  const toAsset = trade.isBuyer ? base : quote;
  const toAmount = trade.isBuyer ? qty : quoteQty;

  return {
    id: `binance-live-trade-${trade.symbol}-${trade.id}`,
    date: new Date(trade.time),
    type,
    fromAsset,
    fromAmount,
    toAsset,
    toAmount,
    ...(fee.isGreaterThan(0)
      ? { feeAsset: trade.commissionAsset, feeAmount: fee }
      : {}),
    exchange: 'Binance',
  };
};

const depositToTransaction = (deposit: BinanceDeposit): Transaction => ({
  id: `binance-live-deposit-${deposit.txId ?? deposit.insertTime}-${deposit.coin}`,
  date: new Date(deposit.insertTime),
  type: 'transfer',
  toAsset: deposit.coin,
  toAmount: new BigNumber(deposit.amount),
  exchange: 'Binance',
  notes: 'Deposit',
});

const withdrawalToTransaction = (w: BinanceWithdrawal): Transaction => {
  const fee = new BigNumber(w.transactionFee ?? '0');
  return {
    id: `binance-live-withdraw-${w.id}`,
    date: parseWithdrawalTime(w.applyTime),
    type: 'transfer',
    fromAsset: w.coin,
    fromAmount: new BigNumber(w.amount),
    ...(fee.isGreaterThan(0) ? { feeAsset: w.coin, feeAmount: fee } : {}),
    exchange: 'Binance',
    notes: 'Withdrawal',
  };
};

const withinWindow = (date: Date, from?: Date, to?: Date): boolean =>
  (!from || date >= from) && (!to || date <= to);

export class BinanceLiveSource implements ILiveSource {
  readonly exchangeName = 'Binance';
  readonly preprocessors: IImportPreprocessor[] = [];
  readonly symbolPlaceholder = 'BTCUSDT, ETHUSDT, SOLUSDT';
  readonly symbolsNote = 'Deposits and withdrawals are fetched automatically.';
  readonly credentialFields = [
    { id: 'apiKey', label: 'API key (read-only)' },
    { id: 'secret', label: 'API secret' },
  ];

  isAvailable(): boolean {
    return isTauri();
  }

  async hasCredentials(): Promise<boolean> {
    return invoke<boolean>('binance_has_credentials');
  }

  async saveCredentials(values: Record<string, string>): Promise<void> {
    await invoke('binance_save_credentials', { apiKey: values.apiKey, secret: values.secret });
  }

  async clearCredentials(): Promise<void> {
    await invoke('binance_clear_credentials');
  }

  private exchangeSymbolsPromise: Promise<BinanceExchangeSymbol[]> | null = null;

  /**
   * All symbols Binance's exchange info currently lists, of any status.
   * Memoized per instance so `discoverSymbols`, `listSymbols`, and `fetch`
   * (each of which needs this data) share one request instead of one each.
   */
  private async fetchExchangeSymbols(): Promise<BinanceExchangeSymbol[]> {
    if (!this.exchangeSymbolsPromise) {
      this.exchangeSymbolsPromise = invoke<BinanceExchangeInfo>('binance_fetch_exchange_info')
        .then((info) => info.symbols)
        .catch((e) => {
          this.exchangeSymbolsPromise = null;
          throw e;
        });
    }
    return this.exchangeSymbolsPromise;
  }

  /** Every symbol Binance currently lists as tradable (`status === 'TRADING'`). */
  private async fetchTradingSymbols(): Promise<BinanceExchangeSymbol[]> {
    return (await this.fetchExchangeSymbols()).filter((s) => s.status === 'TRADING');
  }

  /**
   * Guess one trading pair per currently-held asset: the first quote asset
   * (in `DISCOVERY_QUOTE_PREFERENCE` order) that Binance actually lists a
   * live symbol for against that base. Binance has no "symbols I've traded"
   * endpoint, so this is a starting guess — the UI lets the user add any
   * other pairs they've actually traded.
   */
  async discoverSymbols(): Promise<string[]> {
    const [account, tradingSymbols] = await Promise.all([
      invoke<BinanceAccount>('binance_fetch_account'),
      this.fetchTradingSymbols(),
    ]);

    const held = new Set(
      account.balances
        .filter((b) => new BigNumber(b.free).plus(b.locked).isGreaterThan(0))
        .map((b) => b.asset),
    );

    const symbolByBaseAndQuote = new Map<string, Map<string, string>>();
    for (const s of tradingSymbols) {
      if (!symbolByBaseAndQuote.has(s.baseAsset)) symbolByBaseAndQuote.set(s.baseAsset, new Map());
      symbolByBaseAndQuote.get(s.baseAsset)!.set(s.quoteAsset, s.symbol);
    }

    const symbols = [...held]
      .map((asset) => {
        const quotes = symbolByBaseAndQuote.get(asset);
        const quote = quotes && DISCOVERY_QUOTE_PREFERENCE.find((q) => quotes.has(q));
        return quote ? quotes!.get(quote)! : null;
      })
      .filter((s): s is string => s !== null);

    return [...new Set(symbols)];
  }

  /** All symbols Binance currently lists as tradable, for pair-input suggestions. */
  async listSymbols(): Promise<string[]> {
    const tradingSymbols = await this.fetchTradingSymbols();
    return [...new Set(tradingSymbols.map((s) => s.symbol))];
  }

  async fetch(params: LiveSourceFetchParams): Promise<Transaction[]> {
    const startMs = params.from ? params.from.getTime() : null;
    const endMs = params.to ? params.to.getTime() : null;
    const symbols = params.symbols ?? [];

    const [trades, exchangeSymbols] = await Promise.all([
      Promise.all(
        symbols.map((symbol) =>
          invoke<BinanceTrade[]>('binance_fetch_trades', {
            symbol,
            startMs,
            endMs,
          }),
        ),
      ).then((results) => results.flat()),
      this.fetchExchangeSymbols(),
    ]);

    const deposits = await invoke<BinanceDeposit[]>('binance_fetch_deposits', {
      startMs,
      endMs,
    });

    const withdrawals = await invoke<BinanceWithdrawal[]>('binance_fetch_withdrawals', {
      startMs,
      endMs,
    });

    const quoteBySymbol = new Map(exchangeSymbols.map((s) => [s.symbol, s.quoteAsset]));

    const tradeTxs = trades
      .map((trade) => tradeToTransaction(trade, quoteBySymbol))
      .filter((tx): tx is Transaction => tx !== null);
    const depositTxs = deposits.map(depositToTransaction);
    const withdrawalTxs = withdrawals.map(withdrawalToTransaction);

    return [...tradeTxs, ...depositTxs, ...withdrawalTxs]
      .filter((tx) => withinWindow(tx.date, params.from, params.to))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
