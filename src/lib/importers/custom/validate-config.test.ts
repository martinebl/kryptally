import { describe, it, expect } from 'vitest';
import { validateConfig } from '$lib/importers/custom/validate-config';
import type { CustomImporterConfig } from '$lib/types';

const valid = (): CustomImporterConfig => ({
  schemaVersion: 1,
  id: 'abc',
  name: 'My Exchange',
  header: { mode: 'skip', rows: 1 },
  requiredColumns: ['Date', 'Type', 'Asset', 'Amount'],
  delimiter: ';',
  decimalSeparator: ',',
  dateFormats: ['DD.MM.YYYY HH:mm'],
  timezone: 'local',
  columns: { date: 'Date', type: 'Type', asset: 'Asset', amount: 'Amount', total: 'Total' },
  type: { mode: 'column', rules: [{ match: 'equals', value: 'Buy', kind: 'buy' }] },
  quoteCurrency: { mode: 'fixed', value: 'EUR' },
  preprocessors: [],
});

describe('validateConfig', () => {
  it('accepts a valid config', () => {
    expect(validateConfig(valid(), [])).toEqual([]);
  });

  it('requires a name', () => {
    expect(validateConfig({ ...valid(), name: '  ' }, [])).toContain('Name is required');
  });

  it('rejects a name already in use, case-insensitively', () => {
    expect(validateConfig(valid(), ['my exchange'])).toContain('An importer named "My Exchange" already exists');
  });

  it('requires the date, asset and amount columns', () => {
    const errors = validateConfig({ ...valid(), columns: { ...valid().columns, date: '', asset: '', amount: '' } }, []);
    expect(errors).toEqual(expect.arrayContaining([
      'Date column is required', 'Asset column is required', 'Amount column is required',
    ]));
  });

  it('requires the core columns to be among the required columns', () => {
    const errors = validateConfig({ ...valid(), requiredColumns: ['Date', 'Type', 'Asset'] }, []);
    expect(errors).toContain('Amount column "Amount" must be a required column');
  });

  it('requires at least one required column', () => {
    expect(validateConfig({ ...valid(), requiredColumns: [] }, [])).toContain('At least one required column is needed for detection');
  });

  it('rejects a negative or fractional skip count', () => {
    expect(validateConfig({ ...valid(), header: { mode: 'skip', rows: -1 } }, [])).toContain('Rows to skip must be a whole number ≥ 0');
    expect(validateConfig({ ...valid(), header: { mode: 'skip', rows: 1.5 } }, [])).toContain('Rows to skip must be a whole number ≥ 0');
  });

  it('requires at least one known date format', () => {
    expect(validateConfig({ ...valid(), dateFormats: [] }, [])).toContain('Pick at least one date format');
  });

  it('requires a type column and rule values in column mode', () => {
    const errors = validateConfig({
      ...valid(),
      columns: { ...valid().columns, type: undefined },
      type: { mode: 'column', rules: [{ match: 'equals', value: '', kind: 'buy' }] },
    }, []);
    expect(errors).toEqual(expect.arrayContaining(['Type column is required when the type comes from a column', 'Type rule 1 needs a value']));
  });

  it('requires a rule or a fallback in column mode', () => {
    expect(validateConfig({ ...valid(), type: { mode: 'column', rules: [] } }, []))
      .toContain('Add at least one type rule or a fallback');
  });

  it('requires a quote currency when a price or total column is mapped', () => {
    expect(validateConfig({ ...valid(), quoteCurrency: undefined }, [])).toContain('A quote currency is required when a price or total column is mapped');
  });

  it('rejects a blank fixed currency', () => {
    expect(validateConfig({ ...valid(), quoteCurrency: { mode: 'fixed', value: ' ' } }, [])).toContain('Quote currency value is required');
  });

  it('rejects unknown preprocessors', () => {
    expect(validateConfig({ ...valid(), preprocessors: ['nope'] }, [])).toContain('Unknown preprocessor "nope"');
  });

  it('rejects an unsupported schema version', () => {
    expect(validateConfig({ ...valid(), schemaVersion: 2 as unknown as 1 }, [])).toContain('Unsupported schema version 2');
  });
});
