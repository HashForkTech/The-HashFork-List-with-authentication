const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
} as const;

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/**
 * All API errors share this envelope. Messages are user-facing (English) and
 * never contain stack traces, SQL or secrets — details are logged server-side.
 */
export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  const body: ApiErrorBody = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { ...JSON_HEADERS, ...((init?.headers as Record<string, string>) ?? {}) },
  });
}

export type ParsedBody =
  | { ok: true; data: unknown }
  | { ok: false; reason: 'empty' | 'invalid' | 'too_large' };

/** Safely parses a JSON request body with a hard size limit. */
export async function readJsonBody(req: Request, maxBytes = 2_000_000): Promise<ParsedBody> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (text.length > maxBytes) return { ok: false, reason: 'too_large' };
  if (!text.trim()) return { ok: false, reason: 'empty' };
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
