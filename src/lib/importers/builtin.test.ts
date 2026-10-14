import { describe, it, expect } from 'vitest';
import { BUILTIN_CONFIGS, BUILTIN_IMPORTER_NAMES, builtinConfig, createBuiltinImporters, validateConfig } from '$lib/importers';

describe('built-in importers', () => {
  it('ships every built-in config in a valid state', () => {
    BUILTIN_CONFIGS.forEach((config) => {
      const others = BUILTIN_IMPORTER_NAMES.filter((n) => n !== config.name);
      expect(validateConfig(config, others)).toEqual([]);
    });
  });

  it('has unique ids and names', () => {
    expect(new Set(BUILTIN_CONFIGS.map((c) => c.id)).size).toBe(BUILTIN_CONFIGS.length);
    expect(new Set(BUILTIN_IMPORTER_NAMES).size).toBe(BUILTIN_IMPORTER_NAMES.length);
  });

  it('creates the data-defined importers plus the code-defined Binance importer', () => {
    expect(createBuiltinImporters().map((i) => i.exchangeName)).toEqual(['Ledger', 'Coinbase', 'Coinbase Pro', 'Revolut X', 'Binance']);
  });

  it('throws for an unknown built-in id', () => {
    expect(() => builtinConfig('nope')).toThrow('No built-in importer "nope"');
  });
});
