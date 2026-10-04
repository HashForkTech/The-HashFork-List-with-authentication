/**
 * "Unsaved changes" detection for the admin editing forms — pure TypeScript
 * (safe for client bundles and unit tests).
 *
 * A form is considered dirty when the values it would PERSIST differ from the
 * currently loaded/saved values. The comparison works on normalized drafts
 * (text is trimmed and URLs are normalized, exactly like the save path does),
 * so changes that were typed and then reverted — or that would round-trip to
 * the same stored value — never trigger a false warning.
 */

import type { ListItem } from '@/lib/types';
import { normalizeUrl } from '@/lib/validation/url';

/**
 * Normalized snapshot of every user-editable resource field. `categoryId`
 * holds the effective category (`''` = none); a brand-new category typed
 * inline resolves to a pseudo value such as `'__new__:Name'`.
 */
export type ItemDraft = {
  categoryId: string;
  name: string;
  description: string;
  comment: string;
  websiteUrl: string;
  githubUrl: string;
  huggingFaceUrl: string;
  youtubeUrl: string;
  tested: boolean;
  rating: number;
};

/** Sentinel used by the category drop-down for the "＋ New category…" option. */
export const NEW_CATEGORY_SELECTION = '__new__';

export const EMPTY_ITEM_DRAFT: ItemDraft = {
  categoryId: '',
  name: '',
  description: '',
  comment: '',
  websiteUrl: '',
  githubUrl: '',
  huggingFaceUrl: '',
  youtubeUrl: '',
  tested: false,
  rating: 0,
};

/** Raw values as currently held by the resource form. */
export type ItemDraftInput = {
  categoryId: string;
  /** Name typed in the "＋ New category…" inline field (when it is selected). */
  newCategoryName?: string;
  name: string;
  description: string;
  comment: string;
  websiteUrl: string;
  githubUrl: string;
  huggingFaceUrl: string;
  youtubeUrl: string;
  tested: boolean;
  rating: number;
};

/**
 * Effective category of the form: the selection itself, or a pseudo value
 * naming the inline new category (an empty name behaves like "no category",
 * exactly like saving would).
 */
export function resolveDraftCategoryId(selected: string, newCategoryName: string): string {
  if (selected !== NEW_CATEGORY_SELECTION) return selected ?? '';
  const name = (newCategoryName ?? '').trim();
  return name ? `${NEW_CATEGORY_SELECTION}:${name}` : '';
}

/** Saves trim text and clear empty fields — the draft does the same. */
function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Saves normalize URLs; invalid input falls back to the trimmed raw value. */
function normalizeUrlValue(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return normalizeUrl(raw) ?? raw;
}

function clampRating(value: number | null | undefined): number {
  return Math.min(5, Math.max(0, Math.round(value ?? 0)));
}

/** Builds the comparable draft of the values currently typed in a form. */
export function itemDraftFromForm(input: ItemDraftInput): ItemDraft {
  return {
    categoryId: resolveDraftCategoryId(input.categoryId, input.newCategoryName ?? ''),
    name: normalizeText(input.name),
    description: normalizeText(input.description),
    comment: normalizeText(input.comment),
    websiteUrl: normalizeUrlValue(input.websiteUrl),
    githubUrl: normalizeUrlValue(input.githubUrl),
    huggingFaceUrl: normalizeUrlValue(input.huggingFaceUrl),
    youtubeUrl: normalizeUrlValue(input.youtubeUrl),
    tested: Boolean(input.tested),
    rating: clampRating(input.rating),
  };
}

/** Builds the comparable draft of a saved resource (or of an empty form). */
export function itemDraftFromItem(item?: ListItem | null): ItemDraft {
  return itemDraftFromForm({
    categoryId: item?.categoryId ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    comment: item?.comment ?? '',
    websiteUrl: item?.websiteUrl ?? '',
    githubUrl: item?.githubUrl ?? '',
    huggingFaceUrl: item?.huggingFaceUrl ?? '',
    youtubeUrl: item?.youtubeUrl ?? '',
    tested: Boolean(item?.tested),
    rating: item?.rating ?? 0,
  });
}

/**
 * True when the form holds changes that a save would persist compared to the
 * loaded values. Reverted edits (or edits that normalize to the stored value)
 * are NOT changes.
 */
export function isItemDraftDirty(saved: ItemDraft, draft: ItemDraft): boolean {
  return (
    saved.categoryId !== draft.categoryId ||
    saved.name !== draft.name ||
    saved.description !== draft.description ||
    saved.comment !== draft.comment ||
    saved.websiteUrl !== draft.websiteUrl ||
    saved.githubUrl !== draft.githubUrl ||
    saved.huggingFaceUrl !== draft.huggingFaceUrl ||
    saved.youtubeUrl !== draft.youtubeUrl ||
    saved.tested !== draft.tested ||
    saved.rating !== draft.rating
  );
}

/** Same idea for single-line name fields (category name, page title). */
export function isNameDirty(saved: string | null | undefined, draft: string): boolean {
  return normalizeText(saved) !== normalizeText(draft);
}
