import { getStore } from '@/lib/db/store';
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
    const db = getStore();
    const url = new URL(req.url);
    const categoryId = url.searchParams.get('categoryId');
    const items =
      categoryId && categoryId !== 'all'
        ? await listItems(db, { categoryId })
        : await listItems(db);
    return jsonOk({ items });
  } catch (error) {
    logger.error('listing items failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}

/**
 * POST /api/items (admin authentication required).
 *
 * Every field is optional: an item may be saved with a single field — or even
 * completely empty, exactly as specified. Provided URLs must be valid.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const denied = await rejectUntrustedMutation(req);
    if (denied) return denied;

    const body = await readJsonBody(req);
    if (!body.ok) return jsonError(400, 'bad_request', 'Invalid request: unreadable data.');

    const parsed = itemInputSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(422, 'validation', 'Some fields are invalid.', {
        issues: formatIssues(parsed.error),
      });
    }

    const db = getStore();
    let categoryId: string | null = parsed.data.categoryId ?? null;
    if (categoryId && !(await getCategory(db, categoryId))) {
      // Category created in another tab? Offer to create it inline.
      const raw = (body.data as { categoryName?: unknown }).categoryName;
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (name && name.length <= 60) {
        categoryId = (await createCategory(db, name)).id;
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

    const item = await createItem(db, payload);
    logger.info('item created', { itemId: item.id });
    return jsonOk({ item }, { status: 201 });
  } catch (error) {
    logger.error('creating item failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}
