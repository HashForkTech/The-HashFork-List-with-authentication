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

/** Read a bounded UTF-8 body; count bytes and stop before buffering oversized input. */
export async function readJsonBody(req: Request, maxBytes = 2_000_000): Promise<ParsedBody> {
  const length = req.headers.get('content-length');
  if (length && Number(length) > maxBytes) return { ok: false, reason: 'too_large' };
  if (!req.body) return { ok: false, reason: 'empty' };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); return { ok: false, reason: 'too_large' }; }
      chunks.push(value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (!text.trim()) return { ok: false, reason: 'empty' };
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch { return { ok: false, reason: 'invalid' }; }
  finally { reader.releaseLock(); }
}
