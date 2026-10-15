'use client';

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type FormEvent,
  type Ref,
} from 'react';
import { Star } from 'lucide-react';
import type { Category, CategoryWithCount, ItemPayload, ListItem } from '@/lib/types';
import { formatOsDate } from '@/lib/format';
import {
  isItemDraftDirty,
  itemDraftFromForm,
  itemDraftFromItem,
  NEW_CATEGORY_SELECTION,
} from '@/lib/unsaved';
import { normalizeUrl } from '@/lib/validation/url';

const URL_FIELDS = [
  { key: 'websiteUrl', label: 'Website', placeholder: 'https://example.com' },
  { key: 'githubUrl', label: 'GitHub link', placeholder: 'https://github.com/example/project' },
  {
    key: 'huggingFaceUrl',
    label: 'Hugging Face link',
    placeholder: 'https://huggingface.co/example/model',
  },
  { key: 'youtubeUrl', label: 'YouTube link', placeholder: 'https://youtube.com/watch?v=…' },
] as const;

type UrlFieldKey = (typeof URL_FIELDS)[number]['key'];
type FieldKey = 'categoryId' | 'name' | 'description' | 'comment' | 'githubStars' | UrlFieldKey;
type Fields = Record<FieldKey, string>;

const NEW_CATEGORY_VALUE = NEW_CATEGORY_SELECTION;

/** Imperative handle used by the unsaved-changes dialog to save the form. */
export type ItemFormHandle = {
  /** Runs validation + submission; resolves `true` only when the save worked. */
  submit: () => Promise<boolean>;
};

type ItemFormProps = {
  categories: CategoryWithCount[];
  initial?: ListItem | null;
  submitting: boolean;
  serverIssues: string[];
  onCreateCategory: (name: string) => Promise<Category | null>;
  onSubmit: (payload: ItemPayload) => void | Promise<boolean | void>;
  onCancel: () => void;
  /** Reports whether the form holds unsaved changes (compared to `initial`). */
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<ItemFormHandle>;
};

function initialFields(initial?: ListItem | null): Fields {
  return {
    categoryId: initial?.categoryId ?? '',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    comment: initial?.comment ?? '',
    websiteUrl: initial?.websiteUrl ?? '',
    githubUrl: initial?.githubUrl ?? '',
    huggingFaceUrl: initial?.huggingFaceUrl ?? '',
    youtubeUrl: initial?.youtubeUrl ?? '',
    githubStars: initial?.githubStars?.toString() ?? '',
  };
}

/**
 * Create/edit form for a list item. EVERY field is optional — an item can be
 * saved with a single field, or even completely empty (with a clear notice).
 * URLs are validated and normalized before submission.
 *
 * Review metadata: a "Tested" checkbox (the date of the check is stamped and
 * shown as "Tested on …" on the public list), a GitHub star count and a comment
 * (shown as a hover popup next to "Comment" on the public list).
 */
export function ItemForm({
  categories,
  initial,
  submitting,
  serverIssues,
  onCreateCategory,
  onSubmit,
  onCancel,
  onDirtyChange,
  ref,
}: ItemFormProps) {
  const [fields, setFields] = useState<Fields>(() => initialFields(initial));
  const [tested, setTested] = useState<boolean>(() => Boolean(initial?.tested));
  // Date of the "Tested" check in this form session: `undefined` = the checkbox
  // was not touched (keep the saved check date), otherwise the moment the admin
  // checked it (`null` when it was unchecked again).
  const [testedCheckedAt, setTestedCheckedAt] = useState<string | null | undefined>(undefined);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

  const isEditing = Boolean(initial);
  const isEmpty =
    fields.name.trim() === '' &&
    fields.description.trim() === '' &&
    fields.comment.trim() === '' &&
    fields.categoryId === '' &&
    fields.websiteUrl.trim() === '' &&
    fields.githubUrl.trim() === '' &&
    fields.huggingFaceUrl.trim() === '' &&
    fields.youtubeUrl.trim() === '' &&
    !tested &&
    fields.githubStars.trim() === '';

  // Unsaved-changes detection: the current values are normalized exactly like
  // the save path normalizes them, then compared with the loaded values, so
  // reverted edits (or edits that would store the same value) are not "dirty".
  const savedDraft = useMemo(() => itemDraftFromItem(initial), [initial]);
  const currentDraft = useMemo(
    () =>
      itemDraftFromForm({
        categoryId: fields.categoryId,
        newCategoryName,
        name: fields.name,
        description: fields.description,
        comment: fields.comment,
        websiteUrl: fields.websiteUrl,
        githubUrl: fields.githubUrl,
        huggingFaceUrl: fields.huggingFaceUrl,
        youtubeUrl: fields.youtubeUrl,
        tested,
        githubStars: fields.githubStars,
      }),
    [fields, newCategoryName, tested],
  );
  const dirty = isItemDraftDirty(savedDraft, currentDraft);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Re-bound on every render so the handle always sees the current form state.
  useImperativeHandle(ref, () => ({ submit: () => save() }));

  function setField(key: FieldKey, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateUrlField(key: UrlFieldKey): boolean {
    const value = fields[key].trim();
    if (value && !normalizeUrl(value)) {
      setErrors((current) => ({
        ...current,
        [key]: 'Invalid URL (e.g. https://example.com).',
      }));
      return false;
    }
    setErrors((current) => ({ ...current, [key]: undefined }));
    return true;
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setCategoryBusy(true);
    const created = await onCreateCategory(name);
    setCategoryBusy(false);
    if (created) {
      setNewCategoryName('');
      setCreatingCategory(false);
      setFields((current) => ({ ...current, categoryId: created.id }));
    }
  }

  /** Validates and submits; resolves `true` when the save actually succeeded. */
  async function save(): Promise<boolean> {
    const nextErrors: Partial<Record<FieldKey, string>> = {};
    const githubStars = fields.githubStars.trim() === '' ? null : Number(fields.githubStars);
    if (githubStars !== null && (!Number.isSafeInteger(githubStars) || githubStars < 0)) {
      nextErrors.githubStars = 'Enter a non-negative whole number of GitHub stars.';
    }
    for (const urlField of URL_FIELDS) {
      const value = fields[urlField.key].trim();
      if (value && !normalizeUrl(value)) {
        nextErrors[urlField.key] = 'Invalid URL (e.g. https://example.com).';
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return false;

    let categoryId: string | null = null;
    if (fields.categoryId === NEW_CATEGORY_VALUE) {
      const name = newCategoryName.trim();
      if (name) {
        const created = await onCreateCategory(name);
        categoryId = created?.id ?? null;
      }
    } else if (fields.categoryId) {
      categoryId = fields.categoryId;
    }

    const payload: ItemPayload = {
      categoryId,
      name: fields.name.trim() ? fields.name.trim() : null,
      description: fields.description.trim() ? fields.description.trim() : null,
      comment: fields.comment.trim() ? fields.comment.trim() : null,
      websiteUrl: fields.websiteUrl.trim() ? normalizeUrl(fields.websiteUrl) : null,
      githubUrl: fields.githubUrl.trim() ? normalizeUrl(fields.githubUrl) : null,
      huggingFaceUrl: fields.huggingFaceUrl.trim() ? normalizeUrl(fields.huggingFaceUrl) : null,
      youtubeUrl: fields.youtubeUrl.trim() ? normalizeUrl(fields.youtubeUrl) : null,
      tested,
      testedAt: testedCheckedAt,
      githubStars,
    };

    const result = await onSubmit(payload);
    return result !== false;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="panel mt-4 p-4 sm:p-5"
      aria-label={isEditing ? 'Edit resource' : 'Add a resource'}
      noValidate
    >
      <h3 className="text-base font-semibold tracking-tight text-paper">
        {isEditing ? 'Edit resource' : 'Add a resource'}
      </h3>
      <p className="field-hint">
        All fields are optional: fill in only what is useful.
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="item-category">
            Category
          </label>
          <select
            id="item-category"
            className="field-input"
            value={fields.categoryId}
            onChange={(event) => {
              const value = event.target.value;
              setCreatingCategory(value === NEW_CATEGORY_VALUE);
              setField('categoryId', value);
            }}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            <option value={NEW_CATEGORY_VALUE}>＋ New category…</option>
          </select>

          {creatingCategory ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="item-new-category">
                New category name
              </label>
              <input
                id="item-new-category"
                className="field-input min-w-0 flex-1"
                placeholder="Category name"
                maxLength={60}
                autoFocus
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
              />
              <button
                type="button"
                className="btn"
                onClick={handleCreateCategory}
                disabled={categoryBusy || newCategoryName.trim() === ''}
              >
                {categoryBusy ? 'Creating…' : 'Create'}
              </button>
            </div>
          ) : null}
        </div>

        <div>
          <label className="field-label" htmlFor="item-name">
            Name
          </label>
          <input
            id="item-name"
            className="field-input"
            placeholder="Ollama"
            maxLength={200}
            value={fields.name}
            onChange={(event) => setField('name', event.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="item-description">
            Description
          </label>
          <textarea
            id="item-description"
            className="field-input"
            rows={3}
            maxLength={4000}
            placeholder="Runs large language models locally through a command-line interface."
            value={fields.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </div>

        {URL_FIELDS.map((urlField) => (
          <div key={urlField.key}>
            <label className="field-label" htmlFor={`item-${urlField.key}`}>
              {urlField.label}
            </label>
            <input
              id={`item-${urlField.key}`}
              type="text"
              inputMode="url"
              className="field-input"
              placeholder={urlField.placeholder}
              maxLength={2048}
              value={fields[urlField.key]}
              onChange={(event) => setField(urlField.key, event.target.value)}
              onBlur={() => validateUrlField(urlField.key)}
              aria-invalid={Boolean(errors[urlField.key])}
            />
            {errors[urlField.key] ? (
              <p className="field-error">⚠ {errors[urlField.key]}</p>
            ) : (
              <p className="field-hint">The icon is shown only when the URL is filled in.</p>
            )}
          </div>
        ))}

        <div>
          <label className="field-label flex items-center gap-1.5" htmlFor="item-github-stars">
            GitHub
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" aria-hidden="true" />
            <span className="sr-only">stars</span>
          </label>
          <input
            id="item-github-stars"
            aria-label="GitHub stars"
            type="number"
            min={0}
            max={Number.MAX_SAFE_INTEGER}
            step={1}
            className="field-input"
            placeholder="Number of stars"
            value={fields.githubStars}
            onChange={(event) => setField('githubStars', event.target.value)}
            aria-invalid={Boolean(errors.githubStars)}
            aria-describedby="item-github-stars-hint"
          />
          <p id="item-github-stars-hint" className={errors.githubStars ? 'field-error' : 'field-hint'}>
            {errors.githubStars ?? 'Enter the number of GitHub stars. Leave blank to hide it.'}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2.5 text-sm text-paper/85">
            <input
              id="item-tested"
              type="checkbox"
              className="h-4 w-4 accent-paper/70"
              checked={tested}
              onChange={(event) => {
                const checked = event.target.checked;
                setTested(checked);
                // Stamp the date of the check (cleared again when unchecked).
                setTestedCheckedAt(checked ? new Date().toISOString() : null);
              }}
            />
            Tested
          </label>
          <p className="field-hint">
            Check this box when the resource has been tested. The date of the check is saved and
            shown on the public list as “Tested on …”.
            {initial?.testedAt ? ` Last checked on ${formatOsDate(initial.testedAt)}.` : ''}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="item-comment">
            Comment
          </label>
          <textarea
            id="item-comment"
            className="field-input"
            rows={3}
            maxLength={2000}
            placeholder="Short note shown when hovering “Comment” on the public list."
            value={fields.comment}
            onChange={(event) => setField('comment', event.target.value)}
          />
        </div>
      </div>

      {isEmpty ? (
        <p className="field-hint mt-5">
          ⓘ All fields are empty: this resource will be saved without a name, description,
          category, link, GitHub star count or comment.
        </p>
      ) : null}

      {serverIssues.length > 0 ? (
        <ul role="alert" className="field-error mt-4 space-y-1">
          {serverIssues.map((issue) => (
            <li key={issue}>⚠ {issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}
