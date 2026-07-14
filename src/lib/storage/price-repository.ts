import BigNumber from 'bignumber.js';
import type { PricesByAsset, PriceData } from '$lib/converters/csv-prices';
import type { IStorage } from './storage';

const KEY = 'kryptally-price-data';

type SerializedPriceData = { prices: Record<string, string>; currency: string };
type SerializedStore = Record<string, SerializedPriceData>;

const serializePriceData = ({ prices, currency }: PriceData): SerializedPriceData => ({
  prices: Object.fromEntries([...prices].map(([date, price]) => [date, price.toFixed()])),
  currency,
});

const deserializePriceData = ({ prices, currency }: SerializedPriceData): PriceData => ({
  prices: new Map(Object.entries(prices).map(([date, price]) => [date, new BigNumber(price)])),
  currency,
});

export const serializePricesByAsset = (data: PricesByAsset): string =>
  JSON.stringify(
    Object.fromEntries([...data].map(([coinId, priceData]) => [coinId, serializePriceData(priceData)]))
  );

export const deserializePricesByAsset = (raw: string): PricesByAsset =>
  new Map(
    Object.entries(JSON.parse(raw) as SerializedStore).map(([coinId, data]) => [
      coinId,
      deserializePriceData(data),
    ])
  );

const parseStore = (raw: string | null): SerializedStore => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SerializedStore;
  } catch (e) {
    console.warn('Ignoring corrupted stored price data', e);
    return {};
  }
};

export interface IPriceRepository {
  /** Merge stored price entries into target; stored entries win over existing ones. */
  mergeInto(target: PricesByAsset): Promise<void>;
  save(coinId: string, priceData: PriceData): Promise<void>;
}

export const createPriceRepository = (storage: IStorage): IPriceRepository => {
  // Saves are read-modify-write on a single key; queue them so overlapping
  // saves cannot read the same snapshot and lose each other's entries.
  let pendingWrite: Promise<void> = Promise.resolve();

  return {
    mergeInto: async (target) => {
      Object.entries(parseStore(await storage.get(KEY))).forEach(([coinId, data]) =>
        target.set(coinId, deserializePriceData(data))
      );
    },

    save: (coinId, priceData) => {
      const write = pendingWrite
        .catch(() => {}) // a failed earlier save must not block later ones
        .then(async () => {
          const store = parseStore(await storage.get(KEY));
          store[coinId] = serializePriceData(priceData);
          await storage.set(KEY, JSON.stringify(store));
        });
      pendingWrite = write;
      return write;
    },
  };
};
