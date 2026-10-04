import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from './schema';

export type DB = Database.Database;

const DEFAULT_DATABASE_FILE = 'hashfork.sqlite';

/**
 * Persistent data directory.
 *
 * Defaults to `<cwd>/data` and can be overridden with DATA_DIR. In production
 * this MUST live on a persistent volume (see README → Deployment).
 */
export function getDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  const dir = configured ? path.resolve(configured) : path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  return dir;
}

export function getDatabasePath(): string {
  const file = process.env.DATABASE_FILE?.trim() || DEFAULT_DATABASE_FILE;
  return path.join(getDataDir(), file);
}

/** Opens (and migrates) a SQLite database at the given path. */
export function openDatabase(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

const globalStore = globalThis as typeof globalThis & { __hashforkDb?: DB };

/**
 * Process-wide database handle. Kept on globalThis so Next.js dev-mode hot
 * reloads reuse one connection instead of leaking one per reload.
 */
export function getDb(): DB {
  if (!globalStore.__hashforkDb) {
    globalStore.__hashforkDb = openDatabase(getDatabasePath());
  }
  return globalStore.__hashforkDb;
}

export function closeDb(): void {
  if (globalStore.__hashforkDb) {
    globalStore.__hashforkDb.close();
    delete globalStore.__hashforkDb;
  }
}
