import type {
  Category,
  CategoryWithCount,
  ItemPayload,
  ListItem,
  SiteSettings,
} from '@/lib/types';
import { clearAdminSession, getAdminSession } from '@/lib/api/admin-session';

/** Cookie-free API requests use only the bearer token held in module memory. */
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
  authenticated?: boolean;
  response?: 'json' | 'blob';
};

export async function adminRequest<T>(url: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const token = options.authenticated === false ? undefined : getAdminSession()?.token;
  const headers: Record<string, string> = { 'x-requested-with': 'hashfork-admin' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'omit',
      cache: 'no-store',
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

  if (res.ok && options.response === 'blob') {
    return { ok: true, data: await res.blob() as T };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    if (res.status === 401 && token && getAdminSession()?.token === token) {
      clearAdminSession('Your session has ended. Sign in again to continue.');
    }
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
    adminRequest<{ categories: CategoryWithCount[] }>('/api/categories'),

  listItems: () => adminRequest<{ items: ListItem[] }>('/api/items'),

  getSettings: () => adminRequest<{ settings: SiteSettings }>('/api/settings'),

  updateSettings: (siteTitle: string) =>
    adminRequest<{ settings: SiteSettings }>('/api/settings', {
      method: 'PATCH', body: { siteTitle },
    }),

  createCategory: (name: string) =>
    adminRequest<{ category: Category }>('/api/categories', { method: 'POST', body: { name } }),

  updateCategory: (id: string, name: string) =>
    adminRequest<{ category: Category }>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: { name },
    }),

  deleteCategory: (id: string) =>
    adminRequest<{ ok: true; detachedItems: number }>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createItem: (payload: ItemPayload) =>
    adminRequest<{ item: ListItem }>('/api/items', { method: 'POST', body: payload }),

  updateItem: (id: string, payload: ItemPayload) =>
    adminRequest<{ item: ListItem }>(`/api/items/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: payload,
    }),

  deleteItem: (id: string) =>
    adminRequest<{ ok: true }>(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  exportData: () => adminRequest<Blob>('/api/export', { response: 'blob' }),

  importData: (body: {
    mode: 'merge' | 'replace';
    confirm?: boolean;
    data: { categories: unknown[]; items: unknown[] };
  }) => adminRequest<{ ok: true; summary: ImportSummaryLike }>('/api/import', { method: 'POST', body }),
};
