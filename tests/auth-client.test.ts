// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi, adminRequest } from '@/lib/api/admin-client';
import { authApi } from '@/lib/api/auth-client';
import { clearAdminSession, getAdminSession, setAdminSession } from '@/lib/api/admin-session';

const session = { token: 'example-memory-bearer', expiresAt: '2099-01-01T00:00:00.000Z' };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  clearAdminSession();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { clearAdminSession(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Cookie-free admin client', () => {
  it('sends memory bearer credentials and explicitly omits cookies', async () => {
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');
    setAdminSession(session);
    fetchMock.mockResolvedValue(Response.json({ settings: { siteTitle: 'A new title' } }));
    await adminApi.updateSettings('A new title');
    expect(fetchMock).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
      credentials: 'omit', cache: 'no-store', method: 'PATCH',
      headers: expect.objectContaining({ authorization: `Bearer ${session.token}`, 'x-requested-with': 'hashfork-admin' }),
    }));
    expect(localWrite).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
  });

  it('does not attach a session to public authentication requests', async () => {
    setAdminSession(session);
    fetchMock.mockResolvedValue(Response.json({ initialized: true, setupAvailable: false }));
    await authApi.status();
    const options = fetchMock.mock.calls[0][1];
    expect(options?.credentials).toBe('omit');
    expect(options?.headers).not.toHaveProperty('authorization');
  });

  it('drops the matching bearer when the server rejects a protected session', async () => {
    setAdminSession(session);
    fetchMock.mockResolvedValue(Response.json({ error: { code: 'unauthorized', message: 'Session expired' } }, { status: 401 }));
    const result = await adminApi.deleteItem('item');
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(getAdminSession()).toBeNull();
  });

  it('keeps the session when fresh password or second-factor verification fails', async () => {
    setAdminSession(session);
    fetchMock.mockResolvedValue(Response.json({ error: { code: 'invalid_credentials', message: 'Incorrect credentials' } }, { status: 403 }));
    await authApi.password('incorrect password', 'a replacement password');
    expect(getAdminSession()).toEqual(session);
  });

  it('keeps a newly rotated session when an older request returns 401 late', async () => {
    setAdminSession(session);
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = adminRequest('/api/export');
    const rotated = { ...session, token: 'rotated-memory-bearer' };
    setAdminSession(rotated);
    finish(Response.json({ error: { code: 'unauthorized' } }, { status: 401 }));
    await pending;
    expect(getAdminSession()).toEqual(rotated);
  });

  it('uses the authenticated request to download a backup as a blob', async () => {
    setAdminSession(session);
    fetchMock.mockResolvedValue(new Response('{"categories":[],"items":[]}', { headers: { 'content-type': 'application/json' } }));
    const result = await adminApi.exportData();
    expect(result.ok).toBe(true);
    if (result.ok) expect(await result.data.text()).toContain('categories');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ authorization: `Bearer ${session.token}` });
  });
});
