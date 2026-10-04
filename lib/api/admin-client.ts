import type {
  Category,
  CategoryWithCount,
  ItemPayload,
  ListItem,
  SiteSettings,
} from '@/lib/types';

/**
 * Thin client for the admin API. Always sends the custom mutation header
 * (cross-origin protection) and maps API errors to user-friendly English
 * messages. There is no login in this build.
 */

export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  issues?: string[];
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export type ImportSummaryLike = {
  mode: 'merge' | 'replace';
  categories: { created: number; skipped: number };
  items: { created: number; skipped: number; unclassified: number };
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

async function request<T>(url: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'x-requested-with': 'hashfork-admin' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'network',
      message: 'Unable to connect. Check your network connection.',
    };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const error = (
      payload as {
        error?: { code?: string; message?: string; details?: { issues?: string[] } };
      } | null
    )?.error;
    return {
      ok: false,
      status: res.status,
      code: error?.code ?? 'error',
      message: error?.message ?? 'An error occurred. Please try again.',
      issues: error?.details?.issues,
    };
  }

  return { ok: true, data: payload as T };
}

export const adminApi = {
  listCategories: () =>
    request<{ categories: CategoryWithCount[] }>('/api/categories', { method: 'GET' }),

  listItems: () => request<{ items: ListItem[] }>('/api/items', { method: 'GET' }),

  getSettings: () => request<{ settings: SiteSettings }>('/api/settings', { method: 'GET' }),

  updateSettings: (siteTitle: string) =>
    request<{ settings: SiteSettings }>('/api/settings', {
      method: 'PATCH',
      body: { siteTitle },
    }),

  createCategory: (name: string) =>
    request<{ category: Category }>('/api/categories', { method: 'POST', body: { name } }),

  updateCategory: (id: string, name: string) =>
    request<{ category: Category }>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { name },
    }),

  deleteCategory: (id: string) =>
    request<{ ok: true; detachedItems: number }>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createItem: (payload: ItemPayload) =>
    request<{ item: ListItem }>('/api/items', { method: 'POST', body: payload }),

  updateItem: (id: string, payload: ItemPayload) =>
    request<{ item: ListItem }>(`/api/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: payload,
    }),

  deleteItem: (id: string) =>
    request<{ ok: true }>(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  importData: (body: {
    mode: 'merge' | 'replace';
    confirm?: boolean;
    data: { categories: unknown[]; items: unknown[] };
  }) => request<{ ok: true; summary: ImportSummaryLike }>('/api/import', { method: 'POST', body }),
};
