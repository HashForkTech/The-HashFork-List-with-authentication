import { describe, expect, it } from 'vitest';
import {
  DELETE as categoryDelete,
  PATCH as categoryPatch,
} from '@/app/api/categories/[id]/route';
import { GET as categoriesGet, POST as categoryPost } from '@/app/api/categories/route';
import { GET as itemsGet, POST as itemPost } from '@/app/api/items/route';
import { apiRequest, readJson, routeContext, setupTestDatabase } from './helpers';

setupTestDatabase();

describe('categories', () => {
  it('creates a category and lists it with an item count', async () => {
    const res = await categoryPost(
      apiRequest('/api/categories', { method: 'POST', body: { name: '  LLM  ' } }),
    );
    expect(res.status).toBe(201);
    const created = (await readJson(res)) as { category: { id: string; name: string } };
    expect(created.category.name).toBe('LLM');

    const list = (await readJson(await categoriesGet())) as {
      categories: Array<{ id: string; name: string; itemCount: number }>;
    };
    expect(list.categories).toHaveLength(1);
    expect(list.categories[0].itemCount).toBe(0);
  });

  it('rejects an empty category name', async () => {
    const res = await categoryPost(
      apiRequest('/api/categories', { method: 'POST', body: { name: '   ' } }),
    );
    expect(res.status).toBe(422);
  });

  it('renames a category', async () => {
    const createRes = await categoryPost(
      apiRequest('/api/categories', { method: 'POST', body: { name: 'Ancien nom' } }),
    );
    const { category } = (await readJson(createRes)) as { category: { id: string } };

    const patchRes = await categoryPatch(
      apiRequest(`/api/categories/${category.id}`, {
        method: 'PATCH',
        body: { name: 'Nouveau nom' },
      }),
      routeContext(category.id),
    );
    expect(patchRes.status).toBe(200);
    const renamed = (await readJson(patchRes)) as { category: { name: string } };
    expect(renamed.category.name).toBe('Nouveau nom');
  });

  it('deletes an empty category', async () => {
    const createRes = await categoryPost(
      apiRequest('/api/categories', { method: 'POST', body: { name: 'Vide' } }),
    );
    const { category } = (await readJson(createRes)) as { category: { id: string } };

    const del = await categoryDelete(
      apiRequest(`/api/categories/${category.id}`, { method: 'DELETE' }),
      routeContext(category.id),
    );
    expect(del.status).toBe(200);
    const body = (await readJson(del)) as { detachedItems: number };
    expect(body.detachedItems).toBe(0);
  });

  it('keeps items when their category is deleted (association cleared)', async () => {
    const createRes = await categoryPost(
      apiRequest('/api/categories', { method: 'POST', body: { name: 'À supprimer' } }),
    );
    const { category } = (await readJson(createRes)) as { category: { id: string } };

    await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'Ressource 1', categoryId: category.id },
      }),
    );
    await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'Ressource 2', categoryId: category.id },
      }),
    );

    const del = await categoryDelete(
      apiRequest(`/api/categories/${category.id}`, { method: 'DELETE' }),
      routeContext(category.id),
    );
    expect(del.status).toBe(200);
    const body = (await readJson(del)) as { detachedItems: number };
    expect(body.detachedItems).toBe(2);

    // items still exist — just without a category
    const list = (await readJson(await itemsGet(apiRequest('/api/items')))) as {
      items: Array<{ name: string; categoryId: string | null }>;
    };
    expect(list.items).toHaveLength(2);
    for (const item of list.items) {
      expect(item.categoryId).toBeNull();
    }
  });

  it('reports unknown categories as 404', async () => {
    const res = await categoryDelete(
      apiRequest('/api/categories/unknown', { method: 'DELETE' }),
      routeContext('unknown'),
    );
    expect(res.status).toBe(404);
  });

  it('filters items by category server-side', async () => {
    const createRes = await categoryPost(
      apiRequest('/api/categories', { method: 'POST', body: { name: 'LLM' } }),
    );
    const { category } = (await readJson(createRes)) as { category: { id: string } };

    await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'Dans LLM', categoryId: category.id },
      }),
    );
    await itemPost(apiRequest('/api/items', { method: 'POST', body: { name: 'Sans catégorie' } }));

    const filtered = (await readJson(
      await itemsGet(apiRequest(`/api/items?categoryId=${category.id}`)),
    )) as { items: Array<{ name: string }> };
    expect(filtered.items.map((item) => item.name)).toEqual(['Dans LLM']);
  });
});
