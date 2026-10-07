import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { POST as categoryPost } from '@/app/api/categories/route';
import { GET as exportGet } from '@/app/api/export/route';
import { DELETE as categoryDelete, PATCH as categoryPatch } from '@/app/api/categories/[id]/route';
import { DELETE as itemDelete, PATCH as itemPatch } from '@/app/api/items/[id]/route';
import { GET as itemsGet, POST as itemPost } from '@/app/api/items/route';
import { POST as importPost } from '@/app/api/import/route';
import { PATCH as settingsPatch } from '@/app/api/settings/route';
import {
  apiRequest,
  readJson,
  routeContext,
  setupTestDatabase,
} from './helpers';

setupTestDatabase();

describe('admin authorization', () => {
  it('rejects every administrative mutation and export without a credential', async () => {
    const responses = await Promise.all([
      itemPost(apiRequest('/api/items', { method: 'POST', body: { name: 'unauthorized' }, omitAuthorization: true })),
      itemPatch(apiRequest('/api/items/x', { method: 'PATCH', body: { name: 'x' }, omitAuthorization: true }), routeContext('x')),
      itemDelete(apiRequest('/api/items/x', { method: 'DELETE', omitAuthorization: true }), routeContext('x')),
      categoryPost(apiRequest('/api/categories', { method: 'POST', body: { name: 'x' }, omitAuthorization: true })),
      categoryPatch(apiRequest('/api/categories/x', { method: 'PATCH', body: { name: 'x' }, omitAuthorization: true }), routeContext('x')),
      categoryDelete(apiRequest('/api/categories/x', { method: 'DELETE', omitAuthorization: true }), routeContext('x')),
      settingsPatch(apiRequest('/api/settings', { method: 'PATCH', body: { siteTitle: 'Hijacked' }, omitAuthorization: true })),
      importPost(apiRequest('/api/import', { method: 'POST', body: { mode: 'replace', confirm: true, data: { categories: [], items: [] } }, omitAuthorization: true })),
      exportGet(apiRequest('/api/export', { omitAuthorization: true })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    const list = await readJson(await itemsGet(new Request('http://localhost:3000/api/items')));
    expect(list.items).toEqual([]);
  });

  it('ships authentication endpoints and persistent protected auth tables', async () => {
    expect(fs.existsSync(path.join(process.cwd(), 'app', 'api', 'auth'))).toBe(true);
    const { getDb } = await import('@/lib/db/client');
    const tables = getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    const names = tables.map((table) => table.name);
    expect(names).toEqual(expect.arrayContaining(['items', 'categories', 'admin_auth', 'auth_sessions', 'auth_rate_limits']));
    expect(names).not.toContain('admin');
    expect(names).not.toContain('sessions');
    expect(names).not.toContain('rate_limits');
  });
});

describe('cross-origin protections for authenticated requests', () => {
  it('requires the custom mutation header', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'x' },
        omitMutationHeader: true,
      }),
    );
    expect(res.status).toBe(403);
  });

  it('rejects cross-site origins', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'x' },
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('rejects requests flagged as cross-site by Sec-Fetch-Site', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'x' },
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('rejects same-host origins with a different scheme', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'légitime' },
        headers: { origin: 'https://localhost:3000' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('does not let forwarded-host spoofing add an allowed origin', async () => {
    const res = await itemPost(apiRequest('/api/items', {
      method: 'POST', body: { name: 'x' },
      headers: { origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    }));
    expect(res.status).toBe(403);
  });

  it('rejects a malformed Origin header', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'x' },
        headers: { origin: '://pas-une-url' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('protects every write endpoint the same way', async () => {
    const responses = await Promise.all([
      categoryPost(
        apiRequest('/api/categories', { method: 'POST', body: { name: 'x' }, omitMutationHeader: true }),
      ),
      itemPatch(
        apiRequest('/api/items/x', { method: 'PATCH', body: { name: 'x' }, omitMutationHeader: true }),
        routeContext('x'),
      ),
      itemDelete(apiRequest('/api/items/x', { method: 'DELETE', omitMutationHeader: true }), routeContext('x')),
      importPost(
        apiRequest('/api/import', {
          method: 'POST',
          omitMutationHeader: true,
          body: { mode: 'merge', data: { categories: [], items: [] } },
        }),
      ),
      settingsPatch(
        apiRequest('/api/settings', {
          method: 'PATCH',
          omitMutationHeader: true,
          body: { siteTitle: 'x' },
        }),
      ),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(403);
    }
  });
});

describe('input hardening', () => {
  it('rejects malformed JSON bodies', async () => {
    const res = await itemPost(
      apiRequest('/api/items', { method: 'POST', rawBody: '{"broken"' }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-object payloads', async () => {
    const res = await itemPost(
      apiRequest('/api/items', { method: 'POST', rawBody: '"juste un texte"' }),
    );
    expect(res.status).toBe(422);
  });

  it('rejects oversized payloads', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        rawBody: `{"name":"${'x'.repeat(2_100_000)}"}`,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('never leaks stack traces or secrets on server errors', async () => {
    const res = await itemPost(apiRequest('/api/items', { method: 'POST', body: {} }));
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain('stack');
    expect(text.toLowerCase()).not.toContain('sqlite');
    expect(text).not.toContain('test-secret');
  });

  it('still allows public reads of the list', async () => {
    await itemPost(apiRequest('/api/items', { method: 'POST', body: { name: 'Publique' } }));
    const res = await itemsGet(new Request('http://localhost:3000/api/items'));
    expect(res.status).toBe(200);
    const list = (await readJson(res)) as { items: unknown[] };
    expect(list.items).toHaveLength(1);
  });
});
