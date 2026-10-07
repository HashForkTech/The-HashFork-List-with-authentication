// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { clearAdminSession, getAdminSession } from '@/lib/api/admin-session';

const contentApi = vi.hoisted(() => ({ listCategories: vi.fn(), listItems: vi.fn(), getSettings: vi.fn() }));
const auth = vi.hoisted(() => ({ status: vi.fn(), security: vi.fn(), setup: vi.fn(), login: vi.fn(), verify: vi.fn(), logout: vi.fn() }));
vi.mock('@/lib/api/admin-client', () => ({ adminApi: contentApi }));
vi.mock('@/lib/api/auth-client', () => ({ authApi: auth }));
vi.mock('@/components/admin/AdminDashboard', () => ({
  AdminDashboard: ({ onLogout }: { onLogout: () => Promise<string | null> }) => <div><h1>Protected dashboard</h1><button onClick={() => void onLogout()}>Sign out</button></div>,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...rest}>{children}</a>,
}));

import { AuthGate } from '@/components/admin/AuthGate';
const ok = <T,>(data: T) => ({ ok: true as const, data });
const session = { token: 'test-bearer', expiresAt: '2099-01-01T00:00:00.000Z' };

beforeEach(() => {
  clearAdminSession(); vi.clearAllMocks();
  auth.status.mockResolvedValue(ok({ initialized: true, setupAvailable: false }));
  auth.security.mockResolvedValue(ok({ mfaEnabled: false, expiresAt: session.expiresAt }));
  auth.login.mockResolvedValue(ok(session));
  auth.logout.mockResolvedValue(ok({ ok: true }));
  contentApi.listCategories.mockResolvedValue(ok({ categories: [] }));
  contentApi.listItems.mockResolvedValue(ok({ items: [] }));
  contentApi.getSettings.mockResolvedValue(ok({ settings: { siteTitle: 'Test list' } }));
});
afterEach(() => { cleanup(); clearAdminSession(); });

async function signIn() {
  fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'a long admin password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Admin authentication gate', () => {
  it('does not fetch dashboard data before successful authentication', async () => {
    render(<AuthGate />);
    await screen.findByLabelText('Password');
    expect(contentApi.listCategories).not.toHaveBeenCalled();
    expect(contentApi.listItems).not.toHaveBeenCalled();
    await signIn();
    await screen.findByRole('heading', { name: 'Protected dashboard' });
    expect(getAdminSession()).toEqual(session);
    expect(contentApi.listCategories).toHaveBeenCalledOnce();
  });

  it('requires a matching first-login password and deployment setup token', async () => {
    auth.status.mockResolvedValue(ok({ initialized: false, setupAvailable: true }));
    auth.setup.mockResolvedValue(ok(session));
    render(<AuthGate />);
    fireEvent.change(await screen.findByLabelText('Owner setup token'), { target: { value: 'owner-setup-token' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a long admin password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a different password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create password and sign in' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The passwords do not match.');
    expect(auth.setup).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a long admin password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create password and sign in' }));
    await screen.findByRole('heading', { name: 'Protected dashboard' });
    expect(auth.setup).toHaveBeenCalledWith('owner-setup-token', 'a long admin password');
  });

  it('requires the MFA challenge before fetching content or creating a session', async () => {
    auth.login.mockResolvedValue(ok({ mfaRequired: true, challenge: 'one-time-challenge' }));
    auth.verify.mockResolvedValue(ok(session));
    render(<AuthGate />);
    await signIn();
    fireEvent.change(await screen.findByLabelText('Authenticator or recovery code'), { target: { value: 'recovery-code' } });
    expect(getAdminSession()).toBeNull();
    expect(contentApi.listItems).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    await screen.findByRole('heading', { name: 'Protected dashboard' });
    expect(auth.verify).toHaveBeenCalledWith('one-time-challenge', 'recovery-code');
  });

  it('returns to sign in after session rejection and explains why', async () => {
    render(<AuthGate />);
    await signIn();
    await screen.findByRole('heading', { name: 'Protected dashboard' });
    act(() => clearAdminSession('Your session has ended. Sign in again to continue.'));
    await screen.findByLabelText('Password');
    expect(screen.queryByRole('heading', { name: 'Protected dashboard' })).toBeNull();
    expect(screen.getByText('Your session has ended. Sign in again to continue.')).toBeTruthy();
  });

  it('revokes the server session and clears the memory bearer on sign out', async () => {
    render(<AuthGate />);
    await signIn();
    await screen.findByRole('heading', { name: 'Protected dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(getAdminSession()).toBeNull());
    await screen.findByLabelText('Password');
    expect(auth.logout).toHaveBeenCalledOnce();
  });
});

it('switches to password sign in if another session completed first-login setup', async () => {
  auth.status.mockResolvedValueOnce(ok({ initialized: false, setupAvailable: true }));
  auth.setup.mockResolvedValue({ ok: false, status: 409, code: 'already_initialized', message: 'Admin setup has already been completed.' });
  render(<AuthGate />);
  fireEvent.change(await screen.findByLabelText('Owner setup token'), { target: { value: 'owner-setup-token' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a long admin password' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a long admin password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create password and sign in' }));
  await screen.findByLabelText('Password');
  expect(screen.queryByLabelText('Owner setup token')).toBeNull();
  expect(screen.getByText('Admin setup has already been completed.')).toBeTruthy();
  expect(getAdminSession()).toBeNull();
});
