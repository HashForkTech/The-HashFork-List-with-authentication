import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers for every response.
 *
 * The Content-Security-Policy is intentionally strict and self-contained:
 * this build loads no third-party resources (the Google Translate widget was
 * removed), so no external origins are allow-listed.
 */

function buildCsp(): string {
  const directives: string[] = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `form-action 'self'`,
    `script-src 'self' 'unsafe-inline'`,
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

const CSP = buildCsp();

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set('content-security-policy', CSP);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('cross-origin-resource-policy', 'same-origin');

  // HSTS is strictly opt-in: the app works fine over plain HTTP (no cookies,
  // no authentication), so TLS is never required.
  if (process.env.ENABLE_HSTS === 'true') {
    response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains');
  }

  return response;
}

export const config = {
  // Static build assets are served untouched.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
