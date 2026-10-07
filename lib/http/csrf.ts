/** Additional same-origin checks for bearer-authenticated admin mutations. */
export const MUTATION_HEADER = 'x-requested-with';
export const MUTATION_HEADER_VALUE = 'hashfork-admin';
export type MutationCheck = { ok: true } | { ok: false; reason: string };
function allowedOrigins(req: Request): Set<string> {
  const origins = new Set<string>();
  const add = (value?: string | null) => {
    if (!value) return;
    try { const url = new URL(value); if (['http:', 'https:'].includes(url.protocol)) origins.add(url.origin); } catch { /* invalid configuration is not an allow-list entry */ }
  };
  add(process.env.APP_URL);
  if (process.env.VERCEL_URL) add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (process.env.NODE_ENV !== 'production') add(req.url);
  return origins;
}
export function checkMutationRequest(req: Request): MutationCheck {
  if (req.headers.get(MUTATION_HEADER) !== MUTATION_HEADER_VALUE) return { ok: false, reason: 'missing custom mutation header' };
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return { ok: false, reason: 'cross-site request' };
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || !allowedOrigins(req).has(parsed.origin)) return { ok: false, reason: 'origin not allowed' };
    } catch { return { ok: false, reason: 'malformed origin header' }; }
  }
  return { ok: true };
}
