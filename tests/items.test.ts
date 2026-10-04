import { describe, expect, it } from 'vitest';
import { POST as categoryPost } from '@/app/api/categories/route';
import { DELETE as itemDelete, PATCH as itemPatch } from '@/app/api/items/[id]/route';
import { GET as itemsGet, POST as itemPost } from '@/app/api/items/route';
import { apiRequest, readJson, routeContext, setupTestDatabase } from './helpers';

setupTestDatabase();

async function createCategory(name: string): Promise<string> {
  const res = await categoryPost(apiRequest('/api/categories', { method: 'POST', body: { name } }));
  expect(res.status).toBe(201);
  const body = await readJson(res);
  return (body.category as { id: string }).id;
}

describe('items', () => {
  it('creates an item with every field populated', async () => {
    const categoryId = await createCategory('Outils');

    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: {
          categoryId,
          name: 'Ollama',
          description: 'Exécute des grands modèles de langage en local.',
          githubUrl: 'https://github.com/ollama/ollama',
          websiteUrl: 'ollama.com',
          huggingFaceUrl: 'https://huggingface.co/example/model',
          youtubeUrl: 'https://youtube.com/watch?v=abc',
        },
      }),
    );
    expect(res.status).toBe(201);
    const { item } = (await readJson(res)) as {
      item: {
        categoryId: string;
        name: string;
        description: string;
        githubUrl: string;
        websiteUrl: string;
        huggingFaceUrl: string;
        youtubeUrl: string;
        createdAt: string;
        updatedAt: string;
      };
    };
    expect(item.name).toBe('Ollama');
    expect(item.categoryId).toBe(categoryId);
    expect(item.githubUrl).toBe('https://github.com/ollama/ollama');
    expect(item.websiteUrl).toBe('https://ollama.com/'); // normalized
    expect(item.huggingFaceUrl).toBe('https://huggingface.co/example/model');
    expect(item.youtubeUrl).toBe('https://youtube.com/watch?v=abc');
    expect(item.createdAt).toBeTruthy();
  });

  it('creates an item with a single field', async () => {
    const res = await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { name: 'Juste un nom' } }),
    );
    expect(res.status).toBe(201);
    const { item } = (await readJson(res)) as { item: Record<string, string | null> };
    expect(item.name).toBe('Juste un nom');
    expect(item.description).toBeNull();
    expect(item.githubUrl).toBeNull();
    expect(item.categoryId).toBeNull();
  });

  it('creates an item with a single URL only', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { huggingFaceUrl: 'https://huggingface.co/only/this' },
      }),
    );
    expect(res.status).toBe(201);
    const { item } = (await readJson(res)) as { item: Record<string, string | null> };
    expect(item.huggingFaceUrl).toBe('https://huggingface.co/only/this');
    expect(item.name).toBeNull();
  });

  it('accepts a completely empty item (all fields optional)', async () => {
    const res = await itemPost(apiRequest('/api/items', { method: 'POST', body: {} }));
    expect(res.status).toBe(201);
  });

  it('stores tested, rating and comment', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'Reviewed', tested: true, rating: 4, comment: 'Works well.' },
      }),
    );
    expect(res.status).toBe(201);
    const { item } = (await readJson(res)) as {
      item: { tested: boolean; rating: number; comment: string | null; testedAt: string | null };
    };
    expect(item.tested).toBe(true);
    expect(item.rating).toBe(4);
    expect(item.comment).toBe('Works well.');
    expect(item.testedAt).toBeTruthy(); // check date stamped automatically
  });

  it('defaults tested to false and rating to 0', async () => {
    const res = await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { name: 'Plain' } }),
    );
    expect(res.status).toBe(201);
    const { item } = (await readJson(res)) as {
      item: { tested: boolean; rating: number; comment: string | null; testedAt: string | null };
    };
    expect(item.tested).toBe(false);
    expect(item.rating).toBe(0);
    expect(item.comment).toBeNull();
    expect(item.testedAt).toBeNull();
  });

  it('stamps the check date when tested is checked and clears it when unchecked', async () => {
    const created = await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { name: 'À tester' } }),
    );
    const { item } = (await readJson(created)) as {
      item: { id: string; tested: boolean; testedAt: string | null };
    };
    expect(item.testedAt).toBeNull();

    // checking the box saves the date of the check
    const checked = await itemPatch(
      apiRequest(`/api/items/${item.id}`, { method: 'PATCH', body: { tested: true } }),
      routeContext(item.id),
    );
    expect(checked.status).toBe(200);
    const { item: testedItem } = (await readJson(checked)) as {
      item: { tested: boolean; testedAt: string | null };
    };
    expect(testedItem.tested).toBe(true);
    expect(testedItem.testedAt).toBeTruthy();

    // an unrelated edit keeps the original check date
    const touched = await itemPatch(
      apiRequest(`/api/items/${item.id}`, { method: 'PATCH', body: { description: 'Modifié' } }),
      routeContext(item.id),
    );
    const { item: touchedItem } = (await readJson(touched)) as {
      item: { testedAt: string | null };
    };
    expect(touchedItem.testedAt).toBe(testedItem.testedAt);

    // unchecking clears the check date
    const unchecked = await itemPatch(
      apiRequest(`/api/items/${item.id}`, { method: 'PATCH', body: { tested: false } }),
      routeContext(item.id),
    );
    const { item: uncheckedItem } = (await readJson(unchecked)) as {
      item: { tested: boolean; testedAt: string | null };
    };
    expect(uncheckedItem.tested).toBe(false);
    expect(uncheckedItem.testedAt).toBeNull();
  });

  it('rejects a malformed check date', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'Date', tested: true, testedAt: 'pas une date' },
      }),
    );
    expect(res.status).toBe(422);
  });

  it('updates review fields partially', async () => {
    const created = await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { name: 'Patch me' } }),
    );
    const { item } = (await readJson(created)) as { item: { id: string } };
    const res = await itemPatch(
      apiRequest(`/api/items/${item.id}`, {
        method: 'PATCH',
        body: { tested: true, rating: 5 },
      }),
      routeContext(item.id),
    );
    expect(res.status).toBe(200);
    const { item: updated } = (await readJson(res)) as {
      item: { name: string; tested: boolean; rating: number; comment: string | null };
    };
    expect(updated.name).toBe('Patch me'); // untouched
    expect(updated.tested).toBe(true);
    expect(updated.rating).toBe(5);
    expect(updated.comment).toBeNull();
  });

  it('rejects malformed URLs without a technical leak', async () => {
    const res = await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { githubUrl: 'pas une url' } }),
    );
    expect(res.status).toBe(422);
    const text = JSON.stringify(await readJson(res));
    expect(text).toContain('GitHub link');
    expect(text).not.toContain('stack');
  });

  it('rejects dangerous schemes', async () => {
    const res = await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { websiteUrl: 'javascript:alert(1)' } }),
    );
    expect(res.status).toBe(422);
  });

  it('rejects an unknown category', async () => {
    const res = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'Test', categoryId: 'inexistante' },
      }),
    );
    expect(res.status).toBe(422);
  });

  it('updates an item and supports partial updates', async () => {
    const createRes = await itemPost(
      apiRequest('/api/items', {
        method: 'POST',
        body: { name: 'Avant', description: 'Description initiale', websiteUrl: 'https://a.example' },
      }),
    );
    const { item } = (await readJson(createRes)) as { item: { id: string } };

    // partial update: only the name
    const patchRes = await itemPatch(
      apiRequest(`/api/items/${item.id}`, { method: 'PATCH', body: { name: 'Après' } }),
      routeContext(item.id),
    );
    expect(patchRes.status).toBe(200);
    const updated = (await readJson(patchRes)) as {
      item: { name: string; description: string; websiteUrl: string };
    };
    expect(updated.item.name).toBe('Après');
    expect(updated.item.description).toBe('Description initiale'); // untouched
    expect(updated.item.websiteUrl).toBe('https://a.example/'); // untouched

    // explicit clear: empty string nulls the field
    const clearRes = await itemPatch(
      apiRequest(`/api/items/${item.id}`, { method: 'PATCH', body: { description: '' } }),
      routeContext(item.id),
    );
    const cleared = (await readJson(clearRes)) as { item: { description: string | null } };
    expect(cleared.item.description).toBeNull();
  });

  it('rejects updates with invalid URLs and changes nothing', async () => {
    const createRes = await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { name: 'Stable' } }),
    );
    const { item } = (await readJson(createRes)) as { item: { id: string; name: string } };

    const bad = await itemPatch(
      apiRequest(`/api/items/${item.id}`, {
        method: 'PATCH',
        body: { name: 'Ne doit pas s appliquer', githubUrl: '????' },
      }),
      routeContext(item.id),
    );
    expect(bad.status).toBe(422);

    const list = await readJson(await itemsGet(apiRequest('/api/items')));
    const items = list.items as Array<{ id: string; name: string }>;
    expect(items.find((entry) => entry.id === item.id)?.name).toBe('Stable');
  });

  it('deletes an item and reports unknown ids', async () => {
    const createRes = await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { name: 'À supprimer' } }),
    );
    const { item } = (await readJson(createRes)) as { item: { id: string } };

    const del = await itemDelete(
      apiRequest(`/api/items/${item.id}`, { method: 'DELETE' }),
      routeContext(item.id),
    );
    expect(del.status).toBe(200);

    const again = await itemDelete(
      apiRequest(`/api/items/${item.id}`, { method: 'DELETE' }),
      routeContext(item.id),
    );
    expect(again.status).toBe(404);
  });

  it('lists newest items first', async () => {
    await itemPost(apiRequest('/api/items', { method: 'POST', body: { name: 'Premier' } }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await itemPost(apiRequest('/api/items', { method: 'POST', body: { name: 'Second' } }));

    const list = (await readJson(await itemsGet(apiRequest('/api/items')))) as {
      items: Array<{ name: string }>;
    };
    expect(list.items.map((entry) => entry.name)).toEqual(['Second', 'Premier']);
  });

  it('filters items by category', async () => {
    const c1 = await createCategory('LLM');
    const c2 = await createCategory('Outils');
    await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { name: 'Modèle A', categoryId: c1 } }),
    );
    await itemPost(
      apiRequest('/api/items', { method: 'POST', body: { name: 'Outil B', categoryId: c2 } }),
    );

    const filtered = (await readJson(await itemsGet(apiRequest(`/api/items?categoryId=${c1}`)))) as {
      items: Array<{ name: string }>;
    };
    expect(filtered.items.map((entry) => entry.name)).toEqual(['Modèle A']);

    const all = (await readJson(await itemsGet(apiRequest('/api/items')))) as {
      items: unknown[];
    };
    expect(all.items).toHaveLength(2);
  });
});
