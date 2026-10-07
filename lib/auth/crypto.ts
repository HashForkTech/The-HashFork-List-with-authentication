import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { Secret, TOTP } from 'otpauth';

let activePasswordWork = 0;
async function boundedPasswordWork<T>(fn: () => Promise<T>): Promise<T> {
  if (activePasswordWork >= 4) throw new Error('Password verification is busy.');
  activePasswordWork += 1;
  try { return await fn(); } finally { activePasswordWork -= 1; }
}
export const passwordPolicy = { min: 15, max: 128 };
export function hashPassword(password: string): Promise<string> {
  return boundedPasswordWork(() => hash(password, { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 }));
}
export function verifyPassword(encoded: string, password: string): Promise<boolean> {
  return boundedPasswordWork(() => verify(encoded, password));
}
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function secretEquals(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(digest(a), 'hex'), Buffer.from(digest(b), 'hex'));
}
export function newToken(): string { return randomBytes(32).toString('base64url'); }
export function encryptionKey(): Buffer {
  const configured = process.env.AUTH_ENCRYPTION_KEY ?? '';
  const key = Buffer.from(configured, 'base64');
  if (key.length !== 32 || key.toString('base64') !== configured) {
    throw new Error('AUTH_ENCRYPTION_KEY must be a base64 encoded 32-byte key.');
  }
  return key;
}
export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from('hashfork:totp:v1'));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
export function decryptSecret(encoded: string): string {
  const [version, nonce, tag, ciphertext] = encoded.split('.');
  if (version !== 'v1' || !nonce || !tag || !ciphertext) throw new Error('Invalid encrypted secret.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(nonce, 'base64'));
  decipher.setAAD(Buffer.from('hashfork:totp:v1'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
export function newTotp(): TOTP {
  return new TOTP({ issuer: 'The HashFork List', label: 'Admin', algorithm: 'SHA1', digits: 6, period: 30, secret: new Secret({ size: 20 }) });
}
export function totpStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const totp = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) });
  const delta = totp.validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / 30000) + delta;
}
export function recoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'));
}
export function recoveryDigest(code: string): string {
  return digest('hashfork:recovery:' + code.trim().toLowerCase().replace(/-/g, ''));
}
