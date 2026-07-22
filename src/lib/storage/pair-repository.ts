import type { IStorage } from './storage';

export interface PairData {
  symbols: string[];
  autoDetectedSymbols: string[];
}

const EMPTY: PairData = { symbols: [], autoDetectedSymbols: [] };

const key = (exchangeName: string) => `kryptally-pairs-${exchangeName}`;

const parse = (raw: string | null): PairData => {
  if (!raw) return EMPTY;
  try {
    return JSON.parse(raw) as PairData;
  } catch (e) {
    console.warn('Ignoring corrupted stored pair data', e);
    return EMPTY;
  }
};

export interface IPairRepository {
  load(exchangeName: string): Promise<PairData>;
  save(exchangeName: string, data: PairData): Promise<void>;
  clear(exchangeName: string): Promise<void>;
}

export const createPairRepository = (storage: IStorage): IPairRepository => ({
  load: async (exchangeName) => parse(await storage.get(key(exchangeName))),
  save: (exchangeName, data) => storage.set(key(exchangeName), JSON.stringify(data)),
  clear: (exchangeName) => storage.remove(key(exchangeName)),
});
