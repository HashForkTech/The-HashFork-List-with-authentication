import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  categoryInputSchema,
  formatIssues,
  importRequestSchema,
  itemInputSchema,
  normalizeUrl,
} from '@/lib/validation/schemas';

describe('normalizeUrl', () => {
  it('accepts and normalizes absolute https URLs', () => {
    expect(normalizeUrl('https://github.com/example/project')).toBe(
      'https://github.com/example/project',
    );
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('accepts http URLs and normalizes them', () => {
    expect(normalizeUrl('http://example.com/path')).toBe('http://example.com/path');
  });

  it('adds https:// when the scheme is missing', () => {
    expect(normalizeUrl('github.com/example/project')).toBe('https://github.com/example/project');
    expect(normalizeUrl('  huggingface.co/example/model  ')).toBe(
      'https://huggingface.co/example/model',
    );
  });

  it('accepts YouTube, Hugging Face and localhost URLs', () => {
    expect(normalizeUrl('https://youtube.com/watch?v=abc')).toBe('https://youtube.com/watch?v=abc');
    expect(normalizeUrl('https://huggingface.co/example/model')).toBe(
      'https://huggingface.co/example/model',
    );
    expect(normalizeUrl('http://localhost:3000/demo')).toBe('http://localhost:3000/demo');
  });

  it('rejects malformed or dangerous URLs', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
    expect(normalizeUrl('hello world')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('data:text/html,<script>')).toBeNull();
    expect(normalizeUrl('mailto:someone@example.com')).toBeNull();
    expect(normalizeUrl('not a url at all')).toBeNull();
    expect(normalizeUrl('https://')).toBeNull();
    expect(normalizeUrl('x'.repeat(LIMITS.url + 1))).toBeNull();
  });
});

describe('itemInputSchema', () => {
  it('accepts a completely empty item (every field optional)', () => {
    const parsed = itemInputSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('accepts an item with empty strings and treats them as null', () => {
    const parsed = itemInputSchema.safeParse({
      name: '',
      description: '',
      githubUrl: '',
      websiteUrl: '',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBeNull();
      expect(parsed.data.githubUrl).toBeNull();
    }
  });

  it('accepts a single populated field', () => {
    const parsed = itemInputSchema.safeParse({ name: 'Ollama' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe('Ollama');
  });

  it('trims text fields', () => {
    const parsed = itemInputSchema.safeParse({ name: '  Ollama  ', description: 'desc' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe('Ollama');
  });

  it('rejects an invalid URL and reports which field is wrong', () => {
    const parsed = itemInputSchema.safeParse({ githubUrl: 'pas une url' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issues = formatIssues(parsed.error);
      expect(issues.join(' ')).toContain('GitHub link');
    }
  });

  it('rejects a javascript: URL', () => {
    expect(itemInputSchema.safeParse({ websiteUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('rejects over-long names', () => {
    expect(itemInputSchema.safeParse({ name: 'x'.repeat(LIMITS.name + 1) }).success).toBe(false);
  });

  it('accepts tested, rating and comment', () => {
    const parsed = itemInputSchema.safeParse({ tested: true, rating: 4, comment: 'Solid tool.' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tested).toBe(true);
      expect(parsed.data.rating).toBe(4);
      expect(parsed.data.comment).toBe('Solid tool.');
    }
  });

  it('rejects a rating outside 0–5', () => {
    expect(itemInputSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(itemInputSchema.safeParse({ rating: -1 }).success).toBe(false);
    expect(itemInputSchema.safeParse({ rating: 2.5 }).success).toBe(false);
  });

  it('rejects an over-long comment', () => {
    expect(itemInputSchema.safeParse({ comment: 'x'.repeat(LIMITS.comment + 1) }).success).toBe(
      false,
    );
  });

  it('does not carry unknown keys through', () => {
    const parsed = itemInputSchema.safeParse({ name: 'ok', evil: '<script>' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect('evil' in parsed.data).toBe(false);
  });
});

describe('categoryInputSchema', () => {
  it('requires a non-empty name and trims it', () => {
    expect(categoryInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(categoryInputSchema.safeParse({}).success).toBe(false);

    const parsed = categoryInputSchema.safeParse({ name: ' LLM ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe('LLM');
  });
});

describe('importRequestSchema', () => {
  it('accepts a well-formed backup payload', () => {
    const parsed = importRequestSchema.safeParse({
      mode: 'merge',
      data: {
        categories: [{ id: 'c1', name: 'LLM' }],
        items: [{ id: 'i1', categoryId: 'c1', name: 'Ollama', githubUrl: 'https://github.com/a/b' }],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects malformed backup data', () => {
    expect(
      importRequestSchema.safeParse({ mode: 'merge', data: { categories: 'nope', items: [] } })
        .success,
    ).toBe(false);
    expect(
      importRequestSchema.safeParse({ mode: 'unknown', data: { categories: [], items: [] } })
        .success,
    ).toBe(false);
    expect(importRequestSchema.safeParse({ mode: 'merge' }).success).toBe(false);
  });

  it('rejects invalid URLs inside a backup', () => {
    const parsed = importRequestSchema.safeParse({
      mode: 'replace',
      confirm: true,
      data: { categories: [], items: [{ websiteUrl: 'javascript:alert(1)' }] },
    });
    expect(parsed.success).toBe(false);
  });
});
