import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { logger } from '../logger';
import { getDb, type DB } from './client';

export interface Store {
  readonly dialect: 'sqlite' | 'postgres';
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<number>;
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
}

/** Convert placeholders without changing quoted text, comments or dollar strings. */
export function postgresPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$|\?/g,
    (part) => part === '?' ? '$' + (++index) : part,
  );
}

const sqliteStores = new WeakMap<DB, Store>();

/**
 * Every root operation shares one queue, so other requests cannot execute
 * inside an async SQLite transaction. Its child adapter bypasses the queue.
 */
export function sqliteStore(db: DB): Store {
  const existing = sqliteStores.get(db);
  if (existing) return existing;
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const result = tail.then(fn);
    tail = result.catch(() => undefined);
    return result;
  };

  const direct: Store = {
    dialect: 'sqlite',
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []): Promise<number> {
      return db.prepare(sql).run(...params).changes;
    },
    async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
      return fn(direct);
    },
  };

  const root: Store = {
    dialect: 'sqlite',
    all: <T>(sql: string, params?: unknown[]) => exclusive(() => direct.all<T>(sql, params)),
    get: <T>(sql: string, params?: unknown[]) => exclusive(() => direct.get<T>(sql, params)),
    run: (sql: string, params?: unknown[]) => exclusive(() => direct.run(sql, params)),
    transaction: <T>(fn: (tx: Store) => Promise<T>) => exclusive(async () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(direct);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }),
  };
  sqliteStores.set(db, root);
  return root;
}

function postgresStore(client: Pool | PoolClient, pool?: Pool): Store {
  return {
    dialect: 'postgres',
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await client.query(postgresPlaceholders(sql), params);
      return result.rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return (await this.all<T>(sql, params))[0];
    },
    async run(sql: string, params: unknown[] = []): Promise<number> {
      const result = await client.query(postgresPlaceholders(sql), params);
      return result.rowCount ?? 0;
    },
    async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
      if (pool) {
        // A checked-out client keeps every statement on the same connection.
        // Other Pool queries wait until commit/rollback and release.
        const reserved = await pool.connect();
        try {
          await reserved.query('BEGIN');
          try {
            const result = await fn(postgresStore(reserved));
            await reserved.query('COMMIT');
            return result;
          } catch (error) {
            await reserved.query('ROLLBACK');
            throw error;
          }
        } finally { reserved.release(); }
      }
      const savepoint = 'hashfork_sp_' + randomUUID().replace(/-/g, '');
      await client.query('SAVEPOINT ' + savepoint);
      try {
        const result = await fn(postgresStore(client));
        await client.query('RELEASE SAVEPOINT ' + savepoint);
        return result;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT ' + savepoint);
        await client.query('RELEASE SAVEPOINT ' + savepoint);
        throw error;
      }
    },
  };
}

/** Prevent connection-string SSL options from weakening verified production TLS. */
export function postgresConnectionOptions(url: string): PoolConfig {
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error('DATABASE_URL is not a valid PostgreSQL connection string.'); }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
  }
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (key.toLowerCase().startsWith('ssl')) parsed.searchParams.delete(key);
  }
  const tlsRequired = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (tlsRequired && process.env.DATABASE_SSL === 'false') {
    throw new Error('TLS cannot be disabled for a production Supabase connection.');
  }
  const caFile = process.env.DATABASE_CA_CERT?.trim();
  return {
    connectionString: parsed.toString(),
    max: 1,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.DATABASE_SSL === 'false' ? false : {
      rejectUnauthorized: true,
      ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}),
    },
  };
}

const globalStore = globalThis as typeof globalThis & {
  __hashforkPg?: { url: string; client: Pool; store: Store };
};

export function getStore(): Store {
  const provider = process.env.DATABASE_PROVIDER?.trim() || 'sqlite';
  if (provider !== 'sqlite' && provider !== 'supabase') throw new Error('DATABASE_PROVIDER must be sqlite or supabase.');
  if (process.env.VERCEL && process.env.VERCEL !== '0' && provider !== 'supabase') {
    throw new Error('Vercel requires DATABASE_PROVIDER=supabase; SQLite is not persistent there.');
  }
  if (provider === 'sqlite') return sqliteStore(getDb());
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for the Supabase database provider.');
  const options = postgresConnectionOptions(url);
  const cached = globalStore.__hashforkPg;
  if (cached) {
    if (cached.url !== url) throw new Error('Restart the application after changing DATABASE_URL.');
    return cached.store;
  }
  const client = new Pool(options);
  // Idle-client errors are handled without printing connection credentials.
  client.on('error', () => logger.error('PostgreSQL connection unavailable'));
  const store = postgresStore(client, client);
  globalStore.__hashforkPg = { url, client, store };
  return store;
}

export async function closeStore(): Promise<void> {
  const cached = globalStore.__hashforkPg;
  if (cached) {
    delete globalStore.__hashforkPg;
    await cached.client.end();
  }
}
