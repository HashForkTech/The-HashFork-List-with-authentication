/**
 * Shared resource filtering — the single source of truth for the category,
 * "Tested" / "Non-tested" and substring-search filters used by BOTH the public
 * list (`components/Directory.tsx`) and the admin dashboard, so the two
 * screens can never drift apart.
 *
 * Pure TypeScript (safe for client bundles and unit tests).
 */

export const ALL_CATEGORIES = 'all';

export type ResourceFilterState = {
  /** Selected category id, or the `ALL_CATEGORIES` sentinel. */
  categoryId: string;
  /** Show resources marked as tested. */
  showTested: boolean;
  /** Show resources not (yet) tested. */
  showUntested: boolean;
  /**
   * Case-insensitive substring query matched against the resource's searchable
   * text (name, description, comment). Empty / whitespace-only = no search.
   */
  query: string;
};

/** The shape filtering needs — a full `ListItem` satisfies it as-is. */
export type FilterableResource = {
  categoryId?: string | null;
  tested: boolean;
  name?: string | null;
  description?: string | null;
  comment?: string | null;
  /**
   * Pre-computed searchable text (lower-cased). When absent or empty it is
   * rebuilt from the textual fields — the public list stores it on the row's
   * `data-item-search` attribute.
   */
  searchText?: string | null;
};

/** Default filters: every category, both statuses, no search. */
export const DEFAULT_FILTERS: ResourceFilterState = {
  categoryId: ALL_CATEGORIES,
  showTested: true,
  showUntested: true,
  query: '',
};

/** Case-folds text for case-insensitive substring matching. */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase();
}

/** Normalizes a query: trimmed and case-folded. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Builds the searchable text of a resource from its textual fields:
 * name, description and comment (the content shown on the resource listing).
 */
export function buildSearchText(resource: {
  name?: string | null;
  description?: string | null;
  comment?: string | null;
}): string {
  return normalizeSearchText(
    [resource.name, resource.description, resource.comment]
      .map((part) => (part ?? '').trim())
      .filter((part) => part !== '')
      .join(' '),
  );
}

/**
 * Combines every filter: a resource is shown only when it matches the
 * selected category AND the tested/non-tested checkboxes AND (when a query is
 * typed) contains it as a case-insensitive substring of its searchable text.
 */
export function matchesResourceFilter(
  resource: FilterableResource,
  filters: ResourceFilterState,
): boolean {
  const matchesCategory =
    filters.categoryId === ALL_CATEGORIES ||
    (resource.categoryId ?? '') === filters.categoryId;

  const isTested = Boolean(resource.tested);
  const matchesStatus = (isTested && filters.showTested) || (!isTested && filters.showUntested);

  const query = normalizeQuery(filters.query);
  const haystack = normalizeSearchText(resource.searchText || buildSearchText(resource));
  const matchesQuery = query === '' || haystack.includes(query);

  return matchesCategory && matchesStatus && matchesQuery;
}

/** Returns the resources passing every active filter (combined, not independent). */
export function filterResources<T extends FilterableResource>(
  resources: T[],
  filters: ResourceFilterState,
): T[] {
  return resources.filter((resource) => matchesResourceFilter(resource, filters));
}
