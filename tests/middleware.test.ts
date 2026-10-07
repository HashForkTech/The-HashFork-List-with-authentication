import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
afterEach(() => vi.unstubAllEnvs());
describe('per-request script policy', () => {
  it('forwards a fresh script nonce to Next and forbids arbitrary inline scripts', () => {
    const a = middleware(new NextRequest('https://localhost/admin'));
    const b = middleware(new NextRequest('https://localhost/admin'));
    const csp = a.headers.get('content-security-policy')!;
    expect(csp).toContain("'strict-dynamic'");
    expect(csp.match(/script-src[^;]+/)![0]).not.toContain("'unsafe-inline'");
    expect(csp).not.toEqual(b.headers.get('content-security-policy'));
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    expect(a.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(a.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(a.headers.has('set-cookie')).toBe(false);
  });
  it('uses forwarded HTTPS only behind an explicitly trusted proxy', () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    const req = new NextRequest('http://localhost/admin', { headers: { 'x-forwarded-proto': 'https' } });
    expect(middleware(req).headers.has('cross-origin-opener-policy')).toBe(false);
    vi.stubEnv('TRUST_PROXY', 'true');
    expect(middleware(req).headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });
});
