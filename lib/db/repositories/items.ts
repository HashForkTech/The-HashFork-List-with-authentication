import { randomUUID } from 'node:crypto';
import type { Store } from '../store';
import type { ItemPayload, ListItem } from '../../types';

type ItemRow = {
  id: string; category_id: string | null; name: string | null;
  description: string | null; github_url: string | null; website_url: string | null;
  huggingface_url: string | null; youtube_url: string | null;
  tested: number; tested_at: string | null; rating: number; comment: string | null;
  created_at: string; updated_at: string;
};

function mapItem(row: ItemRow): ListItem {
  return {
    id: row.id, categoryId: row.category_id, name: row.name, description: row.description,
    githubUrl: row.github_url, websiteUrl: row.website_url,
    huggingFaceUrl: row.huggingface_url, youtubeUrl: row.youtube_url,
    tested: Boolean(row.tested), testedAt: row.tested_at, rating: Number(row.rating ?? 0),
    comment: row.comment, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export type ListItemsOptions = { categoryId?: string | null };

/** Newest entries first, with an ID tie-breaker. */
export async function listItems(db: Store, options: ListItemsOptions = {}): Promise<ListItem[]> {
  const categoryId = options.categoryId;
  const rows = categoryId === undefined || categoryId === null
    ? await db.all<ItemRow>('SELECT * FROM items ORDER BY created_at DESC, id DESC')
    : await db.all<ItemRow>('SELECT * FROM items WHERE category_id = ? ORDER BY created_at DESC, id DESC', [categoryId]);
  return rows.map(mapItem);
}

export async function getItem(db: Store, id: string): Promise<ListItem | null> {
  const row = await db.get<ItemRow>('SELECT * FROM items WHERE id = ?', [id]);
  return row ? mapItem(row) : null;
}

function normalizeRating(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, Math.round(value)));
}

function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

const INSERT_ITEM_SQL = `INSERT INTO items
  (id, category_id, name, description, github_url, website_url, huggingface_url,
   youtube_url, tested, tested_at, rating, comment, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function itemValues(item: ListItem): unknown[] {
  return [
    item.id, item.categoryId ?? null, item.name ?? null, item.description ?? null,
    item.githubUrl ?? null, item.websiteUrl ?? null, item.huggingFaceUrl ?? null,
    item.youtubeUrl ?? null, item.tested ? 1 : 0, normalizeTimestamp(item.testedAt),
    normalizeRating(item.rating), item.comment ?? null, item.createdAt, item.updatedAt,
  ];
}

export async function createItem(db: Store, payload: ItemPayload, id: string = randomUUID()): Promise<ListItem> {
  const now = new Date().toISOString();
  const item: ListItem = {
    id, categoryId: payload.categoryId ?? null, name: payload.name ?? null,
    description: payload.description ?? null, githubUrl: payload.githubUrl ?? null,
    websiteUrl: payload.websiteUrl ?? null, huggingFaceUrl: payload.huggingFaceUrl ?? null,
    youtubeUrl: payload.youtubeUrl ?? null, tested: Boolean(payload.tested),
    testedAt: payload.tested ? normalizeTimestamp(payload.testedAt) ?? now : null,
    rating: normalizeRating(payload.rating), comment: payload.comment ?? null,
    createdAt: now, updatedAt: now,
  };
  await db.run(INSERT_ITEM_SQL, itemValues(item));
  return item;
}

export async function updateItem(db: Store, id: string, payload: ItemPayload): Promise<ListItem | null> {
  return db.transaction(async (tx) => {
    const row = await tx.get<ItemRow>(
      'SELECT * FROM items WHERE id = ?' + (tx.dialect === 'postgres' ? ' FOR UPDATE' : ''), [id],
    );
    if (!row) return null;
    const existing = mapItem(row);
    const now = new Date().toISOString();
    const tested = payload.tested !== undefined ? payload.tested : existing.tested;
    const item: ListItem = {
      ...existing,
      categoryId: payload.categoryId !== undefined ? payload.categoryId : existing.categoryId,
      name: payload.name !== undefined ? payload.name : existing.name,
      description: payload.description !== undefined ? payload.description : existing.description,
      githubUrl: payload.githubUrl !== undefined ? payload.githubUrl : existing.githubUrl,
      websiteUrl: payload.websiteUrl !== undefined ? payload.websiteUrl : existing.websiteUrl,
      huggingFaceUrl: payload.huggingFaceUrl !== undefined ? payload.huggingFaceUrl : existing.huggingFaceUrl,
      youtubeUrl: payload.youtubeUrl !== undefined ? payload.youtubeUrl : existing.youtubeUrl,
      tested: Boolean(tested),
      testedAt: tested ? normalizeTimestamp(payload.testedAt) ?? (existing.tested && existing.testedAt ? existing.testedAt : now) : null,
      rating: normalizeRating(payload.rating !== undefined ? payload.rating : existing.rating),
      comment: payload.comment !== undefined ? payload.comment : existing.comment,
      updatedAt: now,
    };
    await tx.run(`UPDATE items SET category_id = ?, name = ?, description = ?,
      github_url = ?, website_url = ?, huggingface_url = ?, youtube_url = ?,
      tested = ?, tested_at = ?, rating = ?, comment = ?, updated_at = ? WHERE id = ?`, [
      item.categoryId, item.name, item.description, item.githubUrl, item.websiteUrl,
      item.huggingFaceUrl, item.youtubeUrl, item.tested ? 1 : 0, item.testedAt,
      item.rating, item.comment, item.updatedAt, id,
    ]);
    return item;
  });
}

export async function deleteItem(db: Store, id: string): Promise<boolean> {
  return await db.run('DELETE FROM items WHERE id = ?', [id]) === 1;
}

export async function countItems(db: Store): Promise<number> {
  const row = await db.get<{ n: number | string }>('SELECT COUNT(*) AS n FROM items');
  return Number(row?.n ?? 0);
}

/** Skip duplicate IDs without aborting a Postgres restore transaction. */
export async function insertItemRaw(db: Store, item: ListItem): Promise<boolean> {
  return await db.run(INSERT_ITEM_SQL + ' ON CONFLICT (id) DO NOTHING', itemValues(item)) === 1;
}
