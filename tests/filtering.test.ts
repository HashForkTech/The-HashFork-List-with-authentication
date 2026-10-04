import { describe, expect, it } from 'vitest';
import {
  ALL_CATEGORIES,
  buildFilterParams,
  buildSearchText,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  filterResources,
  matchesResourceFilter,
  normalizeQuery,
  parseFilterParams,
  type ResourceFilterState,
} from '@/lib/filtering';

function filters(patch: Partial<ResourceFilterState> = {}): ResourceFilterState {
  return { ...DEFAULT_FILTERS, ...patch };
}

const items = [
  {
    id: 'linux-tested',
    categoryId: 'tools',
    tested: true,
    name: 'Ollama',
    description: 'Runs Linux LLMs locally.',
    comment: null,
  },
  {
    id: 'linux-untested',
    categoryId: 'security',
    tested: false,
    name: 'Docker bench',
    description: 'Security checks for docker hosts on Linux.',
    comment: null,
  },
  {
    id: 'docker-tested',
    categoryId: 'security',
    tested: true,
    name: 'Trivy',
    description: 'Scans docker images for vulnerabilities.',
    comment: 'Works great with Linux containers.',
  },
  {
    id: 'plain',
    categoryId: 'tools',
    tested: false,
    name: 'Notepad',
    description: null,
    comment: null,
  },
];

describe('buildSearchText', () => {
  it('joins the textual fields and lower-cases them', () => {
    expect(buildSearchText(items[0])).toBe('ollama runs linux llms locally.');
  });

  it('skips empty fields and trims whitespace', () => {
    expect(buildSearchText({ name: '  A  ', description: null, comment: ' B ' })).toBe('a b');
    expect(buildSearchText({ name: null, description: null, comment: null })).toBe('');
  });
});

describe('normalizeQuery', () => {
  it('trims and lower-cases the query', () => {
    expect(normalizeQuery('  LiNuX ')).toBe('linux');
    expect(normalizeQuery('')).toBe('');
    expect(normalizeQuery('   ')).toBe('');
  });
});

describe('matchesResourceFilter', () => {
  it('shows everything with the default filters and an empty query', () => {
    for (const item of items) {
      expect(matchesResourceFilter(item, filters())).toBe(true);
    }
  });

  it('matches a plain substring, case-insensitively', () => {
    const f = filters({ query: 'lin' });
    expect(matchesResourceFilter(items[0], f)).toBe(true);
    expect(matchesResourceFilter(items[1], f)).toBe(true);
    expect(matchesResourceFilter(items[2], f)).toBe(true); // in the comment
    expect(matchesResourceFilter(items[3], f)).toBe(false);

    expect(matchesResourceFilter(items[0], filters({ query: 'LINUX' }))).toBe(true);
    expect(matchesResourceFilter(items[0], filters({ query: 'Llms' }))).toBe(true);
  });

  it('matches only the searched field content (name / description / comment)', () => {
    expect(matchesResourceFilter(items[2], filters({ query: 'trivy' }))).toBe(true); // name
    expect(matchesResourceFilter(items[2], filters({ query: 'vulnerab' }))).toBe(true); // description
    expect(matchesResourceFilter(items[2], filters({ query: 'containers' }))).toBe(true); // comment
    expect(matchesResourceFilter(items[2], filters({ query: 'not-in-there' }))).toBe(false);
  });

  it('treats an empty or whitespace-only query as no search', () => {
    expect(matchesResourceFilter(items[3], filters({ query: '' }))).toBe(true);
    expect(matchesResourceFilter(items[3], filters({ query: '   ' }))).toBe(true);
  });

  it('combines the category filter with the substring search', () => {
    const f = filters({ categoryId: 'security', query: 'docker' });
    expect(matchesResourceFilter(items[1], f)).toBe(true);
    expect(matchesResourceFilter(items[2], f)).toBe(true);
    // "docker" appears nowhere in the tools items.
    expect(matchesResourceFilter(items[0], f)).toBe(false);
    expect(matchesResourceFilter(items[3], f)).toBe(false);

    const other = filters({ categoryId: 'tools', query: 'docker' });
    expect(matchesResourceFilter(items[1], other)).toBe(false);
    expect(matchesResourceFilter(items[2], other)).toBe(false);
  });

  it('combines the Tested filter with the substring search', () => {
    const f = filters({ showUntested: false, query: 'linux' });
    expect(matchesResourceFilter(items[0], f)).toBe(true); // tested + linux
    expect(matchesResourceFilter(items[1], f)).toBe(false); // non-tested
    expect(matchesResourceFilter(items[2], f)).toBe(true); // tested + linux (comment)

    const untestedOnly = filters({ showTested: false, query: 'linux' });
    expect(matchesResourceFilter(items[0], untestedOnly)).toBe(false);
    expect(matchesResourceFilter(items[1], untestedOnly)).toBe(true);
  });

  it('combines category, status and search at once', () => {
    // Category = All, Tested checked, Non-tested unchecked, search "linux".
    const testedLinux = filters({ showUntested: false, query: 'linux' });
    expect(items.filter((item) => matchesResourceFilter(item, testedLinux)).map((i) => i.id)).toEqual([
      'linux-tested',
      'docker-tested',
    ]);

    // Category = Security, Tested unchecked, Non-tested checked, search "docker".
    const securityDocker = filters({
      categoryId: 'security',
      showTested: false,
      query: 'docker',
    });
    expect(
      items.filter((item) => matchesResourceFilter(item, securityDocker)).map((i) => i.id),
    ).toEqual(['linux-untested']);
  });

  it('matches resources without a category only for All', () => {
    const orphan = { id: 'o', categoryId: null, tested: false, name: 'linux thing' };
    expect(matchesResourceFilter(orphan, filters({ query: 'linux' }))).toBe(true);
    expect(matchesResourceFilter(orphan, filters({ categoryId: 'tools', query: 'linux' }))).toBe(
      false,
    );
    expect(matchesResourceFilter(orphan, filters({ categoryId: ALL_CATEGORIES }))).toBe(true);
  });

  it('falls back to the textual fields when no pre-computed search text is set', () => {
    expect(matchesResourceFilter(items[0], filters({ query: 'ollama' }))).toBe(true);
  });
});

describe('filterResources', () => {
  it('returns only the resources passing every filter', () => {
    const result = filterResources(items, filters({ showUntested: false, query: 'linux' }));
    expect(result.map((item) => item.id)).toEqual(['linux-tested', 'docker-tested']);
  });

  it('returns nothing when no resource matches', () => {
    expect(filterResources(items, filters({ query: 'zzz-no-match' }))).toEqual([]);
  });

  it('keeps the original order and objects', () => {
    const result = filterResources(items, filters());
    expect(result).toEqual(items);
  });
});

describe('URL (de)serialisation', () => {
  it('round-trips non-default filters and sort', () => {
    const state: ResourceFilterState = {
      categoryId: 'cat-1',
      showTested: false,
      showUntested: true,
      query: 'llm',
    };
    const query = buildFilterParams(state, 'rating');
    expect(query).toBe('category=cat-1&tested=0&q=llm&sort=rating');
    const parsed = parseFilterParams(`?${query}`);
    expect(parsed.filters).toEqual(state);
    expect(parsed.sort).toBe('rating');
  });

  it('writes nothing for default state and reads defaults from garbage', () => {
    expect(buildFilterParams(DEFAULT_FILTERS, DEFAULT_SORT)).toBe('');
    const parsed = parseFilterParams('?category=&sort=nope&tested=1&q=');
    expect(parsed.filters.categoryId).toBe(ALL_CATEGORIES);
    expect(parsed.filters.showTested).toBe(true);
    expect(parsed.sort).toBe('newest');
  });
});
