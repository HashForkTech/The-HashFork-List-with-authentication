import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { digest, hashPassword, newToken } from '@/lib/auth/crypto';
import { closeDb, getDb } from '@/lib/db/client';

export const TEST_PASSWORD = 'a-long-test-password-only';
let testToken = '';
let encodedPassword: Promise<string> | undefined;
export const BASE_URL = 'http://localhost:3000';

/** Installs a fresh, isolated SQLite database before every test. */
export function setupTestDatabase(authenticated = true): void {
  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashfork-test-'));
    process.env.DATA_DIR = dir;
    process.env.APP_URL = BASE_URL;
    process.env.TRUST_PROXY = 'true';
    process.env.DATABASE_PROVIDER = 'sqlite';
    process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    process.env.ADMIN_SETUP_TOKEN = 'test-owner-setup-secret-with-more-than-32-characters';
    process.env.AUTH_SESSION_MINUTES = '60';
    closeDb();
    testToken = '';
    if (authenticated) {
      encodedPassword ??= hashPassword(TEST_PASSWORD);
      const db = getDb();
      db.prepare('INSERT INTO admin_auth (id, password_hash, created_at) VALUES (1, ?, ?)').run(await encodedPassword, Date.now());
      testToken = newToken();
      db.prepare('INSERT INTO auth_sessions (token_hash, kind, version, mfa, expires_at, created_at) VALUES (?, ?, 1, 0, ?, ?)').run(digest(testToken), 'session', Date.now() + 3600000, Date.now());
    }
  });

  afterEach(() => {
    const dir = process.env.DATA_DIR;
    closeDb();
    if (dir && path.basename(dir).startsWith('hashfork-test-')) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  omitMutationHeader?: boolean;
  omitAuthorization?: boolean;
};

/** Builds a Request the way the admin UI would (same-origin, custom header). */
export function apiRequest(pathname: string, options: RequestOptions = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: BASE_URL,
    ...(!options.omitAuthorization && testToken ? { authorization: 'Bearer ' + testToken } : {}),
    ...(options.omitMutationHeader ? {} : { 'x-requested-with': 'hashfork-admin' }),
    ...(options.headers ?? {}),
  };

  let body: string | undefined;
  if (options.rawBody !== undefined) body = options.rawBody;
  else if (options.body !== undefined) body = JSON.stringify(options.body);

  return new Request(`${BASE_URL}${pathname}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Route context for dynamic `[id]` API routes (Next.js passes params). */
export function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
