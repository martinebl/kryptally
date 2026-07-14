import type { IStorage } from './storage';

const keyFor = (exchangeName: string) => `kryptax-last-fetch-${exchangeName}`;

export interface ILastFetchRepository {
  get(exchangeName: string): Promise<Date | null>;
  set(exchangeName: string, date: Date): Promise<void>;
}

export const createLastFetchRepository = (storage: IStorage): ILastFetchRepository => ({
  get: async (exchangeName) => {
    try {
      const raw = await storage.get(keyFor(exchangeName));
      return raw ? new Date(raw) : null;
    } catch {
      return null;
    }
  },

  set: async (exchangeName, date) => {
    try {
      await storage.set(keyFor(exchangeName), date.toISOString());
    } catch {}
  },
});
