import { getDb } from '@/lib/db/client';
import { createCategory, listCategories } from '@/lib/db/repositories/categories';
import { rejectUntrustedMutation } from '@/lib/http/guard';
import { jsonError, jsonOk, readJsonBody } from '@/lib/http/api';
import { logger } from '@/lib/logger';
import { categoryInputSchema, formatIssues } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/categories — public (category names are shown on the homepage). */
export async function GET(): Promise<Response> {
  try {
    return jsonOk({ categories: listCategories(getDb()) });
  } catch (error) {
    logger.error('listing categories failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}

/** POST /api/categories (no login required). */
export async function POST(req: Request): Promise<Response> {
  try {
    const denied = rejectUntrustedMutation(req);
    if (denied) return denied;

    const body = await readJsonBody(req);
    if (!body.ok) return jsonError(400, 'bad_request', 'Invalid request: unreadable data.');

    const parsed = categoryInputSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(422, 'validation', 'Some fields are invalid.', {
        issues: formatIssues(parsed.error),
      });
    }

    const category = createCategory(getDb(), parsed.data.name);
    logger.info('category created', { categoryId: category.id });
    return jsonOk({ category }, { status: 201 });
  } catch (error) {
    logger.error('creating category failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}
