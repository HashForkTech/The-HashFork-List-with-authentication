'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ResourceFilters } from '@/components/ResourceFilters';
import {
  ALL_CATEGORIES,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  buildFilterParams,
  filtersAreDefault,
  matchesResourceFilter,
  parseFilterParams,
  type ResourceFilterState,
  type SortMode,
} from '@/lib/filtering';
import type { CategoryWithCount } from '@/lib/types';

type DirectoryProps = {
  categories: CategoryWithCount[];
  children: ReactNode;
  emptyMessage?: string;
};

/**
 * Category + "Tested" + search filters and a sort control above the item
 * list, with a live result count below them.
 *
 * The category is picked in a drop-down menu ("All" is selected by default).
 * To its right, two checkboxes control which resources are shown: "Tested"
 * and "Non-tested". Both are checked by default (everything visible);
 * unchecking one hides that group, unchecking both hides the whole list.
 * The "Search" field narrows the list down to the resources whose name,
 * description or comment contain the typed text as a substring
 * (case-insensitive). "Sort" orders the rows by newest, name or rating.
 * All controls combine — they are never independent.
 *
 * The rows themselves are server-rendered (passed as `children`); filtering
 * only toggles the `hidden` attribute of each row through the DOM, and
 * sorting only re-orders those same nodes. Two benefits: almost no
 * JavaScript in the public page payload, and the rows' DOM (including any
 * text) survives filtering untouched. The shared `matchesResourceFilter` is
 * the single source of truth for what is shown.
 *
 * Filters + sort are mirrored into the URL query string (deep-linkable and
 * shared state survives a refresh) and the search box can be focused with
 * the "/" key and cleared with Escape.
 */
export function Directory({
  categories,
  children,
  emptyMessage = 'No resources in this category.',
}: DirectoryProps) {
  const [filters, setFilters] = useState<ResourceFilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortMode>(DEFAULT_SORT);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const initialised = useRef(false);

  /* Restore filters + sort from the URL once on the client (the server always
     renders the default view, so hydration never mismatches). A category id
     that no longer exists (old bookmark) falls back to "All". */
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const fromUrl = parseFilterParams(window.location.search);
    const known =
      fromUrl.filters.categoryId === ALL_CATEGORIES ||
      categories.some((category) => category.id === fromUrl.filters.categoryId);
    if (!known) fromUrl.filters.categoryId = ALL_CATEGORIES;
    setFilters(fromUrl.filters);
    setSort(fromUrl.sort);
  }, [categories]);

  /* Mirror the current view into the URL without a server round-trip. */
  useEffect(() => {
    if (!initialised.current) return;
    const query = buildFilterParams(filters, sort);
    const url = query
      ? `${window.location.pathname}?${query}`
      : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [filters, sort]);

  /* Re-order (sort) then show/hide (filter) the server-rendered rows. */
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;

    const rows = Array.from(
      root.querySelectorAll<HTMLElement>('[data-item-row]'),
    );

    const compare = (a: HTMLElement, b: HTMLElement): number => {
      if (sort === 'name') {
        const nameA = a.dataset.itemName ?? '';
        const nameB = b.dataset.itemName ?? '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      }
      if (sort === 'rating') {
        return Number(b.dataset.itemRating ?? 0) - Number(a.dataset.itemRating ?? 0);
      }
      // 'newest' — newest first, independent of the previous DOM order.
      return (b.dataset.itemCreated ?? '').localeCompare(a.dataset.itemCreated ?? '');
    };
    const ordered = [...rows].sort(compare);
    for (const row of ordered) root.appendChild(row);

    let visible = 0;
    for (const row of ordered) {
      const matches = matchesResourceFilter(
        {
          categoryId: row.dataset.itemCategory ?? '',
          tested: row.dataset.itemTested === 'true',
          searchText: row.dataset.itemSearch ?? '',
        },
        filters,
      );
      row.hidden = !matches;
      if (matches) visible += 1;
    }
    setVisibleCount(visible);
    setTotalCount(rows.length);
  }, [filters, sort]);

  /* "/" focuses the search box unless the user is already typing somewhere. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const input = document.getElementById('search-filter');
      if (input instanceof HTMLInputElement) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const filtersActive = !filtersAreDefault(filters);

  const filterMessage =
    filters.categoryId !== 'all' &&
    filters.showTested &&
    filters.showUntested &&
    filters.query.trim() === ''
      ? emptyMessage
      : 'No resources match the selected filters.';

  return (
    <section aria-label="Resource list">
      <div className="sticky top-14 z-20 -mx-4 bg-ink/90 px-4 py-3 backdrop-blur sm:top-16 sm:mx-0 sm:px-3">
        <ResourceFilters
          categories={categories}
          value={filters}
          onChange={setFilters}
          sort={sort}
          onSortChange={setSort}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-paper/10 pt-2">
        <p aria-live="polite" className="text-xs text-paper/60">
          {visibleCount === null
            ? ''
            : filtersActive || totalCount !== visibleCount
              ? `${visibleCount} of ${totalCount} resources`
              : `${totalCount} resource${totalCount === 1 ? '' : 's'}`}
        </p>
        {filtersActive ? (
          <button type="button" onClick={resetFilters} className="btn btn-ghost text-xs">
            Reset filters
          </button>
        ) : null}
      </div>

      <div ref={listRef} className="mt-1">
        {children}
      </div>

      {visibleCount === 0 ? (
        <p className="px-1 py-16 text-center text-sm text-paper/60">{filterMessage}</p>
      ) : null}
    </section>
  );
}
