import { randomUUID } from 'node:crypto';
import type { DB } from '../client';
import type { ItemPayload, ListItem } from '../../types';

type ItemRow = {
  id: string;
  category_id: string | null;
  name: string | null;
  description: string | null;
  github_url: string | null;
  website_url: string | null;
  huggingface_url: string | null;
  youtube_url: string | null;
  tested: number;
  tested_at: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

function mapItem(row: ItemRow): ListItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    githubUrl: row.github_url,
    websiteUrl: row.website_url,
    huggingFaceUrl: row.huggingface_url,
    youtubeUrl: row.youtube_url,
    tested: Boolean(row.tested),
    testedAt: row.tested_at,
    rating: row.rating ?? 0,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ListItemsOptions = {
  categoryId?: string | null;
};

/** Newest entries first (see README → Sorting). */
export function listItems(db: DB, options: ListItemsOptions = {}): ListItem[] {
  const { categoryId } = options;
  const rows =
    categoryId === undefined || categoryId === null
      ? (db
          .prepare('SELECT * FROM items ORDER BY created_at DESC, id DESC')
          .all() as ItemRow[])
      : (db
          .prepare(
            'SELECT * FROM items WHERE category_id = ? ORDER BY created_at DESC, id DESC',
          )
          .all(categoryId) as ItemRow[]);
  return rows.map(mapItem);
}

export function getItem(db: DB, id: string): ListItem | null {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  return row ? mapItem(row) : null;
}

/** Ratings are stored as an integer 0–5 (0 = not rated). */
function normalizeRating(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, Math.round(value)));
}

/** Timestamps are stored as ISO strings; invalid values are rejected upstream. */
function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function createItem(db: DB, payload: ItemPayload, id: string = randomUUID()): ListItem {
  // The creation date is added automatically from the OS date (system clock)
  // at creation time; it is never entered by hand (except backup restore).
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO items (id, category_id, name, description, github_url, website_url,
                        huggingface_url, youtube_url, tested, tested_at, rating, comment,
                        created_at, updated_at)
     VALUES (@id, @categoryId, @name, @description, @githubUrl, @websiteUrl,
             @huggingFaceUrl, @youtubeUrl, @tested, @testedAt, @rating, @comment,
             @createdAt, @updatedAt)`,
  ).run({
    id,
    categoryId: payload.categoryId ?? null,
    name: payload.name ?? null,
    description: payload.description ?? null,
    githubUrl: payload.githubUrl ?? null,
    websiteUrl: payload.websiteUrl ?? null,
    huggingFaceUrl: payload.huggingFaceUrl ?? null,
    youtubeUrl: payload.youtubeUrl ?? null,
    tested: payload.tested ? 1 : 0,
    // The "Tested" check date is stamped when the checkbox is checked.
    testedAt: payload.tested ? (normalizeTimestamp(payload.testedAt) ?? now) : null,
    rating: normalizeRating(payload.rating),
    comment: payload.comment ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return getItem(db, id) as ListItem;
}

export function updateItem(db: DB, id: string, payload: ItemPayload): ListItem | null {
  const existing = getItem(db, id);
  if (!existing) return null;
  const merged: ItemPayload = {
    categoryId: payload.categoryId !== undefined ? payload.categoryId : existing.categoryId,
    name: payload.name !== undefined ? payload.name : existing.name,
    description: payload.description !== undefined ? payload.description : existing.description,
    githubUrl: payload.githubUrl !== undefined ? payload.githubUrl : existing.githubUrl,
    websiteUrl: payload.websiteUrl !== undefined ? payload.websiteUrl : existing.websiteUrl,
    huggingFaceUrl:
      payload.huggingFaceUrl !== undefined ? payload.huggingFaceUrl : existing.huggingFaceUrl,
    youtubeUrl: payload.youtubeUrl !== undefined ? payload.youtubeUrl : existing.youtubeUrl,
    tested: payload.tested !== undefined ? payload.tested : existing.tested,
    rating: payload.rating !== undefined ? payload.rating : existing.rating,
    comment: payload.comment !== undefined ? payload.comment : existing.comment,
  };
  const now = new Date().toISOString();
  // "Tested" check date:
  //   - unchecked          → cleared
  //   - checked (or kept)  → the explicit date sent by the form when the admin
  //     just checked the box, otherwise the first recorded check date, and
  //     `now` when the resource becomes (or already is) tested without a date.
  const testedAt = merged.tested
    ? normalizeTimestamp(payload.testedAt) ??
      (existing.tested && existing.testedAt ? existing.testedAt : now)
    : null;
  db.prepare(
    `UPDATE items
        SET category_id = @categoryId,
            name = @name,
            description = @description,
            github_url = @githubUrl,
            website_url = @websiteUrl,
            huggingface_url = @huggingFaceUrl,
            youtube_url = @youtubeUrl,
            tested = @tested,
            tested_at = @testedAt,
            rating = @rating,
            comment = @comment,
            updated_at = @updatedAt
      WHERE id = @id`,
  ).run({
    id,
    categoryId: merged.categoryId ?? null,
    name: merged.name ?? null,
    description: merged.description ?? null,
    githubUrl: merged.githubUrl ?? null,
    websiteUrl: merged.websiteUrl ?? null,
    huggingFaceUrl: merged.huggingFaceUrl ?? null,
    youtubeUrl: merged.youtubeUrl ?? null,
    tested: merged.tested ? 1 : 0,
    testedAt,
    rating: normalizeRating(merged.rating),
    comment: merged.comment ?? null,
    updatedAt: now,
  });
  return getItem(db, id);
}

export function deleteItem(db: DB, id: string): boolean {
  return db.prepare('DELETE FROM items WHERE id = ?').run(id).changes === 1;
}

export function countItems(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number };
  return row.n;
}

/**
 * Inserts items with explicit ids/timestamps (used by backup restore).
 * `replace` semantics are handled by the backup service.
 */
export function insertItemRaw(db: DB, item: ListItem): boolean {
  const info = db
    .prepare(
      `INSERT INTO items (id, category_id, name, description, github_url, website_url,
                          huggingface_url, youtube_url, tested, tested_at, rating, comment,
                          created_at, updated_at)
       VALUES (@id, @categoryId, @name, @description, @githubUrl, @websiteUrl,
               @huggingFaceUrl, @youtubeUrl, @tested, @testedAt, @rating, @comment,
               @createdAt, @updatedAt)`,
    )
    .run({
      id: item.id,
      categoryId: item.categoryId ?? null,
      name: item.name ?? null,
      description: item.description ?? null,
      githubUrl: item.githubUrl ?? null,
      websiteUrl: item.websiteUrl ?? null,
      huggingFaceUrl: item.huggingFaceUrl ?? null,
      youtubeUrl: item.youtubeUrl ?? null,
      tested: item.tested ? 1 : 0,
      testedAt: normalizeTimestamp(item.testedAt),
      rating: normalizeRating(item.rating),
      comment: item.comment ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  return info.changes === 1;
}
