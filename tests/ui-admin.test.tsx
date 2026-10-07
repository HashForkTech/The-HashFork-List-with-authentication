// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CategoryWithCount, ListItem } from '@/lib/types';

const api = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listItems: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  importData: vi.fn(),
  exportData: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({ adminApi: api }));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

import { AdminDashboard } from '@/components/admin/AdminDashboard';

const ok = <T,>(data: T) => ({ ok: true as const, data });

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
    id: 'python-tested',
    categoryId: 'tools',
    tested: true,
    name: 'Ollama',
    description: 'Runs python LLM tooling locally.',
  }),
  item({
    id: 'python-untested',
    categoryId: 'security',
    tested: false,
    name: 'Docker bench',
    description: 'Security checks written in python for docker hosts.',
  }),
  item({
    id: 'docker-tested',
    categoryId: 'security',
    tested: true,
    name: 'Trivy',
    description: 'Scans docker images for vulnerabilities.',
  }),
  item({ id: 'plain', categoryId: 'tools', tested: false, name: 'Notepad' }),
];

function renderDashboard(onLogout?: () => Promise<string | null>) {
  api.listCategories.mockResolvedValue(ok({ categories }));
  api.listItems.mockResolvedValue(ok({ items }));
  api.createItem.mockResolvedValue(ok({ item: items[0] }));
  api.updateItem.mockResolvedValue(ok({ item: items[0] }));
  api.deleteItem.mockResolvedValue(ok({ ok: true }));
  api.createCategory.mockResolvedValue(ok({ category: categories[0] }));
  api.updateCategory.mockResolvedValue(ok({ category: categories[0] }));
  api.deleteCategory.mockResolvedValue(ok({ ok: true, detachedItems: 0 }));
  api.updateSettings.mockResolvedValue(ok({ settings: { siteTitle: 'The HashFork List' } }));
  return render(
    <AdminDashboard
      initialCategories={categories}
      initialItems={items}
      initialSiteTitle="The HashFork List"
      onLogout={onLogout}
    />,
  );
}

/** The rendered resource rows (the filtered admin list). */
function rowNames(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('main ul li h3')).map(
    (heading) => heading.textContent ?? '',
  );
}

function rowByName(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  return heading.closest('li') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(cleanup);

describe('Admin — filter bar placement', () => {
  it('renders the same controls to the right of the "Resources" heading', () => {
    const { container } = renderDashboard();
    const html = container.innerHTML;

    expect(screen.getByLabelText('Filter by category')).toBeTruthy();
    expect(screen.getByLabelText('Tested')).toBeTruthy();
    expect(screen.getByLabelText('Non-tested')).toBeTruthy();
    const search = screen.getByLabelText('Search');

    const resources = screen.getByRole('heading', { name: 'Resources' });
    const position = resources.compareDocumentPosition(search);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(html.indexOf('Resources')).toBeLessThan(html.indexOf('id="admin-search-filter"'));
  });
});

describe('Admin — filtering behaves like the main page', () => {
  it('combines Tested with the substring search (Category = All)', () => {
    renderDashboard();
    fireEvent.click(screen.getByLabelText('Non-tested')); // tested only
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'python' } });
    expect(rowNames()).toEqual(['Ollama']);
  });

  it('combines Non-tested with the substring search', () => {
    renderDashboard();
    fireEvent.click(screen.getByLabelText('Tested')); // non-tested only
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'docker' } });
    expect(rowNames()).toEqual(['Docker bench']);
  });

  it('combines the category filter with the substring search', () => {
    renderDashboard();
    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'security' },
    });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'docker' } });
    expect(rowNames()).toEqual(['Docker bench', 'Trivy']);
  });

  it('combines category + status + search at once', () => {
    renderDashboard();
    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'security' },
    });
    fireEvent.click(screen.getByLabelText('Non-tested')); // tested only
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'python' } });
    expect(rowNames()).toEqual([]);
    expect(screen.getByText('No resources match the selected filters.')).toBeTruthy();
  });

  it('is a true case-insensitive substring search', () => {
    renderDashboard();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'TRIV' } });
    expect(rowNames()).toEqual(['Trivy']);
  });

  it('lists everything again when the search is emptied', () => {
    renderDashboard();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } });
    expect(rowNames()).toEqual([]);

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } });
    expect(rowNames()).toEqual(['Ollama', 'Docker bench', 'Trivy', 'Notepad']);
  });
});

describe('Admin — unsaved resource changes', () => {
  function openEditor(name: string) {
    fireEvent.click(within(rowByName(name)).getByRole('button', { name: 'Edit' }));
    return screen.getByRole('form', { name: 'Edit resource' });
  }

  function dialog() {
    return screen.getByRole('alertdialog');
  }

  it('leaves normally when the form has no changes', () => {
    renderDashboard();
    const form = openEditor('Ollama');
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Edit resource' })).toBeNull();
  });

  it('warns before losing changes and "Keep editing" preserves them', () => {
    renderDashboard();
    const form = openEditor('Ollama');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ollama renamed' } });

    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog()).getByText('Unsaved changes')).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ollama renamed');
  });

  it('"Discard changes" closes the editor without saving', () => {
    renderDashboard();
    const form = openEditor('Ollama');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Edit resource' })).toBeNull();
    expect(api.updateItem).not.toHaveBeenCalled();
  });

  it('"Save" persists the changes and closes the editor', async () => {
    renderDashboard();
    const form = openEditor('Ollama');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ollama renamed' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateItem).toHaveBeenCalledTimes(1));
    expect(api.updateItem.mock.calls[0][0]).toBe('python-tested');
    expect(api.updateItem.mock.calls[0][1]).toMatchObject({ name: 'Ollama renamed' });
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Edit resource' })).toBeNull(),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('does not warn when changes were typed and then reverted', () => {
    renderDashboard();
    const form = openEditor('Ollama');
    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Something else' } });
    fireEvent.change(nameInput, { target: { value: 'Ollama' } });
    fireEvent.change(nameInput, { target: { value: '  Ollama  ' } }); // same saved value

    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Edit resource' })).toBeNull();
  });

  it('allows switching to another resource only after resolving the changes', async () => {
    renderDashboard();
    openEditor('Ollama');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed' } });

    fireEvent.click(within(rowByName('Trivy')).getByRole('button', { name: 'Edit' }));
    expect(within(dialog()).getByText('Unsaved changes')).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Trivy'),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('saves the current resource before switching to another one', async () => {
    renderDashboard();
    openEditor('Ollama');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed' } });

    fireEvent.click(within(rowByName('Trivy')).getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('python-tested', expect.anything()));
    await waitFor(() =>
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Trivy'),
    );
  });

  it('switches directly between resources when there is nothing to save', async () => {
    renderDashboard();
    openEditor('Ollama');
    fireEvent.click(within(rowByName('Trivy')).getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() =>
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Trivy'),
    );
  });

  it('protects a new resource being typed as well', () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Add a resource' }));
    const form = screen.getByRole('form', { name: 'Add a resource' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New one' } });

    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('form', { name: 'Add a resource' })).toBeNull();
    expect(api.createItem).not.toHaveBeenCalled();
  });

  it('still allows the regular Save button of the form', async () => {
    renderDashboard();
    const form = openEditor('Ollama');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Saved directly' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateItem).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Edit resource' })).toBeNull(),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Admin — unsaved category changes', () => {
  function categoryRow(name: string): HTMLElement {
    const section = document.querySelector(
      'section[aria-labelledby="categories-title"]',
    ) as HTMLElement;
    const row = Array.from(section.querySelectorAll('li')).find(
      (li) => li.querySelector('span')?.textContent === name,
    );
    return row as HTMLElement;
  }

  function openRename(name: string) {
    fireEvent.click(within(categoryRow(name)).getByRole('button', { name: 'Rename' }));
    return screen.getByLabelText('New category name');
  }

  it('warns before losing category rename changes', () => {
    renderDashboard();
    const input = openRename('Tools');
    fireEvent.change(input, { target: { value: 'Tools renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Unsaved changes')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByLabelText('New category name')).toBeNull();
    expect(api.updateCategory).not.toHaveBeenCalled();
  });

  it('saves the category from the warning dialog', async () => {
    renderDashboard();
    const input = openRename('Tools');
    fireEvent.change(input, { target: { value: 'Tools renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.updateCategory).toHaveBeenCalledWith('tools', 'Tools renamed'),
    );
    await waitFor(() => expect(screen.queryByLabelText('New category name')).toBeNull());
  });

  it('does not warn when the rename was reverted', () => {
    renderDashboard();
    const input = openRename('Tools');
    fireEvent.change(input, { target: { value: 'Tools 2' } });
    fireEvent.change(input, { target: { value: ' Tools ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('guards switching to another category rename form', async () => {
    renderDashboard();
    const input = openRename('Tools');
    fireEvent.change(input, { target: { value: 'Tools renamed' } });

    fireEvent.click(within(categoryRow('Security')).getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Keep editing' }),
    );
    expect((screen.getByLabelText('New category name') as HTMLInputElement).value).toBe(
      'Tools renamed',
    );
  });

  it('keeps the normal rename behaviour without changes', async () => {
    renderDashboard();
    openRename('Tools');
    fireEvent.click(within(categoryRow('Security')).getByRole('button', { name: 'Rename' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByLabelText('New category name') as HTMLInputElement).value).toBe('Security');
  });
});

describe('Admin — leaving the page', () => {
  it('warns before navigating away with unsaved changes', () => {
    renderDashboard();
    fireEvent.click(within(rowByName('Ollama')).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed' } });

    fireEvent.click(screen.getByRole('link', { name: 'View site' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Unsaved changes')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Edit resource' })).toBeTruthy();
  });
});


describe('Admin — authenticated sign out', () => {
  it('resolves unsaved changes before revoking the session', async () => {
    const logout = vi.fn().mockResolvedValue(null);
    renderDashboard(logout);
    fireEvent.click(within(rowByName('Ollama')).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved resource' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Keep editing' }));
    expect(logout).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Unsaved resource');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });
});
