import { describe, expect, it } from 'vitest';
import { GET as exportGet } from '@/app/api/export/route';
import { POST as importPost } from '@/app/api/import/route';
import { POST as categoryPost } from '@/app/api/categories/route';
import { GET as itemsGet, POST as itemPost } from '@/app/api/items/route';
import { apiRequest, readJson, setupTestDatabase } from './helpers';

setupTestDatabase();

type Backup = {
  format: string;
  version: number;
  exportedAt: string;
  categories: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string | null; categoryId: string | null }>;
};

async function seed() {
  const categoryRes = await categoryPost(
    apiRequest('/api/categories', { method: 'POST', body: { name: 'LLM' } }),
  );
  const { category } = (await readJson(categoryRes)) as { category: { id: string } };
  await itemPost(
    apiRequest('/api/items', {
      method: 'POST',
      body: { name: 'Ressource A', categoryId: category.id },
    }),
  );
  await itemPost(apiRequest('/api/items', { method: 'POST', body: { name: 'Ressource B' } }));
  return category.id;
}

describe('backup export', () => {
  it('exports every category and item as JSON', async () => {
    await seed();

    const res = await exportGet(apiRequest('/api/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');

    const backup = (await readJson(res)) as unknown as Backup;
    expect(backup.format).toBe('the-hashfork-list/backup');
    expect(backup.categories).toHaveLength(1);
    expect(backup.items).toHaveLength(2);
  });
});

describe('backup import', () => {
  it('merges a backup without overwriting existing rows', async () => {
    await seed();
    const backup = (await readJson(await exportGet(apiRequest('/api/export')))) as unknown as Backup;

    // re-import the same file: nothing should be duplicated or changed
    const res = await importPost(
      apiRequest('/api/import', { method: 'POST', body: { mode: 'merge', data: backup } }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      summary: { items: { created: number; skipped: number }; categories: { skipped: number } };
    };
    expect(body.summary.items.created).toBe(0);
    expect(body.summary.items.skipped).toBe(2);
    expect(body.summary.categories.skipped).toBe(1);

    const list = (await readJson(await itemsGet(apiRequest('/api/items')))) as { items: unknown[] };
    expect(list.items).toHaveLength(2);
  });

  it('adds only missing entries on merge', async () => {
    await seed();

    const res = await importPost(
      apiRequest('/api/import', {
        method: 'POST',
        body: {
          mode: 'merge',
          data: {
            categories: [{ id: 'nouvelle', name: 'Outils' }],
            items: [
              { id: 'nouvel-item', name: 'Ressource C', categoryId: 'nouvelle' },
              { id: 'nouvel-item-2', name: 'Ressource D', categoryId: 'inconnue' },
            ],
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      summary: {
        categories: { created: number };
        items: { created: number; unclassified: number };
      };
    };
    expect(body.summary.categories.created).toBe(1);
    expect(body.summary.items.created).toBe(2);
    expect(body.summary.items.unclassified).toBe(1); // dangling category → cleared

    const list = (await readJson(await itemsGet(apiRequest('/api/items')))) as {
      items: Array<{ id: string; categoryId: string | null }>;
    };
    expect(list.items).toHaveLength(4);
    expect(list.items.find((item) => item.id === 'nouvel-item-2')?.categoryId).toBeNull();
  });

  it('refuses to replace existing data without explicit confirmation', async () => {
    await seed();

    const res = await importPost(
      apiRequest('/api/import', {
        method: 'POST',
        body: {
          mode: 'replace',
          data: { categories: [], items: [{ id: 'seul', name: 'Unique' }] },
        },
      }),
    );
    expect(res.status).toBe(422);

    // nothing was deleted
    const list = (await readJson(await itemsGet(apiRequest('/api/items')))) as { items: unknown[] };
    expect(list.items).toHaveLength(2);
  });

  it('replaces everything only with confirmation', async () => {
    await seed();

    const res = await importPost(
      apiRequest('/api/import', {
        method: 'POST',
        body: {
          mode: 'replace',
          confirm: true,
          data: {
            categories: [{ id: 'c', name: 'Restaurée' }],
            items: [{ id: 'seul', name: 'Unique', categoryId: 'c' }],
          },
        },
      }),
    );
    expect(res.status).toBe(200);

    const list = (await readJson(await itemsGet(apiRequest('/api/items')))) as {
      items: Array<{ id: string; name: string; categoryId: string }>;
    };
    expect(list.items).toHaveLength(1);
    expect(list.items[0].id).toBe('seul');
  });

  it('rejects malformed backups and leaves the database untouched', async () => {
    await seed();

    const res = await importPost(
      apiRequest('/api/import', {
        method: 'POST',
        body: {
          mode: 'merge',
          data: {
            categories: [{ name: '' }], // invalid: empty name
            items: [{ name: 'Ne doit pas être importé' }],
          },
        },
      }),
    );
    expect(res.status).toBe(422);

    const list = (await readJson(await itemsGet(apiRequest('/api/items')))) as { items: unknown[] };
    expect(list.items).toHaveLength(2);
  });
});
