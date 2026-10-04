import { getDb } from '@/lib/db/client';
import { jsonError, jsonOk, readJsonBody } from '@/lib/http/api';
import { rejectUntrustedMutation } from '@/lib/http/guard';
import { logger } from '@/lib/logger';
import { formatIssues, importRequestSchema } from '@/lib/validation/schemas';
import { importData, toParsedBackup, type ImportMode } from '@/lib/services/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMPORT_BYTES = 8_000_000;

/**
 * POST /api/import (no login required).
 *
 * Body: { mode: 'merge' | 'replace', confirm?: boolean, data: { categories, items } }
 *
 * - the whole file is validated before anything is written
 * - writes happen in one SQLite transaction (all-or-nothing)
 * - existing rows are never overwritten: duplicates are skipped (merge)
 * - `mode: 'replace'` wipes current data and therefore REQUIRES `confirm: true`
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const denied = rejectUntrustedMutation(req);
    if (denied) return denied;

    const body = await readJsonBody(req, MAX_IMPORT_BYTES);
    if (!body.ok) {
      const message =
        body.reason === 'too_large'
          ? 'File too large (8 MB maximum).'
          : 'Invalid request: unreadable data.';
      return jsonError(400, 'bad_request', message);
    }

    const parsed = importRequestSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(422, 'validation', 'The backup file is invalid.', {
        issues: formatIssues(parsed.error),
      });
    }

    const mode = parsed.data.mode as ImportMode;
    if (mode === 'replace' && parsed.data.confirm !== true) {
      return jsonError(
        422,
        'confirmation_required',
        'Importing in "Replace" mode erases the current data: explicit confirmation is required.',
      );
    }

    const summary = importData(getDb(), toParsedBackup(parsed.data.data), mode);
    logger.info('data imported', { ...summary });
    return jsonOk({ ok: true, summary });
  } catch (error) {
    logger.error('import failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}
