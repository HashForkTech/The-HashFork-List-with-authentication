/**
 * Shared domain types. These are the only shapes that cross the boundary
 * between the storage layer, the API and the UI, which keeps a future
 * migration (e.g. to PostgreSQL) contained behind the repositories.
 */

export type Category = {
  id: string;
  name: string;
  createdAt: string;
};

export type CategoryWithCount = Category & {
  itemCount: number;
};

export type ListItem = {
  id: string;
  categoryId?: string | null;
  name?: string | null;
  description?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  huggingFaceUrl?: string | null;
  youtubeUrl?: string | null;
  /** Whether the admin marked the resource as tested. */
  tested: boolean;
  /**
   * Date of the "Tested" check (ISO timestamp): stamped automatically when the
   * admin checks the "Tested" checkbox, cleared when it is unchecked.
   */
  testedAt?: string | null;
  /** Star notation from 0 to 5 (0 = not rated). */
  rating: number;
  /** Optional admin comment (shown as a hover popup on the public list). */
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Writable subset of a list item — every field is optional. */
export type ItemPayload = {
  categoryId?: string | null;
  name?: string | null;
  description?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  huggingFaceUrl?: string | null;
  youtubeUrl?: string | null;
  tested?: boolean | null;
  /**
   * Explicit date of the "Tested" check (ISO timestamp). When omitted and the
   * resource becomes tested, the server stamps the check date itself.
   */
  testedAt?: string | null;
  rating?: number | null;
  comment?: string | null;
};

export const BACKUP_FORMAT = 'the-hashfork-list/backup';
export const BACKUP_VERSION = 3;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  categories: Category[];
  items: ListItem[];
};

/** Site-wide settings managed from the admin area. */
export type SiteSettings = {
  /** Title of the main page (header + browser tab). */
  siteTitle: string;
};

/** The title the site ships with (until the admin changes it). */
export const DEFAULT_SITE_TITLE = 'The HashFork List';
