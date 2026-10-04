// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Directory } from '@/components/Directory';
import { ItemRow } from '@/components/ItemRow';
import type { CategoryWithCount, ListItem } from '@/lib/types';

// The Directory mirrors filters + sort into the URL query string; jsdom keeps
// the location across tests in one file, so reset it after each test to keep
// the URL-restore behaviour from bleeding into the next render.
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', window.location.pathname);
});

const categories: CategoryWithCount[] = [
  { id: 'tools', name: 'Tools', createdAt: '2026-01-01T00:00:00.000Z', itemCount: 2 },
  { id: 'security', name: 'Security', createdAt: '2026-01-01T00:00:00.000Z', itemCount: 2 },
];

function item(patch: Partial<ListItem> & { id: string }): ListItem {
  return {
    categoryId: null,
    name: null,
    description: null,
    githubUrl: null,
    websiteUrl: null,
    huggingFaceUrl: null,
    youtubeUrl: null,
    tested: false,
    testedAt: null,
    rating: 0,
    comment: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

const items: ListItem[] = [
  item({
    id: 'linux-tested',
    categoryId: 'tools',
    tested: true,
    name: 'Ollama',
    description: 'Runs Linux LLMs locally.',
  }),
  item({
    id: 'linux-untested',
    categoryId: 'security',
    tested: false,
    name: 'Docker bench',
    description: 'Security checks for docker hosts on Linux.',
  }),
  item({
    id: 'docker-tested',
    categoryId: 'security',
    tested: true,
    name: 'Trivy',
    description: 'Scans docker images for vulnerabilities.',
    comment: 'Great for Linux containers.',
  }),
  item({ id: 'plain', categoryId: 'tools', tested: false, name: 'Notepad' }),
];

function renderDirectory() {
  return render(
    <Directory categories={categories}>
      {items.map((entry) => (
        <ItemRow key={entry.id} item={entry} />
      ))}
    </Directory>,
  );
}

/** All row elements (filtering only toggles their `hidden` flag). */
function allRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('article[data-item-row]'));
}

function rowByName(name: string): HTMLElement {
  const row = allRows().find((entry) => entry.querySelector('h2')?.textContent === name);
  return row as HTMLElement;
}

function visibleNames(): string[] {
  return allRows()
    .filter((row) => !row.hidden)
    .map((row) => row.querySelector('h2')?.textContent ?? '');
}

describe('Directory — search input placement', () => {
  it('renders the Search field immediately to the right of the Non-tested checkbox', () => {
    const { container } = renderDirectory();
    const nonTested = screen.getByLabelText('Non-tested');
    const search = screen.getByLabelText('Search');

    const position = nonTested.compareDocumentPosition(search);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search instanceof HTMLInputElement).toBe(true);

    // Nothing except the search label sits between the checkbox and the input.
    const html = container.innerHTML;
    expect(html.indexOf('Non-tested')).toBeLessThan(html.indexOf('id="search-filter"'));
    expect(html.indexOf('id="search-filter"')).toBeLessThan(html.indexOf('data-item-row'));
  });
});

describe('Directory — substring search', () => {
  it('filters rows as the user types (true case-insensitive substring)', () => {
    renderDirectory();
    const search = screen.getByLabelText('Search');

    fireEvent.change(search, { target: { value: 'lin' } });
    expect(visibleNames()).toEqual(['Ollama', 'Docker bench', 'Trivy']);

    fireEvent.change(search, { target: { value: 'LINUX' } });
    expect(visibleNames()).toEqual(['Ollama', 'Docker bench', 'Trivy']);

    fireEvent.change(search, { target: { value: 'bench' } }); // substring of the name
    expect(visibleNames()).toEqual(['Docker bench']);
  });

  it('searches the name, the description and the comment', () => {
    renderDirectory();
    const search = screen.getByLabelText('Search');

    fireEvent.change(search, { target: { value: 'ollama' } }); // name
    expect(visibleNames()).toEqual(['Ollama']);

    fireEvent.change(search, { target: { value: 'vulnerab' } }); // description
    expect(visibleNames()).toEqual(['Trivy']);

    fireEvent.change(search, { target: { value: 'containers' } }); // comment
    expect(visibleNames()).toEqual(['Trivy']);
  });

  it('shows every row again when the search is emptied', () => {
    renderDirectory();
    const search = screen.getByLabelText('Search');

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(visibleNames()).toEqual([]);

    fireEvent.change(search, { target: { value: '' } });
    expect(visibleNames()).toEqual(['Ollama', 'Docker bench', 'Trivy', 'Notepad']);
  });

  it('shows the "no match" message when nothing matches', () => {
    renderDirectory();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No resources match the selected filters.')).toBeTruthy();
  });
});

describe('Directory — combined filters', () => {
  it('combines the category filter with the search', () => {
    renderDirectory();
    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'security' },
    });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'docker' } });
    expect(visibleNames()).toEqual(['Docker bench', 'Trivy']);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'linux' } });
    expect(visibleNames()).toEqual(['Docker bench', 'Trivy']);
  });

  it('combines Tested + search (Category = All)', () => {
    renderDirectory();
    fireEvent.click(screen.getByLabelText('Non-tested')); // uncheck → tested only
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'linux' } });
    expect(visibleNames()).toEqual(['Ollama', 'Trivy']);
  });

  it('combines Non-tested + search (Category = All)', () => {
    renderDirectory();
    fireEvent.click(screen.getByLabelText('Tested')); // uncheck → non-tested only
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'docker' } });
    expect(visibleNames()).toEqual(['Docker bench']);
  });

  it('combines category + status + search at once', () => {
    renderDirectory();
    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'security' },
    });
    fireEvent.click(screen.getByLabelText('Non-tested')); // tested only
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'linux' } });
    expect(visibleNames()).toEqual(['Trivy']);
  });

  it('keeps the existing behaviour when the search is empty', () => {
    renderDirectory();
    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'tools' },
    });
    expect(visibleNames()).toEqual(['Ollama', 'Notepad']);

    fireEvent.click(screen.getByLabelText('Tested'));
    expect(visibleNames()).toEqual(['Notepad']);
  });
});

describe('ItemRow — two-line descriptions', () => {
  it('clamps the description to two lines and exposes the full text on hover', () => {
    const longDescription = `First line of a long description.\nSecond line.\nThird line.\nFourth line.`;
    render(
      <Directory categories={categories}>
        <ItemRow item={item({ id: 'long', name: 'Long', description: longDescription })} />
      </Directory>,
    );

    const paragraph = rowByName('Long').querySelector('p') as HTMLElement;
    // Two rendered lines: CSS line clamp, not a character cut.
    expect(paragraph.classList.contains('line-clamp-2')).toBe(true);
    expect(paragraph.textContent).toBe(longDescription);

    // The tooltip carries the complete description (same text as the clamp).
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toBe(longDescription);
    expect(tooltip.classList.contains('invisible')).toBe(true); // hidden by default

    // Hovering the description reveals it.
    fireEvent.mouseEnter(paragraph.parentElement as HTMLElement);
    expect(tooltip.classList.contains('visible')).toBe(true);

    // Leaving hides it again without touching the layout around it.
    fireEvent.mouseLeave(paragraph.parentElement as HTMLElement);
    expect(tooltip.classList.contains('invisible')).toBe(true);
  });

  it('is keyboard-accessible: focusing the description shows the full text', () => {
    const description = 'A description long enough to be clamped on screen.';
    render(
      <Directory categories={categories}>
        <ItemRow item={item({ id: 'kbd', name: 'Kbd', description })} />
      </Directory>,
    );

    const paragraph = rowByName('Kbd').querySelector('p') as HTMLElement;
    expect(paragraph.getAttribute('tabindex')).toBe('0');
    expect(paragraph.getAttribute('aria-describedby')).toBe('item-description-kbd');
    expect(paragraph.textContent).toBe(description);

    fireEvent.focus(paragraph);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.classList.contains('visible')).toBe(true);

    fireEvent.blur(paragraph);
    expect(tooltip.classList.contains('invisible')).toBe(true);
  });

  it('renders short descriptions normally (no clamping artefacts, empty ones omitted)', () => {
    render(
      <Directory categories={categories}>
        <ItemRow item={item({ id: 'short', name: 'Short', description: 'Tiny.' })} />
        <ItemRow item={item({ id: 'empty', name: 'Empty' })} />
      </Directory>,
    );
    const shortParagraph = rowByName('Short').querySelector('p') as HTMLElement;
    expect(shortParagraph.textContent).toBe('Tiny.');
    expect(within(rowByName('Short')).getByRole('tooltip').textContent).toBe('Tiny.');
    // No description → no tooltip for that row.
    expect(rowByName('Empty').querySelector('[role="tooltip"]')).toBeNull();
  });
});

describe('Directory — comment popover (tap-friendly)', () => {
  it('toggles the comment popover with the button and hides it again', () => {
    render(
      <Directory categories={categories}>
        <ItemRow item={item({ id: 'cmt', name: 'Trivy', comment: 'Great tool.' })} />
      </Directory>,
    );
    const button = screen.getByRole('button', { name: 'Comment' });
    const popover = within(rowByName('Trivy')).getByRole('tooltip');
    expect(popover.classList.contains('invisible')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    expect(popover.classList.contains('visible')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(button);
    expect(popover.classList.contains('invisible')).toBe(true);
  });
});

describe('Directory — URL round-trip', () => {
  it('restores filters + search from the query string on first render', () => {
    window.history.replaceState(null, '', '/?category=security&tested=0&q=docker');
    renderDirectory();

    expect(visibleNames()).toEqual(['Docker bench']);
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('docker');
    expect((screen.getByLabelText('Filter by category') as HTMLSelectElement).value).toBe(
      'security',
    );
    expect((screen.getByLabelText('Tested') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Non-tested') as HTMLInputElement).checked).toBe(true);
  });

  it('mirrors non-default filters into the URL and clears it via Reset', () => {
    renderDirectory();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'bench' } });
    expect(window.location.search).toBe('?q=bench');

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(window.location.search).toBe('');
    expect(visibleNames().length).toBe(4);
  });
});

describe('Directory — sorting', () => {
  it('re-orders the rows by name (A–Z)', () => {
    renderDirectory();
    fireEvent.change(screen.getByLabelText('Sort resources'), { target: { value: 'name' } });
    expect(visibleNames()).toEqual(['Docker bench', 'Notepad', 'Ollama', 'Trivy']);
  });

  it('re-orders the rows by rating (best first)', () => {
    render(
      <Directory categories={categories}>
        <ItemRow item={item({ id: 'a', name: 'Two stars', rating: 2 })} />
        <ItemRow item={item({ id: 'b', name: 'Five stars', rating: 5 })} />
        <ItemRow item={item({ id: 'c', name: 'One star', rating: 1 })} />
      </Directory>,
    );
    expect(visibleNames()).toEqual(['Two stars', 'Five stars', 'One star']); // default: newest
    fireEvent.change(screen.getByLabelText('Sort resources'), { target: { value: 'rating' } });
    expect(visibleNames()).toEqual(['Five stars', 'Two stars', 'One star']);
  });
});

describe('Directory — result count and keyboard shortcut', () => {
  it('shows the visible count while filtering', () => {
    renderDirectory();
    expect(screen.getByText('4 resources')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'lin' } });
    expect(screen.getByText('3 of 4 resources')).toBeTruthy();
  });

  it('focuses the search box on "/" and clears it on Escape', () => {
    renderDirectory();
    const search = screen.getByLabelText('Search') as HTMLInputElement;

    fireEvent.change(search, { target: { value: 'ollama' } });
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(search);

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search.value).toBe('');
  });
});
