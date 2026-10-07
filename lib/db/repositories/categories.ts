import { randomUUID } from 'node:crypto';
import type { Store } from '../store';
import type { Category, CategoryWithCount } from '../../types';

type CategoryRow = { id: string; name: string; created_at: string; updated_at: string };
type CategoryWithCountRow = CategoryRow & { item_count: number | string };

function mapCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function listCategories(db: Store): Promise<CategoryWithCount[]> {
  const rows = await db.all<CategoryWithCountRow>(
    `SELECT c.id, c.name, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count
       FROM categories c`,
  );
  return rows
    .map((row) => ({ ...mapCategory(row), itemCount: Number(row.item_count) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id, 'en'));
}

export async function listCategoriesRaw(db: Store): Promise<Category[]> {
  return (await listCategories(db)).map(({ id, name, createdAt }) => ({ id, name, createdAt }));
}

/** Duplicate IDs are skipped atomically, including inside Postgres transactions. */
export async function insertCategoryRaw(db: Store, category: Category): Promise<boolean> {
  return await db.run(
    'INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING',
    [category.id, category.name, category.createdAt, new Date().toISOString()],
  ) === 1;
}

export async function getCategory(db: Store, id: string): Promise<Category | null> {
  const row = await db.get<CategoryRow>('SELECT * FROM categories WHERE id = ?', [id]);
  return row ? mapCategory(row) : null;
}

export async function createCategory(db: Store, name: string, id: string = randomUUID()): Promise<Category> {
  const now = new Date().toISOString();
  await db.run('INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, name, now, now]);
  return { id, name, createdAt: now };
}

export async function updateCategory(db: Store, id: string, name: string): Promise<Category | null> {
  return db.transaction(async (tx) => {
    const existing = await getCategory(tx, id);
    if (!existing) return null;
    const changed = await tx.run('UPDATE categories SET name = ?, updated_at = ? WHERE id = ?', [name, new Date().toISOString(), id]);
    return changed === 0 ? null : { id, name, createdAt: existing.createdAt };
  });
}

export async function countItemsInCategory(db: Store, id: string): Promise<number> {
  const row = await db.get<{ n: number | string }>('SELECT COUNT(*) AS n FROM items WHERE category_id = ?', [id]);
  return Number(row?.n ?? 0);
}

/** Delete the category while keeping its resources, returning the detached count. */
export async function deleteCategory(db: Store, id: string): Promise<{ deleted: boolean; detachedItems: number }> {
  return db.transaction(async (tx) => {
    // Lock the parent first so concurrent inserts cannot attach another item.
    const category = await tx.get<CategoryRow>(
      'SELECT * FROM categories WHERE id = ?' + (tx.dialect === 'postgres' ? ' FOR UPDATE' : ''),
      [id],
    );
    if (!category) return { deleted: false, detachedItems: 0 };
    const detached = await tx.run('UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?', [new Date().toISOString(), id]);
    const deleted = await tx.run('DELETE FROM categories WHERE id = ?', [id]) === 1;
    return { deleted, detachedItems: deleted ? detached : 0 };
  });
}
