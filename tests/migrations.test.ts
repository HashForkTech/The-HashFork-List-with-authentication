import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '@/lib/db/schema';
import { sqliteStore } from '@/lib/db/store';
import { createItem, getItem } from '@/lib/db/repositories/items';

describe('GitHub stars migration', () => {
  it('preserves resources and existing admin authentication when upgrading SQLite', async () => {
    const db = new Database(':memory:');
    try {
      for (const migration of MIGRATIONS.filter((entry) => entry.version <= 6)) {
        db.exec(migration.sql);
        db.pragma(`user_version = ${migration.version}`);
      }
      db.prepare('INSERT INTO items (id, name, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('legacy', 'Existing resource', 5, '2026-01-01', '2026-01-01');
      db.prepare('INSERT INTO admin_auth (id, password_hash, created_at) VALUES (1, ?, ?)')
        .run('existing-verifier', 1);
      migrate(db);
      migrate(db);
      const store = sqliteStore(db);
      expect(await getItem(store, 'legacy')).toMatchObject({ name: 'Existing resource', githubStars: null });
      expect(db.prepare('SELECT password_hash FROM admin_auth').get()).toEqual({ password_hash: 'existing-verifier' });
      expect((await createItem(store, { githubStars: 123456 })).githubStars).toBe(123456);
    } finally {
      db.close();
    }
  });
});
