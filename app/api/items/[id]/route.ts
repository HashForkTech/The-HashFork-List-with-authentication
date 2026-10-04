import { getDb } from '@/lib/db/client';
import { getCategory } from '@/lib/db/repositories/categories';
import { deleteItem, getItem, updateItem } from '@/lib/db/repositories/items';
import { jsonError, jsonOk, readJsonBody } from '@/lib/http/api';
import { rejectUntrustedMutation } from '@/lib/http/guard';
import { logger } from '@/lib/logger';
import { formatIssues, itemInputSchema } from '@/lib/validation/schemas';
import { normalizeUrlFields } from '@/lib/validation/url';
import type { ItemPayload } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/items/[id] — partial update (no login required). */
export async function PATCH(req: Request, context: RouteContext): Promise<Response> {
  try {
    const denied = rejectUntrustedMutation(req);
    if (denied) return denied;

    const { id } = await context.params;
    const db = getDb();
    if (!getItem(db, id)) {
      return jsonError(404, 'not_found', 'This resource does not exist (or no longer exists).');
    }

    const body = await readJsonBody(req);
    if (!body.ok) return jsonError(400, 'bad_request', 'Invalid request: unreadable data.');

    const parsed = itemInputSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(422, 'validation', 'Some fields are invalid.', {
        issues: formatIssues(parsed.error),
      });
    }

    const categoryId = parsed.data.categoryId ?? null;
    if (categoryId && !getCategory(db, categoryId)) {
      return jsonError(422, 'validation', 'Unknown category.', {
        issues: ['The selected category does not exist (or no longer exists).'],
      });
    }

    // `undefined` = leave unchanged (partial update), `null` = clear the field.
    // URLs are stored normalized (scheme added, whitespace trimmed, …).
    const payload: ItemPayload = normalizeUrlFields({
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
      description: parsed.data.description,
      githubUrl: parsed.data.githubUrl,
      websiteUrl: parsed.data.websiteUrl,
      huggingFaceUrl: parsed.data.huggingFaceUrl,
      youtubeUrl: parsed.data.youtubeUrl,
      tested: parsed.data.tested,
      testedAt: parsed.data.testedAt,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });

    const item = updateItem(db, id, payload);
    logger.info('item updated', { itemId: id });
    return jsonOk({ item });
  } catch (error) {
    logger.error('updating item failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}

/** DELETE /api/items/[id] (no login required), requires confirmation in the UI. */
export async function DELETE(req: Request, context: RouteContext): Promise<Response> {
  try {
    const denied = rejectUntrustedMutation(req);
    if (denied) return denied;

    const { id } = await context.params;
    const deleted = deleteItem(getDb(), id);
    if (!deleted) {
      return jsonError(404, 'not_found', 'This resource does not exist (or no longer exists).');
    }
    logger.info('item deleted', { itemId: id });
    return jsonOk({ ok: true });
  } catch (error) {
    logger.error('deleting item failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}
