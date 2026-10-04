import { randomUUID } from 'node:crypto';
import type { DB } from '../client';
import type { Category, CategoryWithCount } from '../../types';

type CategoryRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type CategoryWithCountRow = CategoryRow & { item_count: number };

function mapCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function mapCategoryWithCount(row: CategoryWithCountRow): CategoryWithCount {
  return { ...mapCategory(row), itemCount: row.item_count };
}

export function listCategories(db: DB): CategoryWithCount[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count
         FROM categories c
        ORDER BY c.created_at ASC, c.name ASC`,
    )
    .all() as CategoryWithCountRow[];
  return rows.map(mapCategoryWithCount);
}

export function listCategoriesRaw(db: DB): Category[] {
  return listCategories(db).map(({ id, name, createdAt }) => ({ id, name, createdAt }));
}

/** Inserts a category with explicit id/timestamps (used by backup restore). */
export function insertCategoryRaw(db: DB, category: Category): boolean {
  const updatedAt = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    )
    .run(category.id, category.name, category.createdAt, updatedAt);
  return info.changes === 1;
}

export function getCategory(db: DB, id: string): Category | null {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined;
  return row ? mapCategory(row) : null;
}

export function createCategory(db: DB, name: string, id: string = randomUUID()): Category {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    now,
    now,
  );
  return { id, name, createdAt: now };
}

export function updateCategory(db: DB, id: string, name: string): Category | null {
  const now = new Date().toISOString();
  const info = db
    .prepare('UPDATE categories SET name = ?, updated_at = ? WHERE id = ?')
    .run(name, now, id);
  if (info.changes === 0) return null;
  return { id, name, createdAt: (getCategory(db, id) as Category).createdAt };
}

export function countItemsInCategory(db: DB, id: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM items WHERE category_id = ?').get(id) as {
    n: number;
  };
  return row.n;
}

/**
 * Deletes a category while KEEPING its items: their category association is
 * cleared (never silently delete associated objects).
 *
 * Returns the number of items that were detached from the category.
 */
export function deleteCategory(db: DB, id: string): { deleted: boolean; detachedItems: number } {
  const run = db.transaction(() => {
    const detached = countItemsInCategory(db, id);
    db.prepare('UPDATE items SET category_id = NULL, updated_at = ? WHERE category_id = ?').run(
      new Date().toISOString(),
      id,
    );
    const deleted = db.prepare('DELETE FROM categories WHERE id = ?').run(id).changes === 1;
    return { deleted, detachedItems: deleted ? detached : 0 };
  });
  return run();
}
