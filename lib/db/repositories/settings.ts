import type { Store } from '../store';
import { DEFAULT_SITE_TITLE, type SiteSettings } from '../../types';

const SITE_TITLE_KEY = 'site_title';

export async function getSiteTitle(db: Store): Promise<string> {
  const row = await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [SITE_TITLE_KEY]);
  return row?.value ?? DEFAULT_SITE_TITLE;
}

export async function getSettings(db: Store): Promise<SiteSettings> {
  return { siteTitle: await getSiteTitle(db) };
}

export async function setSiteTitle(db: Store, title: string): Promise<SiteSettings> {
  const trimmed = title.trim();
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [SITE_TITLE_KEY, trimmed],
  );
  return { siteTitle: trimmed };
}
