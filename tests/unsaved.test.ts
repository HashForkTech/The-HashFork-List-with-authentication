import { describe, expect, it } from 'vitest';
import {
  EMPTY_ITEM_DRAFT,
  isNameDirty,
  isItemDraftDirty,
  itemDraftFromForm,
  itemDraftFromItem,
  NEW_CATEGORY_SELECTION,
  type ItemDraftInput,
} from '@/lib/unsaved';
import type { ListItem } from '@/lib/types';

const savedItem: ListItem = {
  id: 'item-1',
  categoryId: 'cat-1',
  name: 'Ollama',
  description: 'Runs large language models locally.',
  comment: 'Solid tool.',
  websiteUrl: 'https://ollama.com/',
  githubUrl: 'https://github.com/ollama/ollama',
  huggingFaceUrl: null,
  youtubeUrl: null,
  tested: true,
  testedAt: '2026-01-01T00:00:00.000Z',
  rating: 4,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function form(patch: Partial<ItemDraftInput> = {}): ItemDraftInput {
  return {
    categoryId: 'cat-1',
    name: 'Ollama',
    description: 'Runs large language models locally.',
    comment: 'Solid tool.',
    websiteUrl: 'https://ollama.com/',
    githubUrl: 'https://github.com/ollama/ollama',
    huggingFaceUrl: '',
    youtubeUrl: '',
    tested: true,
    rating: 4,
    ...patch,
  };
}

describe('itemDraftFromForm / itemDraftFromItem', () => {
  it('normalizes text, URLs and rating the same way the save path does', () => {
    const draft = itemDraftFromForm(
      form({ name: '  Ollama  ', websiteUrl: 'ollama.com', rating: 4.4 }),
    );
    expect(draft.name).toBe('Ollama');
    expect(draft.websiteUrl).toBe('https://ollama.com/');
    expect(draft.rating).toBe(4);
  });

  it('maps empty and null values to the same draft', () => {
    expect(itemDraftFromItem(null)).toEqual(EMPTY_ITEM_DRAFT);
    expect(itemDraftFromItem({ ...savedItem, name: null, description: '' })).toEqual(
      itemDraftFromForm(form({ name: '', description: '' })),
    );
  });
});

describe('isItemDraftDirty', () => {
  const saved = itemDraftFromItem(savedItem);

  it('is clean when nothing changed', () => {
    expect(isItemDraftDirty(saved, itemDraftFromForm(form()))).toBe(false);
  });

  it('is clean when only formatting differs (spaces, URL shape)', () => {
    expect(
      isItemDraftDirty(
        saved,
        itemDraftFromForm(
          form({ name: ' Ollama ', websiteUrl: 'ollama.com', githubUrl: 'github.com/ollama/ollama' }),
        ),
      ),
    ).toBe(false);
  });

  it('detects a change in every user-editable field', () => {
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ name: 'Ollama 2' })))).toBe(true);
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ description: 'Changed.' })))).toBe(true);
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ comment: 'Changed.' })))).toBe(true);
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ categoryId: '' })))).toBe(true);
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ websiteUrl: 'https://example.com' })))).toBe(
      true,
    );
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ githubUrl: 'https://github.com/x/y' })))).toBe(
      true,
    );
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ huggingFaceUrl: 'https://hf.co/a' })))).toBe(
      true,
    );
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ youtubeUrl: 'https://youtu.be/a' })))).toBe(
      true,
    );
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ tested: false })))).toBe(true);
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ rating: 5 })))).toBe(true);
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ rating: 0 })))).toBe(true);
  });

  it('is clean again when the edits are reverted to the saved values', () => {
    const changed = itemDraftFromForm(form({ name: 'Something else', rating: 1, tested: false }));
    expect(isItemDraftDirty(saved, changed)).toBe(true);
    const reverted = itemDraftFromForm(form());
    expect(isItemDraftDirty(saved, reverted)).toBe(false);
  });

  it('is clean when a URL edit would round-trip to the stored value', () => {
    expect(isItemDraftDirty(saved, itemDraftFromForm(form({ websiteUrl: 'ollama.com/' })))).toBe(
      false,
    );
  });

  it('treats an inline "new category" name as a pending change', () => {
    expect(
      isItemDraftDirty(
        saved,
        itemDraftFromForm(form({ categoryId: NEW_CATEGORY_SELECTION, newCategoryName: '' })),
      ),
    ).toBe(true); // would clear the category
    expect(
      isItemDraftDirty(
        saved,
        itemDraftFromForm(form({ categoryId: NEW_CATEGORY_SELECTION, newCategoryName: 'New cat' })),
      ),
    ).toBe(true);
    expect(
      itemDraftFromForm(form({ categoryId: NEW_CATEGORY_SELECTION, newCategoryName: 'New cat' }))
        .categoryId,
    ).toBe(`${NEW_CATEGORY_SELECTION}:New cat`);
  });

  it('is clean for a brand-new empty form and dirty once anything is typed', () => {
    const emptySaved = itemDraftFromItem(null);
    expect(isItemDraftDirty(emptySaved, itemDraftFromForm(form({ categoryId: '', name: '', description: '', comment: '', websiteUrl: '', githubUrl: '', tested: false, rating: 0 })))).toBe(
      false,
    );
    expect(isItemDraftDirty(emptySaved, itemDraftFromForm(form({ categoryId: '', name: 'New', description: '', comment: '', websiteUrl: '', githubUrl: '', tested: false, rating: 0 })))).toBe(
      true,
    );
  });
});

describe('isNameDirty', () => {
  it('compares trimmed values', () => {
    expect(isNameDirty('Tools', 'Tools')).toBe(false);
    expect(isNameDirty('Tools', ' Tools ')).toBe(false);
    expect(isNameDirty('Tools', 'Tools 2')).toBe(true);
    expect(isNameDirty(null, '')).toBe(false);
    expect(isNameDirty(null, 'x')).toBe(true);
  });
});
