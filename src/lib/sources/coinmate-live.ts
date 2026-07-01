import BigNumber from 'bignumber.js';
import { invoke } from '@tauri-apps/api/core';
import type {
  ILiveSource,
  CredentialField,
  IImportPreprocessor,
  LiveSourceFetchParams,
  Transaction,
} from '$lib/types';
import { isTauri } from '$lib/runtime';
import { isFiat, isStablecoin } from '$lib/converters/fiat-currencies';

/**
 * Flat transaction record from Coinmate's `/transactionHistory` endpoint.
 * Amounts/price/fee arrive as strings (the Rust layer stringifies them so the
 * TypeScript BigNumber layer never touches a float across the Tauri IPC).
 */
interface CoinmateTransaction {
  transactionId: number;
  timestamp: number; // Unix ms
  transactionType: CoinmateTransactionType;
  amount: string;
  amountCurrency: string;
  price: string | null;
  priceCurrency: string | null;
  fee: string;
  feeCurrency: string;
  description: string | null;
  status: string;
  orderId: number | null;
}

/**
 * All known Coinmate transaction types the API returns. We only map the
 * trade/transfer ones we can model cleanly; voucher/other are dropped because
 * the spec doesn't expose which asset they target on both legs.
 */
type CoinmateTransactionType =
  | 'BUY'
  | 'SELL'
  | 'INSTANT_BUY'
  | 'INSTANT_SELL'
  | 'QUICK_BUY'
  | 'QUICK_SELL'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'DEBIT'
  | 'CREDIT'
  | 'NEW_USER_REWARD'
  | 'REFERRAL'
  | 'CREATE_VOUCHER'
  | 'USED_VOUCHER'
  | 'OTHER';

const TRADING_TYPES: ReadonlySet<CoinmateTransactionType> = new Set<CoinmateTransactionType>([
  'BUY', 'SELL', 'INSTANT_BUY', 'INSTANT_SELL', 'QUICK_BUY', 'QUICK_SELL',
]);

const INCOMING_TYPES: ReadonlySet<CoinmateTransactionType> = new Set<CoinmateTransactionType>([
  'DEPOSIT', 'CREDIT', 'NEW_USER_REWARD', 'REFERRAL',
]);

const OUTGOING_TRANSFER_TYPES: ReadonlySet<CoinmateTransactionType> = new Set<CoinmateTransactionType>([
  'WITHDRAWAL', 'DEBIT',
]);

const SKIPPED_TYPES: ReadonlySet<CoinmateTransactionType> = new Set<CoinmateTransactionType>([
  'CREATE_VOUCHER', 'USED_VOUCHER', 'OTHER',
]);

/** Cancelled transactions never settled, so we leave them out of the books. */
const CANCELED_STATUS = 'CANCELED';

/**
 * Use the trade's quote leg directly as the fiat value when the quote is a
 * fiat currency (or a USD-pegged stablecoin at 1:1). Crypto-quoted pairs
 * return nothing here and fall back to a rate lookup during enrichment.
 */
const fiatFromQuote = (quote: string, quoteAmount: BigNumber) => {
  if (isFiat(quote)) return { fiatCurrency: quote.toUpperCase(), fiatValue: quoteAmount };
  if (isStablecoin(quote)) return { fiatCurrency: 'USD', fiatValue: quoteAmount };
  return {};
};

/** Build the buy/sell side legs shared by the trade mapper. */
const sides = (
  base: string,
  quote: string,
  baseAmount: BigNumber,
  quoteAmount: BigNumber,
  isBuy: boolean,
): Pick<Transaction, 'fromAsset' | 'fromAmount' | 'toAsset' | 'toAmount'> =>
  isBuy
    ? { fromAsset: quote, fromAmount: quoteAmount, toAsset: base, toAmount: baseAmount }
    : { fromAsset: base, fromAmount: baseAmount, toAsset: quote, toAmount: quoteAmount };

/** Optional fee block — only attached when the fee is non-zero. */
const feeBlock = (
  fee: BigNumber,
  feeCurrency: string,
): Pick<Transaction, 'feeAsset' | 'feeAmount'> => (fee.isGreaterThan(0) ? { feeAsset: feeCurrency, feeAmount: fee } : {});

/** Convert `/transactionHistory` wire → a kryptax `Transaction`, or null if it can't be mapped. */
const toTransaction = (tx: CoinmateTransaction): Transaction | null => {
  if (tx.transactionType === undefined) return null;
  if (tx.status === CANCELED_STATUS) return null;

  const amount = new BigNumber(tx.amount ?? '0');
  const fee = new BigNumber(tx.fee ?? '0');
  const baseId = `coinmate-live-tx-${tx.transactionId}`;
  const date = new Date(tx.timestamp);

  if (TRADING_TYPES.has(tx.transactionType)) {
    // Trades: `amount` is the base asset, `price` is quote-per-base.
    // Without a price we can't reconstruct the quote leg, so skip the trade.
    if (tx.price == null || tx.priceCurrency == null) return null;
    const base = tx.amountCurrency;
    const quote = tx.priceCurrency;
    const price = new BigNumber(tx.price);
    if (!amount.isGreaterThan(0)) return null;
    const quoteAmount = amount.multipliedBy(price);
    const isBuy = tx.transactionType === 'BUY'
      || tx.transactionType === 'INSTANT_BUY'
      || tx.transactionType === 'QUICK_BUY';
    return {
      id: baseId,
      date,
      type: isBuy ? 'buy' : 'sell',
      ...sides(base, quote, amount, quoteAmount, isBuy),
      ...fiatFromQuote(quote, quoteAmount),
      ...feeBlock(fee, tx.feeCurrency),
      exchange: 'Coinmate',
    };
  }

  // Transfers / credits / debits: the single `amount`/`amountCurrency` is the
  // moving leg; the other leg (an external wallet or bank) is out-of-band.
  if (INCOMING_TYPES.has(tx.transactionType)) {
    return {
      id: baseId,
      date,
      type: 'transfer',
      toAsset: tx.amountCurrency,
      toAmount: amount,
      ...feeBlock(fee, tx.feeCurrency),
      exchange: 'Coinmate',
      notes: tx.description ?? undefined,
    };
  }

  if (OUTGOING_TRANSFER_TYPES.has(tx.transactionType)) {
    return {
      id: baseId,
      date,
      type: 'transfer',
      fromAsset: tx.amountCurrency,
      fromAmount: amount,
      ...feeBlock(fee, tx.feeCurrency),
      exchange: 'Coinmate',
      notes: tx.description ?? undefined,
    };
  }

  if (SKIPPED_TYPES.has(tx.transactionType)) {
    return null;
  }

  // Unknown future types — defensively skip rather than guess.
  return null;
};

const withinWindow = (date: Date, from?: Date, to?: Date): boolean =>
  (!from || date >= from) && (!to || date <= to);

/**
 * Coinmate is a Prague-based crypto↔fiat exchange (BTC_EUR, BTC_CZK, …).
 * Unlike Revolut X it serves an unbounded, type-unified `transactionHistory`
 * feed: a single sweep over `/transactionHistory` returns buys, sells, instant
 * & quick trades, deposits, withdrawals, rewards and credits/debits with their
 * fees — no chunking needed.
 */
export class CoinmateLiveSource implements ILiveSource {
  readonly exchangeName = 'Coinmate';
  readonly preprocessors: IImportPreprocessor[] = [];
  /** One unified history feed, so no per-pair symbol selection is needed. */
  readonly requiresSymbols = false;
  /** The API accepts an unbounded range, but the UI may optionally narrow it. */
  readonly requiresDateRange = false;
  readonly whatFetches = [
    { label: 'Buys, sells, and instant/quick trades across every pair.', included: true },
    { label: 'Crypto and fiat deposits and withdrawals, with any reported fee.', included: true },
    { label: 'Rewards, referrals and other account credits/debits.', included: true },
    { label: 'Trading fees reported on each trade.', included: true },
    { label: 'Voucher creates/uses are skipped (their asset legs aren\'t exposed).', included: false },
    { label: 'Cancelled transactions are skipped because they never settled.', included: false },
  ];
  readonly credentialFields: CredentialField[] = [
    { id: 'clientId', label: 'Client ID' },
    { id: 'publicKey', label: 'Public key' },
    { id: 'privateKey', label: 'Private key', placeholder: 'Used to sign requests — never sent' },
  ];

  isAvailable(): boolean {
    return isTauri();
  }

  async hasCredentials(): Promise<boolean> {
    return invoke<boolean>('coinmate_has_credentials');
  }

  async saveCredentials(values: Record<string, string>): Promise<void> {
    await invoke('coinmate_save_credentials', {
      clientId: values.clientId,
      publicKey: values.publicKey,
      privateKey: values.privateKey,
    });
  }

  async clearCredentials(): Promise<void> {
    await invoke('coinmate_clear_credentials');
  }

  async fetch(params: LiveSourceFetchParams): Promise<Transaction[]> {
    const startMs = params.from ? params.from.getTime() : null;
    const endMs = params.to ? params.to.getTime() : null;

    // The Rust layer walks offset-based pages of 1000 on our behalf, returning
    // the whole flattened array. Pagination is invisible here.
    const records = await invoke<CoinmateTransaction[]>('coinmate_fetch_transaction_history', {
      startMs: startMs as number | null,
      endMs: endMs as number | null,
    });

    // The server already narrow by `timestampFrom`/`timestampTo`; we apply the
    // window once more here for safety against timezone edge cases in the bounds
    // conversion. Trims instead of re-fetching — fetch happens once.
    const txs = records
      .map(toTransaction)
      .filter((tx): tx is Transaction => tx !== null)
      .filter((tx) => withinWindow(tx.date, params.from, params.to))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Coinmate's rate limit is 100 req/min — generous, and a typical account
    // only needs a handful of pages of 1000, so no pacing is applied here.
    return txs;
  }
}