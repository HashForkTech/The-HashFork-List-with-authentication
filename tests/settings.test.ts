import { describe, expect, it } from 'vitest';
import { GET as settingsGet, PATCH as settingsPatch } from '@/app/api/settings/route';
import { apiRequest, readJson, setupTestDatabase } from './helpers';

setupTestDatabase();

type SettingsBody = { settings: { siteTitle: string } };

describe('settings', () => {
  it('defaults the main page title to "The HashFork List"', async () => {
    const res = await settingsGet();
    expect(res.status).toBe(200);
    const { settings } = (await readJson(res)) as SettingsBody;
    expect(settings.siteTitle).toBe('The HashFork List');
  });

  it('updates the main page title (trimmed) and persists it', async () => {
    const res = await settingsPatch(
      apiRequest('/api/settings', { method: 'PATCH', body: { siteTitle: '  My AI Toolbox  ' } }),
    );
    expect(res.status).toBe(200);
    const { settings } = (await readJson(res)) as SettingsBody;
    expect(settings.siteTitle).toBe('My AI Toolbox');

    const after = (await readJson(await settingsGet())) as SettingsBody;
    expect(after.settings.siteTitle).toBe('My AI Toolbox');
  });

  it('rejects an empty title', async () => {
    const res = await settingsPatch(
      apiRequest('/api/settings', { method: 'PATCH', body: { siteTitle: '   ' } }),
    );
    expect(res.status).toBe(422);
  });

  it('rejects a title that is too long', async () => {
    const res = await settingsPatch(
      apiRequest('/api/settings', { method: 'PATCH', body: { siteTitle: 'x'.repeat(101) } }),
    );
    expect(res.status).toBe(422);
  });

  it('requires the mutation header', async () => {
    const res = await settingsPatch(
      apiRequest('/api/settings', {
        method: 'PATCH',
        body: { siteTitle: 'Hijacked' },
        omitMutationHeader: true,
      }),
    );
    expect(res.status).toBe(403);
  });
});
