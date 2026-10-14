import type { CustomImporterConfig, IExchangeImporter } from '$lib/types';
import { BinanceImporter } from '$lib/importers/binance';
import { createCustomImporter, validateConfig } from '$lib/importers/custom';
import builtinJson from '$lib/importers/builtin-importers.json';

/** Importers that can't be expressed as data (multi-row assembly). */
const CODE_IMPORTER_NAMES = ['Binance'] as const;

const loadBuiltins = (raw: unknown): readonly CustomImporterConfig[] => {
  const configs = raw as CustomImporterConfig[];
  const problems = configs.flatMap((config) => {
    const otherNames = [...configs.filter((c) => c !== config).map((c) => c.name), ...CODE_IMPORTER_NAMES];
    return validateConfig(config, otherNames).map((p) => `${config.id}: ${p}`);
  });
  if (problems.length > 0) throw new Error(`Invalid built-in importer config:\n${problems.join('\n')}`);
  return configs;
};

/** Simple single-row importers shipped as data. */
export const BUILTIN_CONFIGS: readonly CustomImporterConfig[] = loadBuiltins(builtinJson);

/** Names user-defined importers may not reuse. */
export const BUILTIN_IMPORTER_NAMES: readonly string[] = [...BUILTIN_CONFIGS.map((c) => c.name), ...CODE_IMPORTER_NAMES];

export const builtinConfig = (id: string): CustomImporterConfig => {
  const config = BUILTIN_CONFIGS.find((c) => c.id === id);
  if (!config) throw new Error(`No built-in importer "${id}"`);
  return config;
};

export const createBuiltinImporters = (): IExchangeImporter[] => [
  ...BUILTIN_CONFIGS.map((c) => createCustomImporter(c)),
  new BinanceImporter(),
];
