import type { DB } from '../client';
import { DEFAULT_SITE_TITLE, type SiteSettings } from '../../types';

/**
 * Site settings stored as simple key/value rows. Missing keys fall back to the
 * shipped defaults, so no seeding step is required.
 */

const SITE_TITLE_KEY = 'site_title';

type SettingRow = {
  key: string;
  value: string;
};

function getValue(db: DB, key: string): string | null {
  const row = db.prepare('SELECT key, value FROM settings WHERE key = ?').get(key) as
    | SettingRow
    | undefined;
  return row ? row.value : null;
}

export function getSiteTitle(db: DB): string {
  return getValue(db, SITE_TITLE_KEY) ?? DEFAULT_SITE_TITLE;
}

export function getSettings(db: DB): SiteSettings {
  return { siteTitle: getSiteTitle(db) };
}

export function setSiteTitle(db: DB, title: string): SiteSettings {
  const trimmed = title.trim();
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(SITE_TITLE_KEY, trimmed);
  return { siteTitle: trimmed };
}
