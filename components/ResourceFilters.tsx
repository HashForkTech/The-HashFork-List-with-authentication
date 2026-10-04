'use client';

import type { CategoryWithCount } from '@/lib/types';
import {
  ALL_CATEGORIES,
  type ResourceFilterState,
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
};

/**
 * The resource filter bar, shared by the public list and the admin dashboard:
 * a category drop-down ("All" by default), the "Tested" / "Non-tested"
 * checkboxes and the substring "Search" field to their right. All controls
 * combine: a resource is listed only when it passes every active filter.
 */
export function ResourceFilters({
  categories,
  value,
  onChange,
  idPrefix = '',
}: ResourceFiltersProps) {
  const update = (patch: Partial<ResourceFilterState>) => onChange({ ...value, ...patch });

  const categorySelectId = `${idPrefix}category-filter`;
  const testedId = `${idPrefix}tested-filter`;
  const untestedId = `${idPrefix}untested-filter`;
  const searchId = `${idPrefix}search-filter`;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
      <div>
        <label htmlFor={categorySelectId} className="sr-only">
          Filter by category
        </label>
        <select
          id={categorySelectId}
          value={value.categoryId}
          onChange={(event) => update({ categoryId: event.target.value })}
          className="cursor-pointer rounded-sm border border-paper/20 bg-transparent px-3 py-2 text-sm text-paper transition-colors duration-150 hover:border-paper/45 focus:border-paper/60 focus:outline-none"
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
        className="flex items-center gap-4"
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

      <div className="flex items-center gap-2">
        <label htmlFor={searchId} className="text-sm text-paper/80">
          Search
        </label>
        <input
          id={searchId}
          type="text"
          className="w-40 rounded-sm border border-paper/20 bg-transparent px-3 py-2 text-sm text-paper transition-colors duration-150 placeholder:text-paper/30 hover:border-paper/45 focus:border-paper/60 focus:outline-none sm:w-56"
          placeholder="Search…"
          value={value.query}
          onChange={(event) => update({ query: event.target.value })}
        />
      </div>
    </div>
  );
}
