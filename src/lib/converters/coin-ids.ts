/** Maps common ticker symbols to CoinGecko coin IDs */
export const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
  BNB: 'binancecoin', USDT: 'tether', USDC: 'usd-coin',
  BUSD: 'binance-usd', TRX: 'tron', DOT: 'polkadot',
  ADA: 'cardano', DOGE: 'dogecoin', XRP: 'ripple',
  MATIC: 'matic-network', AVAX: 'avalanche-2', LINK: 'chainlink',
  LUNA: 'terra-luna', SHIB: 'shiba-inu', LTC: 'litecoin',
  UNI: 'uniswap', ATOM: 'cosmos', FIL: 'filecoin',
  APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', NEAR: 'near',
  FLR: 'flare-networks'
};

export const resolveCoinId = (ticker: string): string =>
  COIN_IDS[ticker.toUpperCase()] ?? ticker.toLowerCase();
