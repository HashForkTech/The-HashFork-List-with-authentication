import { randomUUID } from 'node:crypto';
import type { DB } from '@/lib/db/client';
import { isConstraintViolation } from '@/lib/db/errors';
import {
  insertCategoryRaw,
  listCategoriesRaw,
} from '@/lib/db/repositories/categories';
import { insertItemRaw, listItems } from '@/lib/db/repositories/items';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
  type Category,
  type ListItem,
} from '@/lib/types';
import { normalizeUrl, type BackupPayloadInput } from '@/lib/validation/schemas';

/**
 * Backup / restore.
 *
 * - exportData() produces a self-contained JSON document
 * - importData() validates everything first, then runs in a single SQLite
 *   transaction: it either applies completely or not at all
 *
 * Import never overwrites existing rows:
 *   - "merge"   : adds missing categories/items, skips ids that already exist
 *   - "replace" : wipes categories + items first (explicit confirmation is
 *     enforced by the API route), then loads the file
 */

export type ImportMode = 'merge' | 'replace';

export type ImportSummary = {
  mode: ImportMode;
  categories: { created: number; skipped: number };
  items: { created: number; skipped: number; unclassified: number };
};

export type ParsedBackup = {
  categories: Category[];
  items: ListItem[];
};

export function exportData(db: DB): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories: listCategoriesRaw(db),
    items: listItems(db),
  };
}

function validIsoOrNow(value: string | null | undefined): string {
  if (value && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function normalizeItemUrls(input: {
  githubUrl?: string | null;
  websiteUrl?: string | null;
  huggingFaceUrl?: string | null;
  youtubeUrl?: string | null;
}) {
  const clean = (value?: string | null) => {
    if (!value) return null;
    return normalizeUrl(value);
  };
  return {
    githubUrl: clean(input.githubUrl),
    websiteUrl: clean(input.websiteUrl),
    huggingFaceUrl: clean(input.huggingFaceUrl),
    youtubeUrl: clean(input.youtubeUrl),
  };
}

/** Converts already schema-validated backup input into domain objects. */
export function toParsedBackup(input: BackupPayloadInput): ParsedBackup {
  const categories: Category[] = input.categories.map((category) => ({
    id: category.id ?? randomUUID(),
    name: category.name,
    createdAt: validIsoOrNow(category.createdAt),
  }));

  const items: ListItem[] = input.items.map((item) => {
    const urls = normalizeItemUrls(item);
    return {
      id: item.id ?? randomUUID(),
      // References are resolved (and cleared when dangling) in importData(),
      // where the full database state is known.
      categoryId: item.categoryId ?? null,
      name: item.name ?? null,
      description: item.description ?? null,
      ...urls,
      tested: item.tested ?? false,
      // Older backups carry no check date: fall back to the update date so
      // "Tested on …" is never empty for an already-tested resource.
      testedAt: item.testedAt ?? (item.tested ? validIsoOrNow(item.updatedAt) : null),
      rating: item.rating ?? 0,
      comment: item.comment ?? null,
      createdAt: validIsoOrNow(item.createdAt),
      updatedAt: validIsoOrNow(item.updatedAt),
    };
  });

  return { categories, items };
}

export function importData(db: DB, parsed: ParsedBackup, mode: ImportMode): ImportSummary {
  const run = db.transaction((): ImportSummary => {
    const summary: ImportSummary = {
      mode,
      categories: { created: 0, skipped: 0 },
      items: { created: 0, skipped: 0, unclassified: 0 },
    };

    if (mode === 'replace') {
      db.prepare('DELETE FROM items').run();
      db.prepare('DELETE FROM categories').run();
    }

    for (const category of parsed.categories) {
      try {
        if (insertCategoryRaw(db, category)) summary.categories.created += 1;
        else summary.categories.skipped += 1;
      } catch (error) {
        if (isConstraintViolation(error)) summary.categories.skipped += 1;
        else throw error;
      }
    }

    const knownCategoryIds = new Set(listCategoriesRaw(db).map((category) => category.id));

    for (const item of parsed.items) {
      const resolved: ListItem = {
        ...item,
        categoryId: item.categoryId && knownCategoryIds.has(item.categoryId) ? item.categoryId : null,
      };
      if (item.categoryId && !resolved.categoryId) summary.items.unclassified += 1;
      try {
        if (insertItemRaw(db, resolved)) summary.items.created += 1;
        else summary.items.skipped += 1;
      } catch (error) {
        if (isConstraintViolation(error)) summary.items.skipped += 1;
        else throw error;
      }
    }

    return summary;
  });

  return run();
}
