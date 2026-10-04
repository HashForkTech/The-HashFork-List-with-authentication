/**
 * Cross-origin protection for state-changing endpoints.
 *
 * NOTE: this build ships WITHOUT admin authentication — there are no
 * accounts, no passwords and no cookies, so the application needs no TLS
 * certificate to function. The checks below therefore do not protect
 * credentials; they protect the DATA against "drive-by" requests issued by a
 * visitor's browser on a malicious third-party page:
 *
 *   1. a custom request header, which cross-site HTML forms cannot set and
 *      which forces a CORS preflight for cross-site fetches (never granted);
 *   2. an Origin host allow-list check (host-based) whenever an Origin
 *      header is present — a request from another host is refused;
 *   3. Sec-Fetch-Site rejection of cross-site requests.
 *
 * Anyone who can reach the network endpoint directly can still call the API
 * (there is no login), so keep the instance off the public Internet or put
 * the admin area behind a reverse-proxy gate (basic auth, IP allow-list, VPN)
 * — see README → "Admin area (no password)".
 */

export const MUTATION_HEADER = 'x-requested-with';
export const MUTATION_HEADER_VALUE = 'hashfork-admin';

export type MutationCheck = { ok: true } | { ok: false; reason: string };

/**
 * Hosts a legitimate request may come from: APP_URL, the Host /
 * X-Forwarded-Host headers of the request (proxy-safe) and the request URL.
 */
function allowedHosts(req: Request): Set<string> {
  const hosts = new Set<string>();
  const add = (value: string | null | undefined) => {
    const host = value?.split(',')[0]?.trim();
    if (host) hosts.add(host.toLowerCase());
  };

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      add(new URL(appUrl).host);
    } catch {
      /* ignore malformed APP_URL */
    }
  }
  add(req.headers.get('x-forwarded-host'));
  add(req.headers.get('host'));
  try {
    add(new URL(req.url).host);
  } catch {
    /* ignore malformed request URLs */
  }
  return hosts;
}

export function checkMutationRequest(req: Request): MutationCheck {
  const customHeader = req.headers.get(MUTATION_HEADER);
  if (customHeader !== MUTATION_HEADER_VALUE) {
    return { ok: false, reason: 'missing custom mutation header' };
  }

  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return { ok: false, reason: `cross-site request (sec-fetch-site: ${secFetchSite})` };
  }

  const origin = req.headers.get('origin');
  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return { ok: false, reason: 'malformed origin header' };
    }
    if (!allowedHosts(req).has(parsed.host.toLowerCase())) {
      return { ok: false, reason: `origin not allowed: ${parsed.host}` };
    }
  }

  return { ok: true };
}
