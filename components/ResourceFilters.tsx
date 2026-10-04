'use client';

import type { CategoryWithCount } from '@/lib/types';
import {
  ALL_CATEGORIES,
  SORT_OPTIONS,
  type ResourceFilterState,
  type SortMode,
} from '@/lib/filtering';

type ResourceFiltersProps = {
  categories: CategoryWithCount[];
  value: ResourceFilterState;
  onChange: (next: ResourceFilterState) => void;
  /**
   * Prefix for the control ids so several filter bars can coexist on one
   * page. Empty (the default) keeps the original `category-filter` id.
   */
  idPrefix?: string;
  /** When given, a "Sort" drop-down is rendered next to the search field. */
  sort?: SortMode;
  onSortChange?: (next: SortMode) => void;
};

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'Newest first',
  name: 'Name (A–Z)',
  rating: 'Best rated',
};

/**
 * The resource filter bar, shared by the public list and the admin dashboard:
 * a category drop-down ("All" by default), the "Tested" / "Non-tested"
 * checkboxes, the substring "Search" field (Esc clears it) and — when the
 * caller passes `sort` — a "Sort" drop-down. All controls combine: a resource
 * is listed only when it passes every active filter.
 *
 * On phones the bar stays two rows tall: category + search share the first
 * row (the placeholder replaces the visible "Search" label there), and the
 * checkboxes + sort take the second. The DOM order never changes — only the
 * visual order does (via flex `order`), so keyboard flow and the tests' DOM
 * assertions stay intact. Very narrow screens simply stack everything.
 */
export function ResourceFilters({
  categories,
  value,
  onChange,
  idPrefix = '',
  sort,
  onSortChange,
}: ResourceFiltersProps) {
  const update = (patch: Partial<ResourceFilterState>) => onChange({ ...value, ...patch });

  const categorySelectId = `${idPrefix}category-filter`;
  const testedId = `${idPrefix}tested-filter`;
  const untestedId = `${idPrefix}untested-filter`;
  const searchId = `${idPrefix}search-filter`;
  const sortSelectId = `${idPrefix}sort-filter`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="order-1 min-w-0 grow basis-40 sm:order-none sm:grow-0 sm:basis-auto">
        <label htmlFor={categorySelectId} className="sr-only">
          Filter by category
        </label>
        <select
          id={categorySelectId}
          value={value.categoryId}
          onChange={(event) => update({ categoryId: event.target.value })}
          className="w-full cursor-pointer rounded-sm border border-paper/25 bg-transparent px-3 py-2 text-sm text-paper transition-colors duration-150 hover:border-paper/50 focus:border-paper/70 focus:outline-none sm:w-auto"
        >
          <option value={ALL_CATEGORIES} className="bg-ink text-paper">
            All
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id} className="bg-ink text-paper">
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div
        role="group"
        aria-label="Filter by tested status"
        className="order-3 flex shrink-0 items-center gap-4 sm:order-none"
      >
        <label
          htmlFor={testedId}
          className="flex cursor-pointer items-center gap-2 text-sm text-paper/80"
        >
          <input
            id={testedId}
            type="checkbox"
            className="h-4 w-4 accent-paper/70"
            checked={value.showTested}
            onChange={(event) => update({ showTested: event.target.checked })}
          />
          Tested
        </label>
        <label
          htmlFor={untestedId}
          className="flex cursor-pointer items-center gap-2 text-sm text-paper/80"
        >
          <input
            id={untestedId}
            type="checkbox"
            className="h-4 w-4 accent-paper/70"
            checked={value.showUntested}
            onChange={(event) => update({ showUntested: event.target.checked })}
          />
          Non-tested
        </label>
      </div>

      <div className="order-2 flex min-w-0 grow basis-40 items-center gap-2 sm:order-none sm:grow-0 sm:basis-auto">
        <label htmlFor={searchId} className="sr-only text-sm text-paper/80 sm:not-sr-only">
          Search
        </label>
        <input
          id={searchId}
          type="text"
          className="w-full min-w-0 rounded-sm border border-paper/25 bg-transparent px-3 py-2 text-sm text-paper transition-colors duration-150 placeholder:text-paper/45 hover:border-paper/50 focus:border-paper/70 focus:outline-none sm:w-44 lg:w-56"
          placeholder="Search… ( / )"
          value={value.query}
          onChange={(event) => update({ query: event.target.value })}
          onKeyDown={(event) => {
            // Escape clears the search and keeps the caret in place.
            if (event.key === 'Escape') {
              event.preventDefault();
              update({ query: '' });
            }
          }}
        />
      </div>

      {sort && onSortChange ? (
        <div className="order-4 shrink-0 sm:order-none sm:ml-auto">
          <label htmlFor={sortSelectId} className="sr-only">
            Sort resources
          </label>
          <select
            id={sortSelectId}
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SortMode)}
            className="cursor-pointer rounded-sm border border-paper/25 bg-transparent px-3 py-2 text-sm text-paper transition-colors duration-150 hover:border-paper/50 focus:border-paper/70 focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option} className="bg-ink text-paper">
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
