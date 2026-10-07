export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Process liveness only; deliberately exposes no database or auth state. */
export async function GET(): Promise<Response> {
  return Response.json({ status: 'ok' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
