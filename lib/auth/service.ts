import { getStore, type Store } from '@/lib/db/store';
import { decryptSecret, digest, encryptSecret, encryptionKey, hashPassword, newToken, newTotp, recoveryCodes, recoveryDigest, secretEquals, totpStep, verifyPassword } from './crypto';

export class AuthError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Admin = {
  id: number; password_hash: string; totp_secret: string | null;
  pending_secret: string | null; pending_owner: string | null; pending_expires: number | string | null;
  last_step: number | string; recovery_codes: string; version: number; created_at: number | string;
};
type Session = { token_hash: string; kind: string; version: number; mfa: number; expires_at: number | string; created_at: number | string };
const fail = (status: number, code: string, message: string): never => { throw new AuthError(status, code, message); };
const unauthorized = (): never => fail(401, 'unauthorized', 'Please log in to continue.');

export function requireSecureTransport(req: Request): void {
  if (process.env.NODE_ENV !== 'production') return;
  // Next constructs Request URLs using forwarded headers before route handlers.
  // Never infer socket TLS from req.url. Production standalone needs a controlled
  // TLS terminator (Vercel/nginx) that overwrites the forwarded scheme.
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (process.env.TRUST_PROXY !== 'true' || forwarded !== 'https') {
    fail(426, 'https_required', 'Admin access requires a trusted HTTPS reverse proxy.');
  }
}

function bearer(req: Request): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.get('authorization') ?? '');
  return match?.[1] ?? null;
}
async function adminRow(store: Store, lock = false): Promise<Admin | undefined> {
  return store.get<Admin>('SELECT * FROM admin_auth WHERE id = 1' + (lock && store.dialect === 'postgres' ? ' FOR UPDATE' : ''));
}
async function validSession(store: Store, req: Request, admin: Admin | undefined): Promise<Session> {
  const token = bearer(req);
  if (!token || !admin) return unauthorized();
  const session = await store.get<Session>('SELECT * FROM auth_sessions WHERE token_hash = ?', [digest(token)]);
  if (!session || session.kind !== 'session' || Number(session.expires_at) <= Date.now() || session.version !== admin.version || (admin.totp_secret && session.mfa !== 1)) return unauthorized();
  return session;
}
export async function authenticate(req: Request): Promise<Session> {
  requireSecureTransport(req);
  const store = getStore();
  return validSession(store, req, await adminRow(store));
}
async function issueSession(store: Store, admin: Admin, kind: 'session' | 'challenge' = 'session') {
  const minutes = Number(process.env.AUTH_SESSION_MINUTES ?? '60');
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) throw new Error('Invalid session duration.');
  const token = newToken();
  const now = Date.now();
  const expires = now + (kind === 'challenge' ? 5 * 60_000 : minutes * 60_000);
  await store.run('DELETE FROM auth_sessions WHERE expires_at <= ?', [now]);
  await store.run('INSERT INTO auth_sessions (token_hash, kind, version, mfa, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [digest(token), kind, admin.version, kind === 'session' && admin.totp_secret ? 1 : 0, expires, now]);
  return kind === 'challenge' ? { mfaRequired: true, challenge: token } : { token, expiresAt: new Date(expires).toISOString() };
}
export async function authStatus() {
  const admin = await adminRow(getStore());
  return { initialized: !!admin, setupAvailable: !admin && (process.env.ADMIN_SETUP_TOKEN?.length ?? 0) >= 32 };
}
export async function securityStatus(req: Request) {
  requireSecureTransport(req);
  const store = getStore();
  return store.transaction(async (tx) => {
    const admin = await adminRow(tx, true);
    const session = await validSession(tx, req, admin);
    return { mfaEnabled: !!admin!.totp_secret, expiresAt: new Date(Number(session.expires_at)).toISOString() };
  });
}
/** Atomic, shared rate counters: no process-memory or serverless-instance dependency. */
export async function throttle(req: Request, action: string): Promise<void> {
  const store = getStore();
  const now = Date.now();
  const window = 5 * 60_000;
  const forwarded = process.env.TRUST_PROXY === 'true' ? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
  // Without an explicitly trusted proxy, use the shared bucket rather than trust attacker headers.
  const client = forwarded && forwarded.length < 100 ? forwarded : 'direct';
  await store.run('DELETE FROM auth_rate_limits WHERE window_start < ?', [now - 24 * 60 * 60_000]);
  const keys = [{ key: `${action}:global`, limit: 60 }, { key: `${action}:client:${digest(client)}`, limit: 10 }];
  for (const { key, limit } of keys) {
    const row = await store.get<{ hits: number; window_start: number | string }>(
      `INSERT INTO auth_rate_limits (key, window_start, hits) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         hits = CASE WHEN auth_rate_limits.window_start <= ? THEN 1 ELSE auth_rate_limits.hits + 1 END,
         window_start = CASE WHEN auth_rate_limits.window_start <= ? THEN excluded.window_start ELSE auth_rate_limits.window_start END
       RETURNING hits, window_start`, [key, now, now - window, now - window]);
    if (!row || row.hits > limit) fail(429, 'rate_limited', 'Too many attempts. Try again in five minutes.');
  }
}
async function consumeFactor(tx: Store, admin: Admin, code: string | undefined): Promise<void> {
  if (!admin.totp_secret) return;
  if (!code) fail(403, 'factor_required', 'Enter an authenticator code or recovery code.');
  const step = totpStep(decryptSecret(admin.totp_secret), code!);
  if (step !== null && step > Number(admin.last_step)) {
    await tx.run('UPDATE admin_auth SET last_step = ? WHERE id = 1', [step]);
    return;
  }
  const hashes: string[] = JSON.parse(admin.recovery_codes);
  const candidate = recoveryDigest(code!);
  const index = hashes.findIndex((value) => secretEquals(value, candidate));
  if (index >= 0) {
    hashes.splice(index, 1);
    await tx.run('UPDATE admin_auth SET recovery_codes = ? WHERE id = 1', [JSON.stringify(hashes)]);
    return;
  }
  fail(403, 'invalid_factor', 'Invalid or already used authentication code.');
}
async function reauthenticate(tx: Store, admin: Admin, body: Record<string, string>): Promise<void> {
  if (!await verifyPassword(admin.password_hash, body.password)) fail(403, 'invalid_credentials', 'The current password is incorrect.');
  await consumeFactor(tx, admin, body.code);
}
async function rotateSessions(tx: Store, admin: Admin) {
  await tx.run('UPDATE admin_auth SET version = version + 1, pending_secret = NULL, pending_owner = NULL, pending_expires = NULL WHERE id = 1');
  await tx.run('DELETE FROM auth_sessions');
  admin.version += 1;
  return issueSession(tx, admin);
}
async function authorized<T>(req: Request, fn: (tx: Store, admin: Admin, session: Session) => Promise<T>): Promise<T> {
  return getStore().transaction(async (tx) => {
    const admin = await adminRow(tx, true);
    const session = await validSession(tx, req, admin);
    return fn(tx, admin!, session);
  });
}
export async function executeAuth(action: string, body: Record<string, string>, req: Request): Promise<unknown> {
  requireSecureTransport(req);
  if (action === 'setup') {
    const configured = process.env.ADMIN_SETUP_TOKEN ?? '';
    if (configured.length < 32) fail(503, 'setup_unavailable', 'The owner must configure an admin setup secret.');
    if (!secretEquals(configured, body.setupToken)) fail(403, 'invalid_setup', 'Invalid setup secret.');
    encryptionKey(); // Fail before creating the admin if secure 2FA configuration is missing.
    const passwordHash = await hashPassword(body.password);
    return getStore().transaction(async (tx) => {
      const created = await tx.run('INSERT INTO admin_auth (id, password_hash, created_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING', [passwordHash, Date.now()]);
      if (!created) fail(409, 'already_initialized', 'Admin setup has already been completed.');
      return issueSession(tx, (await adminRow(tx))!);
    });
  }
  if (action === 'login') {
    const store = getStore();
    const admin = await adminRow(store);
    if (!admin) return fail(409, 'setup_required', 'Create the admin password first.');
    if (!await verifyPassword(admin.password_hash, body.password)) fail(403, 'invalid_credentials', 'The password is incorrect.');
    return store.transaction(async (tx) => {
      const current = (await adminRow(tx, true))!;
      if (current.version !== admin.version) fail(403, 'credentials_changed', 'Credentials changed. Please log in again.');
      return issueSession(tx, current, current.totp_secret ? 'challenge' : 'session');
    });
  }
  if (action === 'verify') {
    return getStore().transaction(async (tx) => {
      const admin = await adminRow(tx, true);
      const challenge = await tx.get<Session>('SELECT * FROM auth_sessions WHERE token_hash = ?', [digest(body.challenge)]);
      if (!admin?.totp_secret || !challenge || challenge.kind !== 'challenge' || challenge.version !== admin.version || Number(challenge.expires_at) <= Date.now()) fail(403, 'invalid_challenge', 'Login expired. Enter your password again.');
      await consumeFactor(tx, admin!, body.code);
      await tx.run('DELETE FROM auth_sessions WHERE token_hash = ?', [challenge!.token_hash]);
      return issueSession(tx, admin!);
    });
  }
  if (action === 'logout') {
    await authenticate(req);
    await getStore().run('DELETE FROM auth_sessions WHERE token_hash = ?', [digest(bearer(req)!)]);
    return { ok: true };
  }
  return authorized(req, async (tx, admin, session) => {
    if (action === 'enroll') {
      if (admin.totp_secret) fail(409, 'mfa_enabled', 'Two-factor authentication is already enabled.');
      await reauthenticate(tx, admin, body);
      const totp = newTotp();
      const secret = totp.secret.base32;
      await tx.run('UPDATE admin_auth SET pending_secret = ?, pending_owner = ?, pending_expires = ? WHERE id = 1', [encryptSecret(secret), session.token_hash, Date.now() + 10 * 60_000]);
      return { secret, uri: totp.toString() };
    }
    if (action === 'confirm') {
      if (admin.totp_secret || !admin.pending_secret || admin.pending_owner !== session.token_hash || Number(admin.pending_expires) <= Date.now()) fail(409, 'enrollment_expired', 'Start authenticator setup again.');
      const step = totpStep(decryptSecret(admin.pending_secret!), body.code);
      if (step === null) fail(403, 'invalid_factor', 'Invalid authenticator code.');
      const codes = recoveryCodes();
      await tx.run('UPDATE admin_auth SET totp_secret = pending_secret, last_step = ?, recovery_codes = ? WHERE id = 1', [step, JSON.stringify(codes.map(recoveryDigest))]);
      admin.totp_secret = admin.pending_secret;
      return { ...await rotateSessions(tx, admin), recoveryCodes: codes };
    }
    if (action === 'disable') {
      if (!admin.totp_secret) fail(409, 'mfa_disabled', 'Two-factor authentication is already disabled.');
      await reauthenticate(tx, admin, body);
      await tx.run("UPDATE admin_auth SET totp_secret = NULL, last_step = -1, recovery_codes = '[]' WHERE id = 1");
      admin.totp_secret = null;
      return rotateSessions(tx, admin);
    }
    if (action === 'password') {
      await reauthenticate(tx, admin, body);
      await tx.run('UPDATE admin_auth SET password_hash = ? WHERE id = 1', [await hashPassword(body.newPassword)]);
      return rotateSessions(tx, admin);
    }
    if (action === 'recovery') {
      if (!admin.totp_secret) fail(409, 'mfa_disabled', 'Enable two-factor authentication first.');
      await reauthenticate(tx, admin, body);
      const codes = recoveryCodes();
      await tx.run('UPDATE admin_auth SET recovery_codes = ? WHERE id = 1', [JSON.stringify(codes.map(recoveryDigest))]);
      return { ...await rotateSessions(tx, admin), recoveryCodes: codes };
    }
    return fail(404, 'not_found', 'Unknown authentication action.');
  });
}
