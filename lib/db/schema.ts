import type { DB } from './client';

/**
 * Schema migrations.
 *
 * Each entry runs exactly once, inside a transaction, and bumps the SQLite
 * `user_version` pragma. Adding a new migration = appending a new entry with
 * an incremented version number; existing databases upgrade on next open.
 */

type Migration = {
  version: number;
  sql: string;
};

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS admin (
        id           INTEGER PRIMARY KEY CHECK (id = 1),
        password_hash TEXT   NOT NULL,
        created_at   TEXT   NOT NULL,
        updated_at   TEXT   NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id              TEXT PRIMARY KEY,
        category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
        name            TEXT,
        description     TEXT,
        github_url      TEXT,
        website_url     TEXT,
        huggingface_url TEXT,
        youtube_url     TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS items_created_at_idx ON items (created_at DESC);
      CREATE INDEX IF NOT EXISTS items_category_idx   ON items (category_id);

      CREATE TABLE IF NOT EXISTS sessions (
        id           TEXT PRIMARY KEY,
        admin_id     INTEGER NOT NULL REFERENCES admin(id) ON DELETE CASCADE,
        expires_at   TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        last_seen_at TEXT
      );

      CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

      CREATE TABLE IF NOT EXISTS rate_limits (
        key        TEXT PRIMARY KEY,
        hits       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    // Admin authentication was removed from this build (no accounts, no
    // sessions, no login rate limiting). The auth tables are dropped on
    // upgrade; fresh databases are created by v1 and cleaned up here.
    version: 2,
    sql: `
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS rate_limits;
      DROP TABLE IF EXISTS admin;
    `,
  },
  {
    // Per-resource review metadata: "Tested" flag, 0–5 star rating
    // (0 = not rated) and an optional admin comment.
    version: 3,
    sql: `
      ALTER TABLE items ADD COLUMN tested  INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE items ADD COLUMN rating  INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE items ADD COLUMN comment TEXT;
    `,
  },
  {
    // Date of the "Tested" check: stamped automatically when the admin checks
    // the "Tested" checkbox (cleared again when it is unchecked). Rows that
    // were already marked tested have no recorded check date — backfill with
    // their last update date so "Tested on …" is never empty for them.
    version: 4,
    sql: `
      ALTER TABLE items ADD COLUMN tested_at TEXT;
      UPDATE items SET tested_at = updated_at WHERE tested = 1;
    `,
  },
  {
    // Site settings as key/value pairs (e.g. the customizable main page title).
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

export function migrate(db: DB): void {
  const current = Number(db.pragma('user_version', { simple: true }) ?? 0);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    });
    run();
  }
}
