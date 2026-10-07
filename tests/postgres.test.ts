import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeStore, getStore } from '@/lib/db/store';
import { createCategory, deleteCategory, listCategories } from '@/lib/db/repositories/categories';
import { createItem, getItem, updateItem } from '@/lib/db/repositories/items';
import { getSiteTitle, setSiteTitle } from '@/lib/db/repositories/settings';
import { exportData, importData, toParsedBackup } from '@/lib/services/backup';
import { authenticate, executeAuth, throttle } from '@/lib/auth/service';

// Opt-in only: use a disposable local database named hashfork_test.
// Tests create and remove their own unique schema, never application tables.
const testUrl = process.env.DATABASE_TEST_URL;
describe.skipIf(!testUrl)('PostgreSQL integration', () => {
  const schema = 'hashfork_test_' + randomUUID().replace(/-/g, '');
  let adminClient: Pool;
  const password = 'a-long-postgres-test-password';
  const setupToken = 'a-test-only-owner-setup-token-with-at-least-32-characters';
  function request(token?: string): Request {
    return new Request('http://localhost:3000/api/auth/login', {
      method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {},
    });
  }

  beforeAll(async () => {
    adminClient = new Pool({ connectionString: testUrl!, max: 1, ssl: false });
    const { rows: [database] } = await adminClient.query<{ name: string }>('SELECT current_database() AS name');
    if (database.name !== 'hashfork_test') throw new Error('Postgres tests require the disposable hashfork_test database.');
    await adminClient.query('CREATE SCHEMA ' + schema);
    const scopedUrl = new URL(testUrl!);
    scopedUrl.searchParams.set('options', '-c search_path=' + schema);
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('DATABASE_PROVIDER', 'supabase');
    vi.stubEnv('DATABASE_URL', scopedUrl.toString());
    vi.stubEnv('DATABASE_SSL', 'false');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AUTH_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    vi.stubEnv('ADMIN_SETUP_TOKEN', setupToken);
    vi.stubEnv('AUTH_SESSION_MINUTES', '60');
    vi.stubEnv('TRUST_PROXY', 'false');
    const initializer = new Pool({ connectionString: scopedUrl.toString(), max: 1, ssl: false });
    try {
      await initializer.query(fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202610050001_hashfork.sql'), 'utf8'));
    } finally { await initializer.end(); }
  });

  beforeEach(async () => {
    await getStore().transaction(async (tx) => {
      for (const table of ['items', 'categories', 'settings', 'auth_sessions', 'admin_auth', 'auth_rate_limits']) {
        await tx.run('DELETE FROM ' + table);
      }
    });
  });

  afterAll(async () => {
    await closeStore();
    if (adminClient) {
      try { await adminClient.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); }
      finally { await adminClient.end(); }
    }
    vi.unstubAllEnvs();
  });

  it('runs content CRUD and atomic backup restore with Postgres semantics', async () => {
    const store = getStore();
    expect(store.dialect).toBe('postgres');
    const category = await createCategory(store, 'models', 'category');
    await createItem(store, { categoryId: category.id, name: 'original', tested: true, rating: 4 }, 'item');
    expect((await listCategories(store))[0].itemCount).toBe(1);
    expect((await updateItem(store, 'item', { description: 'updated' }))?.name).toBe('original');
    await setSiteTitle(store, 'Postgres library');
    expect(await getSiteTitle(store)).toBe('Postgres library');
    const backup = await exportData(store);
    const merged = await importData(store, toParsedBackup(backup), 'merge');
    expect(merged.items).toEqual({ created: 0, skipped: 1, unclassified: 0 });
    const replacement = toParsedBackup({ categories: [], items: [{ id: 'new', name: 'replacement' }] });
    const invalid = { ...replacement, items: [{ ...replacement.items[0], createdAt: null as unknown as string }] };
    await expect(importData(store, invalid, 'replace')).rejects.toThrow();
    expect((await getItem(store, 'item'))?.name).toBe('original');
    expect(await deleteCategory(store, category.id)).toEqual({ deleted: true, detachedItems: 1 });
    expect((await getItem(store, 'item'))?.categoryId).toBeNull();
  });

  it('atomically allows only one first-login admin creation', async () => {
    const outcomes = await Promise.allSettled([
      executeAuth('setup', { setupToken, password }, request()),
      executeAuth('setup', { setupToken, password }, request()),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.status).toBe(409);
    const admin = await getStore().get<{ password_hash: string }>('SELECT password_hash FROM admin_auth');
    expect(admin?.password_hash).toMatch(/^\$argon2id\$/);
    expect(admin?.password_hash).not.toBe(password);
  });

  it('enforces optional MFA and consumes recovery codes using locked database rows', async () => {
    const initial = await executeAuth('setup', { setupToken, password }, request()) as { token: string };
    const enrolled = await executeAuth('enroll', { password }, request(initial.token)) as { secret: string };
    const totp = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(enrolled.secret) });
    const confirmed = await executeAuth('confirm', { code: totp.generate() }, request(initial.token)) as { token: string; recoveryCodes: string[] };
    await expect(authenticate(request(initial.token))).rejects.toMatchObject({ status: 401 });
    await authenticate(request(confirmed.token));
    const challenge = await executeAuth('login', { password }, request()) as { challenge: string; mfaRequired: boolean };
    expect(challenge.mfaRequired).toBe(true);
    await expect(authenticate(request(challenge.challenge))).rejects.toMatchObject({ status: 401 });
    const verified = await executeAuth('verify', { challenge: challenge.challenge, code: confirmed.recoveryCodes[0] }, request()) as { token: string };
    await authenticate(request(verified.token));
    const repeat = await executeAuth('login', { password }, request()) as { challenge: string };
    await expect(executeAuth('verify', { challenge: repeat.challenge, code: confirmed.recoveryCodes[0] }, request())).rejects.toMatchObject({ status: 403 });
    const persisted = await getStore().get<{ totp_secret: string; recovery_codes: string }>('SELECT totp_secret, recovery_codes FROM admin_auth');
    expect(persisted?.totp_secret).not.toContain(enrolled.secret);
    expect(persisted?.recovery_codes).not.toContain(confirmed.recoveryCodes[0]);
  });

  it('increments shared rate limits without lost updates under concurrent requests', async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => throttle(request(), 'concurrent')));
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(10);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(2);
    const row = await getStore().get<{ hits: number }>('SELECT hits FROM auth_rate_limits WHERE key = ?', ['concurrent:global']);
    expect(row?.hits).toBe(12);
  });

  it('denies Supabase anonymous and authenticated API roles access to every table', async () => {
    const { rows } = await adminClient.query<{ name: string; rls: boolean; anon_read: boolean; authenticated_write: boolean }>(`
      SELECT c.relname AS name, c.relrowsecurity AS rls,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_read,
        has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') AS authenticated_write
      FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = $1 AND c.relkind = 'r'
    `, [schema]);
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.rls).toBe(true);
      expect(row.anon_read).toBe(false);
      expect(row.authenticated_write).toBe(false);
    }
  });
});
