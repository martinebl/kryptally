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
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

interface BinanceExchangeInfo {
  symbols: BinanceExchangeSymbol[];
}

/** Known Binance quote assets, ordered longest-first so multi-char suffixes match before shorter ones. */
const KNOWN_QUOTE_ASSETS = [
  'FDUSD', 'TUSD', 'BUSD', 'USDC', 'USDT', 'DAI',
  'BTC', 'ETH', 'BNB', 'TRY', 'BRL', 'EUR', 'GBP', 'AUD', 'JPY', 'RUB', 'ZAR', 'USD',
];

const splitSymbol = (symbol: string): { base: string; quote: string } | null => {
  const quote = KNOWN_QUOTE_ASSETS.find((q) => symbol.endsWith(q) && symbol.length > q.length);
  if (!quote) return null;
  return { base: symbol.slice(0, symbol.length - quote.length), quote };
};

/** Binance withdrawal `applyTime` arrives as "YYYY-MM-DD HH:mm:ss" (UTC). */
const parseWithdrawalTime = (raw: string): Date => {
  const [datePart, timePart] = raw.split(' ');
  return new Date(`${datePart}T${timePart ?? '00:00:00'}Z`);
};

const tradeToTransaction = (trade: BinanceTrade): Transaction | null => {
  const split = splitSymbol(trade.symbol);
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
  readonly keyLabel = 'API key (read-only)';
  readonly secretLabel = 'API secret';

  isAvailable(): boolean {
    return isTauri();
  }

  async hasCredentials(): Promise<boolean> {
    return invoke<boolean>('binance_has_credentials');
  }

  async saveCredentials(apiKey: string, secret: string): Promise<void> {
    await invoke('binance_save_credentials', { apiKey, secret });
  }

  async clearCredentials(): Promise<void> {
    await invoke('binance_clear_credentials');
  }

  /**
   * Guess one trading pair per currently-held asset: the first quote asset
   * (in `KNOWN_QUOTE_ASSETS` preference order) that Binance actually lists a
   * live symbol for against that base. Binance has no "symbols I've traded"
   * endpoint, so this is a starting guess — the UI lets the user add any
   * other pairs they've actually traded.
   */
  async discoverSymbols(): Promise<string[]> {
    const [account, exchangeInfo] = await Promise.all([
      invoke<BinanceAccount>('binance_fetch_account'),
      invoke<BinanceExchangeInfo>('binance_fetch_exchange_info'),
    ]);

    const held = new Set(
      account.balances
        .filter((b) => new BigNumber(b.free).plus(b.locked).isGreaterThan(0))
        .map((b) => b.asset),
    );

    const quotesByBase = new Map<string, Set<string>>();
    for (const s of exchangeInfo.symbols) {
      if (s.status !== 'TRADING') continue;
      if (!quotesByBase.has(s.baseAsset)) quotesByBase.set(s.baseAsset, new Set());
      quotesByBase.get(s.baseAsset)!.add(s.quoteAsset);
    }

    const symbols = [...held]
      .map((asset) => {
        const quotes = quotesByBase.get(asset);
        const quote = quotes && KNOWN_QUOTE_ASSETS.find((q) => quotes.has(q));
        return quote ? `${asset}${quote}` : null;
      })
      .filter((s): s is string => s !== null);

    return [...new Set(symbols)];
  }

  async fetch(params: LiveSourceFetchParams): Promise<Transaction[]> {
    const startMs = params.from ? params.from.getTime() : null;
    const endMs = params.to ? params.to.getTime() : null;
    const symbols = params.symbols ?? [];

    const trades = (
      await Promise.all(
        symbols.map((symbol) =>
          invoke<BinanceTrade[]>('binance_fetch_trades', {
            symbol,
            startMs,
            endMs,
          }),
        ),
      )
    ).flat();

    const deposits = await invoke<BinanceDeposit[]>('binance_fetch_deposits', {
      startMs,
      endMs,
    });

    const withdrawals = await invoke<BinanceWithdrawal[]>('binance_fetch_withdrawals', {
      startMs,
      endMs,
    });

    const tradeTxs = trades
      .map(tradeToTransaction)
      .filter((tx): tx is Transaction => tx !== null);
    const depositTxs = deposits.map(depositToTransaction);
    const withdrawalTxs = withdrawals.map(withdrawalToTransaction);

    return [...tradeTxs, ...depositTxs, ...withdrawalTxs]
      .filter((tx) => withinWindow(tx.date, params.from, params.to))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
