import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStore, postgresConnectionOptions, postgresPlaceholders, sqliteStore } from '@/lib/db/store';
import { migrate } from '@/lib/db/schema';
import { createCategory, deleteCategory, listCategories } from '@/lib/db/repositories/categories';
import { createItem, getItem } from '@/lib/db/repositories/items';
import { exportData, importData, toParsedBackup } from '@/lib/services/backup';

const databases: Database.Database[] = [];
function memoryStore() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  databases.push(db);
  return sqliteStore(db);
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  vi.unstubAllEnvs();
});

describe('async storage adapter', () => {
  it('keeps ordinary reads and writes outside an awaited transaction', async () => {
    const store = memoryStore();
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const transaction = store.transaction(async (tx) => {
      await tx.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['probe', 'uncommitted']);
      enter();
      await gate;
      throw new Error('rollback');
    });
    // Attach the rejection handler before deliberately triggering rollback.
    const failure = expect(transaction).rejects.toThrow('rollback');
    await entered;
    let completed = false;
    const outside = store.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['probe'])
      .then((result) => { completed = true; return result; });
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    await failure;
    expect(await outside).toBeUndefined();
    expect(await store.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['probe', 'committed'])).toBe(1);
  });

  it('rolls back a replacement import when a later item cannot be inserted', async () => {
    const store = memoryStore();
    await createItem(store, { name: 'preserved' }, 'original');
    const imported = toParsedBackup({ categories: [], items: [{ id: 'new', name: 'new' }] });
    // A failure after replacement deletes its original rows must restore them.
    const invalid = { ...imported, items: [{ ...imported.items[0], createdAt: null as unknown as string }] };
    await expect(importData(store, invalid, 'replace')).rejects.toThrow();
    expect((await getItem(store, 'original'))?.name).toBe('preserved');
    expect(await getItem(store, 'new')).toBeNull();
  });

  it('skips duplicate IDs without interrupting the rest of a merge', async () => {
    const store = memoryStore();
    await createCategory(store, 'original', 'category');
    await createItem(store, { name: 'original', categoryId: 'category' }, 'duplicate');
    const parsed = toParsedBackup({
      categories: [{ id: 'category', name: 'replacement' }],
      items: [{ id: 'duplicate', name: 'replacement' }, { id: 'fresh', name: 'fresh', categoryId: 'missing' }],
    });
    const summary = await importData(store, parsed, 'merge');
    expect(summary.categories).toEqual({ created: 0, skipped: 1 });
    expect(summary.items).toEqual({ created: 1, skipped: 1, unclassified: 1 });
    expect((await getItem(store, 'duplicate'))?.name).toBe('original');
    const backup = await exportData(store);
    expect(backup.items).toHaveLength(2);
    expect(Object.keys(backup).sort()).toEqual(['categories', 'exportedAt', 'format', 'items', 'version']);
  });

  it('keeps resources when deleting their category and reports the affected count', async () => {
    const store = memoryStore();
    const category = await createCategory(store, 'category');
    await createItem(store, { categoryId: category.id, name: 'kept' }, 'item');
    expect((await listCategories(store))[0].itemCount).toBe(1);
    expect(await deleteCategory(store, category.id)).toEqual({ deleted: true, detachedItems: 1 });
    expect((await getItem(store, 'item'))?.categoryId).toBeNull();
  });
});

describe('Supabase deployment configuration', () => {
  it('does not replace literal question marks or quoted SQL when numbering parameters', () => {
    expect(postgresPlaceholders(`SELECT ?, '?' AS literal, "?" AS identifier, $$?$$ AS dollar -- ?\n WHERE id = ? /* ? */`))
      .toBe(`SELECT $1, '?' AS literal, "?" AS identifier, $$?$$ AS dollar -- ?\n WHERE id = $2 /* ? */`);
  });

  it('fails closed when Vercel is configured with ephemeral SQLite', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('DATABASE_PROVIDER', 'sqlite');
    expect(() => getStore()).toThrow('Vercel requires DATABASE_PROVIDER=supabase');
  });

  it('rejects missing database connections and unknown provider values', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('DATABASE_PROVIDER', 'supabase');
    vi.stubEnv('DATABASE_URL', '');
    expect(() => getStore()).toThrow('DATABASE_URL is required');
    vi.stubEnv('DATABASE_PROVIDER', 'unknown');
    expect(() => getStore()).toThrow('DATABASE_PROVIDER must be');
  });

  it('keeps Supabase transaction-pooler queries unnamed and prevents SSL URL overrides', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_SSL', 'true');
    const options = postgresConnectionOptions('postgresql://example:example@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=no-verify&sslcert=bad&sslrootcert=bad&options=-c%20search_path%3Dtest');
    const url = new URL(options.connectionString!);
    expect(url.port).toBe('6543');
    expect(url.searchParams.has('sslmode')).toBe(false);
    expect(url.searchParams.has('sslcert')).toBe(false);
    expect(url.searchParams.has('sslrootcert')).toBe(false);
    expect(url.searchParams.get('options')).toBe('-c search_path=test');
    expect(options.ssl).toMatchObject({ rejectUnauthorized: true });
    expect(options.max).toBe(1);
  });

  it('requires encrypted production connections', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_PROVIDER', 'supabase');
    vi.stubEnv('DATABASE_URL', 'postgresql://example:example@localhost/database');
    vi.stubEnv('DATABASE_SSL', 'false');
    expect(() => getStore()).toThrow('TLS cannot be disabled');
  });
});
