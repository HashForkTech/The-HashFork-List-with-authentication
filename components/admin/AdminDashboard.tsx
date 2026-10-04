'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { adminApi } from '@/lib/api/admin-client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { ConfirmDialog, type ConfirmOptions } from '@/components/admin/ConfirmDialog';
import { DataTools } from '@/components/admin/DataTools';
import { ItemForm, type ItemFormHandle } from '@/components/admin/ItemForm';
import { UnsavedChangesDialog } from '@/components/admin/UnsavedChangesDialog';
import { LinkIcons } from '@/components/LinkIcons';
import { ResourceFilters } from '@/components/ResourceFilters';
import { buildSearchText, DEFAULT_FILTERS, filterResources, type ResourceFilterState } from '@/lib/filtering';
import { isNameDirty } from '@/lib/unsaved';
import type { Category, CategoryWithCount, ItemPayload, ListItem } from '@/lib/types';

type Notice = { kind: 'info' | 'error'; text: string };
type PendingConfirm = ConfirmOptions & { onConfirm: () => void | Promise<void> };

/** Which editing form a pending "leave" action is coming from. */
type PendingKind = 'item' | 'category' | 'category-create' | 'title';
type PendingLeave = { kind: PendingKind; run: () => void };

type AdminDashboardProps = {
  initialCategories: CategoryWithCount[];
  initialItems: ListItem[];
  initialSiteTitle: string;
};

function StarRow({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      role="img"
      aria-label={`Rated ${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={
            index < rating
              ? 'h-3 w-3 fill-yellow-400 text-yellow-400'
              : 'h-3 w-3 text-paper/25'
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/**
 * Lightweight content management screen:
 *   Main page  → title of the public page
 *   Categories → create / rename / delete (items are kept on delete)
 *   Items      → create / edit / delete
 *   Data       → export / import backups
 *
 * The "Resources" section carries the same category / Tested / Non-tested /
 * search filter bar as the public list (shared `ResourceFilters` + shared
 * `filterResources`, so both screens behave identically).
 *
 * Leaving an editing form (item, category rename, category creation or the
 * page title) is guarded: with unsaved changes, a dialog forces an explicit
 * Save / Discard / Keep editing choice first. Changes are compared with the
 * currently saved values (see `lib/unsaved.ts`), so reverted edits never
 * block navigation.
 */
export function AdminDashboard({
  initialCategories,
  initialItems,
  initialSiteTitle,
}: AdminDashboardProps) {
  const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories);
  const [items, setItems] = useState<ListItem[]>(initialItems);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [siteTitle, setSiteTitle] = useState(initialSiteTitle);
  const [savedTitle, setSavedTitle] = useState(initialSiteTitle);
  const [titleIssues, setTitleIssues] = useState<string[]>([]);
  const [titleBusy, setTitleBusy] = useState(false);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [categoryIssues, setCategoryIssues] = useState<string[]>([]);

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ListItem | null>(null);
  const [itemIssues, setItemIssues] = useState<string[]>([]);
  const [itemBusy, setItemBusy] = useState(false);
  const [itemFormKey, setItemFormKey] = useState(0);
  const [itemDirty, setItemDirty] = useState(false);

  const [itemFilters, setItemFilters] = useState<ResourceFilterState>(DEFAULT_FILTERS);

  /* -------------------------- unsaved-changes guard ------------------------ */

  const [pendingLeave, setPendingLeaveState] = useState<PendingLeave | null>(null);
  const [unsavedBusy, setUnsavedBusy] = useState(false);
  const pendingLeaveRef = useRef<PendingLeave | null>(null);
  const itemFormRef = useRef<ItemFormHandle | null>(null);

  const setPendingLeave = useCallback((pending: PendingLeave | null) => {
    pendingLeaveRef.current = pending;
    setPendingLeaveState(pending);
  }, []);

  /**
   * Leaves an editing form: runs `run` at once when the form has no unsaved
   * changes, otherwise opens the confirmation dialog first (Save / Discard /
   * Keep editing). The pending action runs after the form is saved or its
   * changes are discarded.
   */
  const attemptLeave = useCallback(
    (kind: PendingKind, dirty: boolean, run: () => void) => {
      if (!dirty) {
        run();
        return;
      }
      setPendingLeave({ kind, run });
    },
    [setPendingLeave],
  );

  const runPendingLeave = useCallback(() => {
    const pending = pendingLeaveRef.current;
    setPendingLeave(null);
    pending?.run();
  }, [setPendingLeave]);

  const categoryDirty =
    editingCategory !== null && isNameDirty(editingCategory.name, renameValue);
  const categoryCreateDirty = showCategoryForm && isNameDirty('', categoryName);
  const titleDirty = isNameDirty(savedTitle, siteTitle);

  async function handleUnsavedSave() {
    const pending = pendingLeaveRef.current;
    if (!pending) return;
    setUnsavedBusy(true);
    let saved = false;
    switch (pending.kind) {
      case 'item':
        saved = (await itemFormRef.current?.submit()) ?? false;
        break;
      case 'category':
        saved = await saveCategoryRename();
        break;
      case 'category-create':
        saved = await saveCategoryCreate();
        break;
      case 'title':
        saved = await saveSiteTitle();
        break;
    }
    setUnsavedBusy(false);
    // Saved → leave; failed → stay in the editor (errors are shown on it).
    if (saved) runPendingLeave();
    else setPendingLeave(null);
  }

  /** Chains the guards so every dirty form is resolved before navigating. */
  const guardNavigation = useCallback(
    (proceed: () => void) => {
      attemptLeave('item', showItemForm && itemDirty, () => {
        attemptLeave('category', categoryDirty, () => {
          attemptLeave('category-create', categoryCreateDirty, () => {
            attemptLeave('title', titleDirty, proceed);
          });
        });
      });
    },
    [attemptLeave, showItemForm, itemDirty, categoryDirty, categoryCreateDirty, titleDirty],
  );

  // Browser-level leaving (tab close, reload, full-page link) can only use the
  // native prompt — it still protects the typed data from silent loss.
  useEffect(() => {
    const anyDirty =
      (showItemForm && itemDirty) || categoryDirty || categoryCreateDirty || titleDirty;
    if (!anyDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [showItemForm, itemDirty, categoryDirty, categoryCreateDirty, titleDirty]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const refresh = useCallback(async () => {
    const [categoryResult, itemResult] = await Promise.all([
      adminApi.listCategories(),
      adminApi.listItems(),
    ]);
    if (categoryResult.ok) setCategories(categoryResult.data.categories);
    if (itemResult.ok) setItems(itemResult.data.items);
  }, []);

  /* ------------------------------- main page ------------------------------ */

  async function saveSiteTitle(): Promise<boolean> {
    const title = siteTitle.trim();
    if (!title) {
      setTitleIssues(['The page title is required.']);
      return false;
    }
    setTitleBusy(true);
    setTitleIssues([]);
    const result = await adminApi.updateSettings(title);
    setTitleBusy(false);
    if (!result.ok) {
      setTitleIssues(result.issues?.length ? result.issues : [result.message]);
      setNotice({ kind: 'error', text: result.message });
      return false;
    }
    setSiteTitle(result.data.settings.siteTitle);
    setSavedTitle(result.data.settings.siteTitle);
    setNotice({ kind: 'info', text: 'Page title updated.' });
    return true;
  }

  async function handleSaveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSiteTitle();
  }

  /* ------------------------------- categories ------------------------------ */

  async function createCategory(name: string): Promise<Category | null> {
    setCategoryIssues([]);
    const result = await adminApi.createCategory(name);
    if (!result.ok) {
      setCategoryIssues(result.issues?.length ? result.issues : [result.message]);
      setNotice({ kind: 'error', text: result.message });
      return null;
    }
    await refresh();
    setNotice({ kind: 'info', text: `Category "${result.data.category.name}" created.` });
    return result.data.category;
  }

  async function saveCategoryCreate(): Promise<boolean> {
    const name = categoryName.trim();
    if (!name) {
      setCategoryIssues(['The category name is required.']);
      return false;
    }
    const created = await createCategory(name);
    if (!created) return false;
    setCategoryName('');
    setShowCategoryForm(false);
    return true;
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCategoryCreate();
  }

  async function saveCategoryRename(): Promise<boolean> {
    const category = editingCategory;
    if (!category) return false;
    const name = renameValue.trim();
    if (!name) {
      setCategoryIssues(['The category name is required.']);
      return false;
    }
    const result = await adminApi.updateCategory(category.id, name);
    if (!result.ok) {
      setNotice({ kind: 'error', text: result.message });
      return false;
    }
    setEditingCategory(null);
    await refresh();
    setNotice({ kind: 'info', text: 'Category renamed.' });
    return true;
  }

  async function handleRenameCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCategoryRename();
  }

  function closeCategoryEditor() {
    setEditingCategory(null);
    setCategoryIssues([]);
  }

  function openCategoryEditor(category: Category) {
    setEditingCategory(category);
    setRenameValue(category.name);
    setCategoryIssues([]);
  }

  function askDeleteCategory(category: CategoryWithCount) {
    const count = category.itemCount;
    setConfirm({
      title: 'Delete this category?',
      confirmLabel: 'Delete category',
      message: (
        <>
          <p>
            The category “{category.name}” will be deleted. This action cannot easily be undone.
          </p>
          {count > 0 ? (
            <p className="mt-2 text-paper/55">
              Its {count} resource{count > 1 ? 's' : ''} will be <strong>kept</strong>, but will
              lose their category.
            </p>
          ) : null}
        </>
      ),
      onConfirm: async () => {
        setConfirmBusy(true);
        const result = await adminApi.deleteCategory(category.id);
        setConfirmBusy(false);
        setConfirm(null);
        if (!result.ok) {
          setNotice({ kind: 'error', text: result.message });
          return;
        }
        await refresh();
        setNotice({
          kind: 'info',
          text:
            result.data.detachedItems > 0
              ? `Category deleted — ${result.data.detachedItems} resource(s) kept without a category.`
              : 'Category deleted.',
        });
      },
    });
  }

  /* --------------------------------- items -------------------------------- */

  function closeItemForm() {
    setShowItemForm(false);
    setEditingItem(null);
    setItemIssues([]);
    setItemDirty(false);
  }

  function openItemForm(item: ListItem | null, scroll: boolean) {
    setEditingItem(item);
    setItemIssues([]);
    setItemDirty(false);
    // A fresh key remounts the form so it always starts from saved values.
    setItemFormKey((key) => key + 1);
    setShowItemForm(true);
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSaveItem(payload: ItemPayload): Promise<boolean> {
    setItemBusy(true);
    setItemIssues([]);
    const wasEditing = editingItem;
    const result = wasEditing
      ? await adminApi.updateItem(wasEditing.id, payload)
      : await adminApi.createItem(payload);
    setItemBusy(false);

    if (!result.ok) {
      setItemIssues(result.issues?.length ? result.issues : [result.message]);
      return false;
    }
    closeItemForm();
    await refresh();
    setNotice({
      kind: 'info',
      text: wasEditing ? 'Resource updated.' : 'Resource added.',
    });
    return true;
  }

  function askDeleteItem(item: ListItem) {
    const label = item.name?.trim() || 'this unnamed resource';
    setConfirm({
      title: 'Delete this resource?',
      confirmLabel: 'Delete',
      message: (
        <>
          <p>
            “{label}” will be permanently removed from the list.
          </p>
          <p className="mt-2 text-paper/60">
            This action cannot be undone (except by restoring a backup).
          </p>
        </>
      ),
      onConfirm: async () => {
        setConfirmBusy(true);
        const result = await adminApi.deleteItem(item.id);
        setConfirmBusy(false);
        setConfirm(null);
        if (!result.ok) {
          setNotice({ kind: 'error', text: result.message });
          return;
        }
        if (editingItem?.id === item.id) closeItemForm();
        await refresh();
        setNotice({ kind: 'info', text: 'Resource deleted.' });
      },
    });
  }

  /** Which resources pass the combined category / status / search filters. */
  const filteredItems = useMemo(() => {
    const searchable = items.map((item) => ({ ...item, searchText: buildSearchText(item) }));
    return filterResources(searchable, itemFilters);
  }, [items, itemFilters]);

  /* --------------------------------- render -------------------------------- */

  return (
    <AdminLayout guardLeave={guardNavigation}>
      <main id="main-content" className="mx-auto w-full max-w-content px-4 pb-24 sm:px-6">
        <div className="py-6">
          <p className="section-title">Administration</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-paper">
            Dashboard
          </h1>
          <p className="mt-1.5 text-xs text-paper/60">
            Password-free area (no SSL certificate required). If this instance is exposed to
            untrusted people, protect /admin and /api at the server level — see README.
          </p>
        </div>

        {notice ? (
          <p
            role="status"
            aria-live="polite"
            className={`rounded-sm border px-3.5 py-2.5 text-sm ${
              notice.kind === 'error'
                ? 'border-paper/30 bg-paper/5 text-paper/85'
                : 'border-paper/10 bg-paper/[0.03] text-paper/65'
            }`}
          >
            {notice.kind === 'error' ? '⚠ ' : '✓ '}
            {notice.text}
          </p>
        ) : null}

        {/* ------------------------------ main page ---------------------------- */}
        <section aria-labelledby="main-page-title" className="mt-12">
          <h2 id="main-page-title" className="section-title">
            Main page
          </h2>
          <form onSubmit={(event) => void handleSaveTitle(event)} className="panel mt-4 p-4">
            <label className="field-label" htmlFor="site-title">
              Page title
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="site-title"
                className="field-input min-w-0 flex-1"
                maxLength={100}
                placeholder="The HashFork List"
                value={siteTitle}
                onChange={(event) => {
                  setSiteTitle(event.target.value);
                  setTitleIssues([]);
                }}
              />
              <button type="submit" className="btn btn-primary" disabled={titleBusy}>
                {titleBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="field-hint">
              Title of the main page: displayed centered in its header and used as the browser
              tab title. Default: “The HashFork List”.
            </p>
            {titleIssues.length > 0 ? (
              <ul role="alert" className="field-error mt-2 space-y-1">
                {titleIssues.map((issue) => (
                  <li key={issue}>⚠ {issue}</li>
                ))}
              </ul>
            ) : null}
          </form>
        </section>

        {/* ------------------------------ categories ---------------------------- */}
        <section aria-labelledby="categories-title" className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="categories-title" className="section-title">
              Categories
            </h2>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const next = !showCategoryForm;
                attemptLeave('category-create', categoryCreateDirty, () => {
                  setShowCategoryForm(next);
                  if (!next) setCategoryName('');
                  setCategoryIssues([]);
                });
              }}
              aria-expanded={showCategoryForm}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New category
            </button>
          </div>

          {showCategoryForm ? (
            <form onSubmit={(event) => void handleCreateCategory(event)} className="panel mt-4 p-4">
              <label className="field-label" htmlFor="category-name">
                Category name
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="category-name"
                  className="field-input min-w-0 flex-1"
                  maxLength={60}
                  autoFocus
                  placeholder="LLMs, Tools, Applications…"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  Add
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    attemptLeave('category-create', categoryCreateDirty, () => {
                      setShowCategoryForm(false);
                      setCategoryName('');
                      setCategoryIssues([]);
                    })
                  }
                >
                  Cancel
                </button>
              </div>
              {categoryIssues.length > 0 ? (
                <ul role="alert" className="field-error space-y-1">
                  {categoryIssues.map((issue) => (
                    <li key={issue}>⚠ {issue}</li>
                  ))}
                </ul>
              ) : null}
            </form>
          ) : null}

          {categories.length === 0 ? (
            <p className="panel mt-4 px-4 py-8 text-center text-sm text-paper/60">
              No categories yet. The public list also works without categories.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
                >
                  {editingCategory?.id === category.id ? (
                    <form
                      onSubmit={(event) => void handleRenameCategory(event)}
                      className="flex w-full flex-wrap gap-2"
                    >
                      <label className="sr-only" htmlFor={`rename-${category.id}`}>
                        New category name
                      </label>
                      <input
                        id={`rename-${category.id}`}
                        className="field-input min-w-0 flex-1"
                        maxLength={60}
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                      <button type="submit" className="btn btn-primary">
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          attemptLeave('category', categoryDirty, closeCategoryEditor)
                        }
                      >
                        Cancel
                      </button>
                      {categoryIssues.length > 0 ? (
                        <ul role="alert" className="field-error w-full space-y-1">
                          {categoryIssues.map((issue) => (
                            <li key={issue}>⚠ {issue}</li>
                          ))}
                        </ul>
                      ) : null}
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 break-words text-sm font-medium text-paper">
                        {category.name}
                      </span>
                      <span className="shrink-0 text-xs text-paper/60">
                        {category.itemCount} resource{category.itemCount === 1 ? '' : 's'}
                      </span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            attemptLeave('category', categoryDirty, () =>
                              openCategoryEditor(category),
                            )
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Rename
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => askDeleteCategory(category)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* -------------------------------- items ------------------------------- */}
        <section aria-labelledby="items-title" className="mt-14">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <h2 id="items-title" className="section-title">
              Resources
            </h2>
            <ResourceFilters
              categories={categories}
              value={itemFilters}
              onChange={setItemFilters}
              idPrefix="admin-"
            />
            <button
              type="button"
              className="btn ml-auto"
              onClick={() => {
                const next = !showItemForm;
                attemptLeave('item', showItemForm && itemDirty, () => {
                  if (next) openItemForm(null, false);
                  else closeItemForm();
                });
              }}
              aria-expanded={showItemForm}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a resource
            </button>
          </div>

          {showItemForm ? (
            <ItemForm
              key={`${editingItem?.id ?? 'new'}-${itemFormKey}`}
              ref={itemFormRef}
              categories={categories}
              initial={editingItem}
              submitting={itemBusy}
              serverIssues={itemIssues}
              onCreateCategory={createCategory}
              onSubmit={handleSaveItem}
              onDirtyChange={setItemDirty}
              onCancel={() => attemptLeave('item', itemDirty, closeItemForm)}
            />
          ) : null}

          {items.length === 0 ? (
            <p className="panel mt-4 px-4 py-8 text-center text-sm text-paper/60">
              No resources added yet.
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="panel mt-4 px-4 py-8 text-center text-sm text-paper/60">
              No resources match the selected filters.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {filteredItems.map((item) => {
                const category = item.categoryId
                  ? categoryById.get(item.categoryId)
                  : undefined;
                const rating = Math.min(5, Math.max(0, Math.round(item.rating ?? 0)));
                return (
                  <li
                    key={item.id}
                    className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <h3 className="min-w-0 break-words text-base font-medium tracking-tight text-paper">
                          {item.name?.trim() || (
                            <span className="font-normal italic text-paper/55">
                              Unnamed resource
                            </span>
                          )}
                        </h3>
                        {category ? (
                          <span className="shrink-0 rounded-sm border border-paper/15 px-2 py-0.5 text-[11px] text-paper/65">
                            {category.name}
                          </span>
                        ) : null}
                        {item.tested ? (
                          <span className="shrink-0 rounded-sm border border-paper/15 px-2 py-0.5 text-[11px] text-paper/65">
                            Tested
                          </span>
                        ) : null}
                        {rating > 0 ? <StarRow rating={rating} /> : null}
                      </div>
                      {item.description?.trim() ? (
                        <p className="mt-1.5 line-clamp-2 max-w-2xl break-words text-sm leading-relaxed text-paper/65">
                          {item.description}
                        </p>
                      ) : null}
                      {item.comment?.trim() ? (
                        <p className="mt-1.5 line-clamp-2 max-w-2xl break-words text-xs leading-relaxed text-paper/60">
                          💬 {item.comment}
                        </p>
                      ) : null}
                      <div className="mt-2">
                        <LinkIcons item={item} />
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          attemptLeave('item', showItemForm && itemDirty, () =>
                            openItemForm(item, true),
                          )
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() =>
                          attemptLeave(
                            'item',
                            showItemForm && itemDirty && editingItem?.id === item.id,
                            () => askDeleteItem(item),
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <DataTools onImported={() => void refresh()} onNotice={setNotice} />
      </main>

      {confirm ? (
        <ConfirmDialog
          options={confirm}
          busy={confirmBusy}
          onConfirm={() => void confirm.onConfirm()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {pendingLeave ? (
        <UnsavedChangesDialog
          busy={unsavedBusy}
          onSave={() => void handleUnsavedSave()}
          onDiscard={runPendingLeave}
          onStay={() => setPendingLeave(null)}
        />
      ) : null}
    </AdminLayout>
  );
}
