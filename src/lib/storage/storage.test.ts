import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDBStorage } from './storage';

describe('createIndexedDBStorage', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });

  it('returns null for a missing key', async () => {
    const storage = createIndexedDBStorage();
    expect(await storage.get('missing')).toBeNull();
  });

  it('round-trips a set value', async () => {
    const storage = createIndexedDBStorage();
    await storage.set('foo', 'bar');
    expect(await storage.get('foo')).toBe('bar');
  });

  it('overwrites an existing value', async () => {
    const storage = createIndexedDBStorage();
    await storage.set('foo', 'bar');
    await storage.set('foo', 'baz');
    expect(await storage.get('foo')).toBe('baz');
  });

  it('removes a value', async () => {
    const storage = createIndexedDBStorage();
    await storage.set('foo', 'bar');
    await storage.remove('foo');
    expect(await storage.get('foo')).toBeNull();
  });

  it('resolves concurrent reads against a single lazily-opened connection', async () => {
    const storage = createIndexedDBStorage();
    await storage.set('a', '1');
    await storage.set('b', '2');

    const [a, b] = await Promise.all([storage.get('a'), storage.get('b')]);
    expect(a).toBe('1');
    expect(b).toBe('2');
  });
});
