import { getDb } from '@/lib/db/client';
import { createCategory, getCategory } from '@/lib/db/repositories/categories';
import { createItem, listItems } from '@/lib/db/repositories/items';
import { jsonError, jsonOk, readJsonBody } from '@/lib/http/api';
import { rejectUntrustedMutation } from '@/lib/http/guard';
import { logger } from '@/lib/logger';
import { formatIssues, itemInputSchema } from '@/lib/validation/schemas';
import { normalizeUrlFields } from '@/lib/validation/url';
import type { ItemPayload } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/items[?categoryId=] — public read (the homepage shows every item
 * anyway). URLs are normalized before being returned.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const categoryId = url.searchParams.get('categoryId');
    const items =
      categoryId && categoryId !== 'all'
        ? listItems(db, { categoryId })
        : listItems(db);
    return jsonOk({ items });
  } catch (error) {
    logger.error('listing items failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}

/**
 * POST /api/items (no login required).
 *
 * Every field is optional: an item may be saved with a single field — or even
 * completely empty, exactly as specified. Provided URLs must be valid.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const denied = rejectUntrustedMutation(req);
    if (denied) return denied;

    const body = await readJsonBody(req);
    if (!body.ok) return jsonError(400, 'bad_request', 'Invalid request: unreadable data.');

    const parsed = itemInputSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(422, 'validation', 'Some fields are invalid.', {
        issues: formatIssues(parsed.error),
      });
    }

    const db = getDb();
    let categoryId: string | null = parsed.data.categoryId ?? null;
    if (categoryId && !getCategory(db, categoryId)) {
      // Category created in another tab? Offer to create it inline.
      const raw = (body.data as { categoryName?: unknown }).categoryName;
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (name && name.length <= 60) {
        categoryId = createCategory(db, name).id;
      } else {
        return jsonError(422, 'validation', 'Unknown category.', {
          issues: ['The selected category does not exist (or no longer exists).'],
        });
      }
    }

    // URLs are stored normalized (scheme added, whitespace trimmed, …).
    const payload: ItemPayload = normalizeUrlFields({
      categoryId,
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

    const item = createItem(db, payload);
    logger.info('item created', { itemId: item.id });
    return jsonOk({ item }, { status: 201 });
  } catch (error) {
    logger.error('creating item failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}
