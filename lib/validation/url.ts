/**
 * URL validation + normalization — pure TypeScript (safe for client bundles).
 */

export const LIMITS = {
  id: 64,
  name: 200,
  description: 4000,
  comment: 2000,
  url: 2048,
  category: 60,
  siteTitle: 100,
  backupCategories: 5000,
  backupItems: 20000,
} as const;

/**
 * Validates and normalizes a URL supplied by the administrator.
 *
 * - trims whitespace, rejects control characters and exotic schemes
 * - accepts only http(s) — `javascript:`, `data:` … are rejected
 * - a missing scheme is normalized to `https://`
 * - any valid http(s) URL is accepted (no strict host allow-list, per spec)
 */
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > LIMITS.url) return null;
  if (/[\s<>"`\\^{}|]/.test(value)) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
  const candidate = hasScheme ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname;
  if (!host) return null;
  const isLocalhost = host === 'localhost' || host.endsWith('.localhost');
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isIpv6 = host.includes(':');
  if (!isLocalhost && !isIpv4 && !isIpv6 && !host.includes('.')) return null;

  return url.toString();
}

export type UrlFields = {
  githubUrl?: string | null;
  websiteUrl?: string | null;
  huggingFaceUrl?: string | null;
  youtubeUrl?: string | null;
};

/**
 * Normalizes the four optional link fields of an item, preserving `undefined`
 * (field not provided) and `null` (field cleared).
 */
export function normalizeUrlFields<T extends UrlFields>(input: T): T {
  const clean = (value: string | null | undefined): string | null | undefined => {
    if (value == null) return value;
    return normalizeUrl(value) ?? value;
  };
  return {
    ...input,
    githubUrl: clean(input.githubUrl),
    websiteUrl: clean(input.websiteUrl),
    huggingFaceUrl: clean(input.huggingFaceUrl),
    youtubeUrl: clean(input.youtubeUrl),
  };
}
