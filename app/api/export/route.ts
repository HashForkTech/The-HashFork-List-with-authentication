import { getStore } from '@/lib/db/store';
import { jsonError } from '@/lib/http/api';
import { rejectUnauthorized } from '@/lib/http/guard';
import { logger } from '@/lib/logger';
import { exportData } from '@/lib/services/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export — downloads every category and item as a JSON backup file
 * (see README → Backup & restore). Requires admin authentication.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const denied = await rejectUnauthorized(req);
    if (denied) return denied;

    const data = await exportData(getStore());
    const stamp = new Date().toISOString().slice(0, 10);
    logger.info('data exported', {
      categories: data.categories.length,
      items: data.items.length,
    });
    // A pull-based stream avoids Vercel's buffered response payload limit.
    function* chunks(): Generator<string> {
      yield JSON.stringify({ format: data.format, version: data.version, exportedAt: data.exportedAt }).slice(0, -1) + ',"categories":[';
      for (let index = 0; index < data.categories.length; index += 1) {
        yield (index ? ',' : '') + JSON.stringify(data.categories[index]);
      }
      yield '],"items":[';
      for (let index = 0; index < data.items.length; index += 1) {
        yield (index ? ',' : '') + JSON.stringify(data.items[index]);
      }
      yield ']}';
    }
    const iterator = chunks();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
      cancel() { iterator.return(undefined); },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="hashfork-list-backup-${stamp}.json"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('export failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}
