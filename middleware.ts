import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers for every response.
 *
 * The Content-Security-Policy is intentionally strict and self-contained:
 * this build loads no third-party resources (the Google Translate widget was
 * removed), so no external origins are allow-listed.
 */

function buildCsp(nonce: string): string {
  const directives: string[] = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `form-action 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `manifest-src 'self'`,
    `worker-src 'self' blob:`,
  ];

  if (process.env.NODE_ENV === 'development') {
    // Next.js dev tooling (HMR + react-refresh) needs eval and websockets.
    directives[directives.findIndex((d) => d.startsWith('script-src'))] += " 'unsafe-eval'";
    directives[directives.findIndex((d) => d.startsWith('connect-src'))] += ' ws: wss:';
  }

  return directives.join('; ');
}



/**
 * True when the request is served over a "potentially trustworthy" origin.
 * Behind a TLS-terminating proxy the original scheme arrives in
 * X-Forwarded-Proto; direct requests report it through the URL protocol.
 */
function isSecureOrigin(request: NextRequest): boolean {
  const forwarded = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  if (process.env.NODE_ENV === 'production') return process.env.TRUST_PROXY === 'true' && forwarded === 'https';
  if (process.env.TRUST_PROXY === 'true' && forwarded) return forwarded === 'https';
  return request.nextUrl.protocol === 'https:';
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const CSP = buildCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', CSP);
  const response = NextResponse.next({ request: { headers } });

  response.headers.set('content-security-policy', CSP);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  // COOP/CORP are only honored on secure origins: sending them over plain
  // HTTP makes browsers ignore these security headers; enable HTTPS for admin access.

  if (isSecureOrigin(request)) {
    response.headers.set('cross-origin-opener-policy', 'same-origin');
    response.headers.set('cross-origin-resource-policy', 'same-origin');
  }

  // HSTS is opt-in so local self-signed HTTPS does not pin browser policy.

  if (process.env.ENABLE_HSTS === 'true') {
    response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains');
  }

  return response;
}

export const config = {
  // Static build assets are served untouched.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
