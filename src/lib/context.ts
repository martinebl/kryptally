import { getContext, setContext } from 'svelte';
import type { ICryptoToFiatConverter } from '$lib/types';
import type { PriceData } from '$lib/converters/csv-prices';

const CRYPTO_CONVERTER_KEY = Symbol('cryptoToFiatConverter');

export const setCryptoConverter = (converter: ICryptoToFiatConverter) =>
  setContext(CRYPTO_CONVERTER_KEY, converter);

export const getCryptoConverter = (): ICryptoToFiatConverter =>
  getContext(CRYPTO_CONVERTER_KEY);

const PERSIST_PRICE_ENTRY_KEY = Symbol('persistPriceEntry');

export type PersistPriceEntry = (coinId: string, data: PriceData) => Promise<void>;

export const setPersistPriceEntry = (persist: PersistPriceEntry) =>
  setContext(PERSIST_PRICE_ENTRY_KEY, persist);

export const getPersistPriceEntry = (): PersistPriceEntry =>
  getContext(PERSIST_PRICE_ENTRY_KEY);
