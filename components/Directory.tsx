'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ResourceFilters } from '@/components/ResourceFilters';
import {
  DEFAULT_FILTERS,
  matchesResourceFilter,
  type ResourceFilterState,
} from '@/lib/filtering';
import type { CategoryWithCount } from '@/lib/types';

type DirectoryProps = {
  categories: CategoryWithCount[];
  children: ReactNode;
  emptyMessage?: string;
};

/**
 * Category + "Tested" + search filters above the item list.
 *
 * The category is picked in a drop-down menu ("All" is selected by default).
 * To its right, two checkboxes control which resources are shown: "Tested"
 * and "Non-tested". Both are checked by default (everything visible);
 * unchecking one hides that group, unchecking both hides the whole list.
 * To their right, the "Search" field narrows the list down to the resources
 * whose name, description or comment contain the typed text as a substring
 * (case-insensitive). All filters combine — they are never independent.
 *
 * The rows themselves are server-rendered (passed as `children`); filtering
 * only toggles the `hidden` attribute of each row through the DOM. Two
 * benefits: almost no JavaScript in the public page payload, and the rows'
 * DOM (including any text) survives filtering untouched. The shared
 * `matchesResourceFilter` is the single source of truth for what is shown.
 */
export function Directory({
  categories,
  children,
  emptyMessage = 'No resources in this category.',
}: DirectoryProps) {
  const [filters, setFilters] = useState<ResourceFilterState>(DEFAULT_FILTERS);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    let visible = 0;
    for (const row of root.querySelectorAll<HTMLElement>('[data-item-row]')) {
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
  }, [filters]);

  const filterMessage =
    filters.categoryId !== 'all' &&
    filters.showTested &&
    filters.showUntested &&
    filters.query.trim() === ''
      ? emptyMessage
      : 'No resources match the selected filters.';

  return (
    <section aria-label="Resource list">
      <div className="sticky top-14 z-20 -mx-4 bg-ink/90 px-4 py-3 backdrop-blur sm:top-16 sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <ResourceFilters categories={categories} value={filters} onChange={setFilters} />
      </div>

      <div ref={listRef} className="mt-2 border-t border-paper/10">
        {children}
      </div>

      {visibleCount === 0 ? (
        <p className="px-1 py-16 text-center text-sm text-paper/45">{filterMessage}</p>
      ) : null}
    </section>
  );
}
