import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/auth/[action]/route';
import { POST as itemPost } from '@/app/api/items/route';
import { GET as exportGet } from '@/app/api/export/route';
import { getDb } from '@/lib/db/client';
import { getStore } from '@/lib/db/store';
import { decryptSecret, digest, newToken, recoveryDigest } from '@/lib/auth/crypto';
import { TOTP } from 'otpauth';
import { apiRequest, readJson, setupTestDatabase, TEST_PASSWORD } from './helpers';

setupTestDatabase(false);
afterEach(() => vi.restoreAllMocks());
const context = (action: string) => ({ params: Promise.resolve({ action }) });
const setupSecret = 'test-owner-setup-secret-with-more-than-32-characters';
async function post(action: string, body: unknown, token?: string) {
  return POST(apiRequest(`/api/auth/${action}`, { method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }), context(action));
}
async function get(action: string, token?: string) {
  return GET(apiRequest(`/api/auth/${action}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }), context(action));
}
async function setup() {
  const res = await post('setup', { setupToken: setupSecret, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return await res.json() as { token: string; expiresAt: string };
}
async function enroll(token: string) {
  const res = await post('enroll', { password: TEST_PASSWORD }, token);
  expect(res.status).toBe(200);
  const body = await res.json() as { secret: string; uri: string };
  const code = new TOTP({ secret: body.secret }).generate();
  const confirm = await post('confirm', { code }, token);
  expect(confirm.status).toBe(200);
  return { ...body, ...await confirm.json() as { token: string; recoveryCodes: string[] } };
}
async function loginChallenge() {
  const res = await post('login', { password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  const body = await res.json() as { mfaRequired: boolean; challenge: string; token?: string };
  expect(body.mfaRequired).toBe(true);
  expect(body.token).toBeUndefined();
  return body.challenge;
}
async function mutate(token?: string) {
  return itemPost(apiRequest('/api/items', { method: 'POST', body: { name: 'Secured' }, headers: token ? { authorization: `Bearer ${token}` } : {} }));
}

describe('first admin setup', () => {
  it('requires owner setup secret and a strong password', async () => {
    expect((await get('status')).status).toBe(200);
    expect(await (await get('status')).json()).toEqual({ initialized: false, setupAvailable: true });
    expect((await post('setup', { setupToken: 'wrong', password: TEST_PASSWORD })).status).toBe(403);
    expect((await post('setup', { setupToken: setupSecret, password: 'short' })).status).toBe(422);
    expect(getDb().prepare('SELECT * FROM admin_auth').get()).toBeUndefined();
  });
  it('refuses setup without configured secret/key', async () => {
    process.env.ADMIN_SETUP_TOKEN = '';
    expect((await post('setup', { setupToken: setupSecret, password: TEST_PASSWORD })).status).toBe(503);
    process.env.ADMIN_SETUP_TOKEN = setupSecret;
    process.env.AUTH_ENCRYPTION_KEY = '';
    expect((await post('setup', { setupToken: setupSecret, password: TEST_PASSWORD })).status).toBe(503);
    expect(getDb().prepare('SELECT * FROM admin_auth').get()).toBeUndefined();
  });
  it('creates exactly one admin under concurrent requests', async () => {
    const attempts = await Promise.all([post('setup', { setupToken: setupSecret, password: TEST_PASSWORD }), post('setup', { setupToken: setupSecret, password: 'another-owner-password' })]);
    expect(attempts.map((res) => res.status).sort()).toEqual([200, 409]);
    const row = getDb().prepare('SELECT * FROM admin_auth').get() as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain(TEST_PASSWORD);
    expect(getDb().prepare('SELECT COUNT(*) n FROM admin_auth').get()).toEqual({ n: 1 });
  });
  it('never reopens setup and persists initialization across connections', async () => {
    await setup();
    expect((await post('setup', { setupToken: setupSecret, password: 'replace-the-password' })).status).toBe(409);
    expect(await (await get('status')).json()).toEqual({ initialized: true, setupAvailable: false });
    const { closeDb } = await import('@/lib/db/client');
    closeDb();
    expect(await (await get('status')).json()).toEqual({ initialized: true, setupAvailable: false });
  });
});

describe('cookie-free sessions', () => {
  it('does not let anonymous callers exhaust authenticated security-operation limits', async () => {
    const session = await setup();
    process.env.TRUST_PROXY = 'false';
    for (let i = 0; i < 12; i++) {
      expect((await post('logout', {})).status).toBe(401);
      expect((await post('enroll', { password: 'wrong' })).status).toBe(401);
    }
    expect((await post('enroll', { password: TEST_PASSWORD }, session.token)).status).toBe(200);
    expect((await post('logout', {}, session.token)).status).toBe(200);
    expect((await mutate(session.token)).status).toBe(401);
  });
  it('protects mutations and export while preserving valid bearer access', async () => {
    expect((await mutate()).status).toBe(401);
    const session = await setup();
    expect((await mutate(session.token)).status).toBe(201);
    expect((await mutate(newToken())).status).toBe(401);
    expect((await exportGet(apiRequest('/api/export', { headers: { cookie: `session=${session.token}` } }))).status).toBe(401);
    const response = await exportGet(apiRequest('/api/export', { headers: { authorization: `Bearer ${session.token}` } }));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/password_hash|totp_secret|auth_sessions/);
  });
  it('sets no cookies, retains token hashes only and revokes logout', async () => {
    const created = await post('setup', { setupToken: setupSecret, password: TEST_PASSWORD });
    const session = await created.json() as { token: string };
    expect(created.headers.has('set-cookie')).toBe(false);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const row = getDb().prepare('SELECT * FROM auth_sessions').get() as { token_hash: string };
    expect(row.token_hash).toBe(digest(session.token));
    expect(JSON.stringify(row)).not.toContain(session.token);
    const logout = await post('logout', {}, session.token);
    expect(logout.status).toBe(200);
    expect(logout.headers.has('set-cookie')).toBe(false);
    expect((await mutate(session.token)).status).toBe(401);
  });
  it('expires sessions and rejects malformed bearer values', async () => {
    const session = await setup();
    await getStore().run('UPDATE auth_sessions SET expires_at = 0');
    expect((await get('security', session.token)).status).toBe(401);
    expect((await mutate('not-a-token')).status).toBe(401);
  });
  it('logs in only with the correct password and rotates after password change', async () => {
    const original = await setup();
    expect((await post('login', { password: 'invalid-password' })).status).toBe(403);
    const login = await post('login', { password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    const other = await login.json() as { token: string };
    expect((await post('password', { password: 'wrong', newPassword: 'a-new-strong-password' }, original.token)).status).toBe(403);
    const change = await post('password', { password: TEST_PASSWORD, newPassword: 'a-new-strong-password' }, original.token);
    expect(change.status).toBe(200);
    const replacement = await change.json() as { token: string };
    expect((await mutate(original.token)).status).toBe(401);
    expect((await mutate(other.token)).status).toBe(401);
    expect((await mutate(replacement.token)).status).toBe(201);
    expect((await post('login', { password: TEST_PASSWORD })).status).toBe(403);
    expect((await post('login', { password: 'a-new-strong-password' })).status).toBe(200);
  });
  it('requires HTTPS in production and trusts proxy scheme only when configured', async () => {
    const session = await setup();
    vi.stubEnv('NODE_ENV', 'production');
    process.env.TRUST_PROXY = 'false';
    expect((await get('security', session.token)).status).toBe(426);
    const forged = apiRequest('/api/auth/security', { headers: { authorization: `Bearer ${session.token}`, 'x-forwarded-proto': 'https' } });
    expect((await GET(forged, context('security'))).status).toBe(426);
    const nextDerivedUrl = new Request('https://localhost:3000/api/auth/security', { headers: forged.headers });
    expect((await GET(nextDerivedUrl, context('security'))).status).toBe(426);
    process.env.TRUST_PROXY = 'true';
    expect((await GET(forged, context('security'))).status).toBe(200);
    vi.unstubAllEnvs();
  });
  it('bounds login attempts in durable storage', async () => {
    await setup();
    for (let i = 0; i < 10; i++) expect((await post('login', { password: 'incorrect-password' })).status).toBe(403);
    const response = await post('login', { password: TEST_PASSWORD });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('300');
    const { closeDb } = await import('@/lib/db/client');
    closeDb();
    expect((await post('login', { password: TEST_PASSWORD })).status).toBe(429);
  });
});

describe('optional two-factor authentication', () => {
  it('requires confirmation, encrypts secret and hashes recovery codes', async () => {
    const session = await setup();
    const mfa = await enroll(session.token);
    const row = getDb().prepare('SELECT * FROM admin_auth').get() as { totp_secret: string; recovery_codes: string };
    expect(row.totp_secret).not.toContain(mfa.secret);
    expect(decryptSecret(row.totp_secret)).toBe(mfa.secret);
    expect(row.recovery_codes).not.toContain(mfa.recoveryCodes[0]);
    expect(JSON.parse(row.recovery_codes)).toContain(recoveryDigest(mfa.recoveryCodes[0]));
    expect((await get('security', session.token)).status).toBe(401);
    expect(await (await get('security', mfa.token)).json()).toMatchObject({ mfaEnabled: true });
  });
  it('scopes pending enrollment to its initiating session and expires it', async () => {
    const session = await setup();
    const enrollment = await post('enroll', { password: TEST_PASSWORD }, session.token);
    const { secret } = await enrollment.json() as { secret: string };
    const other = await (await post('login', { password: TEST_PASSWORD })).json() as { token: string };
    expect((await post('confirm', { code: new TOTP({ secret }).generate() }, other.token)).status).toBe(409);
    await getStore().run('UPDATE admin_auth SET pending_expires = 0');
    expect((await post('confirm', { code: new TOTP({ secret }).generate() }, session.token)).status).toBe(409);
    expect(await (await get('security', session.token)).json()).toMatchObject({ mfaEnabled: false });
  });
  it('requires 2FA at login, rejects replay, and challenges cannot access admin APIs', async () => {
    const mfa = await enroll((await setup()).token);
    const challenge = await loginChallenge();
    expect((await mutate(challenge)).status).toBe(401);
    expect((await post('verify', { challenge, code: '000000' })).status).toBe(403);
    const nextTime = Date.now() + 30000;
    vi.spyOn(Date, 'now').mockReturnValue(nextTime);
    const code = new TOTP({ secret: mfa.secret }).generate({ timestamp: nextTime });
    const response = await post('verify', { challenge, code });
    expect(response.status).toBe(200);
    const { token } = await response.json() as { token: string };
    expect((await mutate(token)).status).toBe(201);
    expect((await post('verify', { challenge, code })).status).toBe(403);
    const second = await loginChallenge();
    expect((await post('verify', { challenge: second, code })).status).toBe(403);
  });
  it('consumes recovery codes exactly once under concurrent verification', async () => {
    const mfa = await enroll((await setup()).token);
    const a = await loginChallenge();
    const b = await loginChallenge();
    const results = await Promise.all([post('verify', { challenge: a, code: mfa.recoveryCodes[0] }), post('verify', { challenge: b, code: mfa.recoveryCodes[0] })]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 403]);
  });
  it('requires fresh password and factor to disable MFA or change password', async () => {
    const mfa = await enroll((await setup()).token);
    expect((await post('password', { password: TEST_PASSWORD, newPassword: 'new-password-for-admin' }, mfa.token)).status).toBe(403);
    expect((await post('disable', { password: 'wrong-password', code: mfa.recoveryCodes[0] }, mfa.token)).status).toBe(403);
    const response = await post('disable', { password: TEST_PASSWORD, code: mfa.recoveryCodes[0] }, mfa.token);
    expect(response.status).toBe(200);
    const replacement = await response.json() as { token: string };
    expect((await get('security', mfa.token)).status).toBe(401);
    expect(await (await get('security', replacement.token)).json()).toMatchObject({ mfaEnabled: false });
    expect(await (await post('login', { password: TEST_PASSWORD })).json()).toHaveProperty('token');
  });
  it('regenerates recovery codes and invalidates the old set and sessions', async () => {
    const mfa = await enroll((await setup()).token);
    const response = await post('recovery', { password: TEST_PASSWORD, code: mfa.recoveryCodes[0] }, mfa.token);
    expect(response.status).toBe(200);
    const replacement = await response.json() as { token: string; recoveryCodes: string[] };
    expect(replacement.recoveryCodes).toHaveLength(10);
    expect((await get('security', mfa.token)).status).toBe(401);
    const challenge = await loginChallenge();
    expect((await post('verify', { challenge, code: mfa.recoveryCodes[1] })).status).toBe(403);
    expect((await post('verify', { challenge, code: replacement.recoveryCodes[0] })).status).toBe(200);
  });
});

describe('auth input and secret safety', () => {
  it('rejects cross-origin and oversized or unexpected fields before auth', async () => {
    const request = apiRequest('/api/auth/setup', { method: 'POST', body: { setupToken: setupSecret, password: TEST_PASSWORD }, headers: { origin: 'https://evil.example' } });
    expect((await POST(request, context('setup'))).status).toBe(403);
    expect((await post('setup', { setupToken: setupSecret, password: TEST_PASSWORD, admin: true })).status).toBe(422);
    expect((await post('login', { password: 'a'.repeat(10000) })).status).toBe(400);
  });
  it('never logs password, setup token, MFA secret or bearer material', async () => {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    const session = await setup();
    const mfa = await enroll(session.token);
    process.env.AUTH_ENCRYPTION_KEY = '';
    await post('verify', { challenge: await loginChallenge(), code: '123456' });
    const logged = JSON.stringify([...log.mock.calls, ...error.mock.calls]);
    for (const secret of [TEST_PASSWORD, setupSecret, session.token, mfa.secret, mfa.recoveryCodes[0]]) expect(logged).not.toContain(secret);
  });
  it('counts body size in UTF-8 bytes', async () => {
    const { readJsonBody } = await import('@/lib/http/api');
    const request = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ text: 'é'.repeat(20) }) });
    expect(await readJsonBody(request, 35)).toEqual({ ok: false, reason: 'too_large' });
  });
});
