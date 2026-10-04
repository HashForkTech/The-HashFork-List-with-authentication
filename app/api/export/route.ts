import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/http/api';
import { logger } from '@/lib/logger';
import { exportData } from '@/lib/services/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export — downloads every category and item as a JSON backup file
 * (see README → Backup & restore). Read-only, open like the rest of the API.
 */
export async function GET(req: Request): Promise<Response> {
  try {

    const data = exportData(getDb());
    const stamp = new Date().toISOString().slice(0, 10);
    logger.info('data exported', {
      categories: data.categories.length,
      items: data.items.length,
    });
    return new Response(JSON.stringify(data, null, 2), {
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
