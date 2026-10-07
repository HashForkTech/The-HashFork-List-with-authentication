// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { clearAdminSession, getAdminSession, setAdminSession } from '@/lib/api/admin-session';

const qr = vi.hoisted(() => ({ toDataURL: vi.fn() }));
const auth = vi.hoisted(() => ({ enroll: vi.fn(), confirm: vi.fn(), password: vi.fn(), disable: vi.fn(), recovery: vi.fn() }));
vi.mock('@/lib/api/auth-client', () => ({ authApi: auth }));
vi.mock('qrcode', () => ({ default: qr }));

import { SecuritySettings } from '@/components/admin/SecuritySettings';
const ok = <T,>(data: T) => ({ ok: true as const, data });
const session = { token: 'rotated-token', expiresAt: '2099-01-01T00:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  qr.toDataURL.mockResolvedValue('data:image/png;base64,example');
  setAdminSession({ ...session, token: 'original-token' });
  auth.enroll.mockResolvedValue(ok({ secret: 'TESTMANUALSECRET', uri: 'otpauth://totp/Example?secret=TESTMANUALSECRET' }));
  auth.confirm.mockResolvedValue(ok({ ...session, recoveryCodes: ['first-code', 'second-code'] }));
  auth.password.mockResolvedValue(ok(session));
  auth.disable.mockResolvedValue(ok(session));
  auth.recovery.mockResolvedValue(ok({ ...session, recoveryCodes: ['new-first-code', 'new-second-code'] }));
});
afterEach(() => { cleanup(); clearAdminSession(); vi.restoreAllMocks(); });

describe('Admin security settings', () => {
  it('enrolls using local QR/manual secret and requires confirmation before showing recovery codes', async () => {
    const onExitRiskChange = vi.fn();
    render(<SecuritySettings initialMfaEnabled={false} onExitRiskChange={onExitRiskChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'a long admin password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to authenticator setup' }));
    await screen.findByText('TESTMANUALSECRET');
    expect(auth.enroll).toHaveBeenCalledWith('a long admin password');
    expect(auth.confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).toBeNull();
    expect(await screen.findByAltText('Authenticator setup QR code')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Authenticator confirmation code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    const codes = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(within(codes).getAllByRole('listitem')).toHaveLength(2);
    expect(auth.confirm).toHaveBeenCalledWith('123456');
    expect(getAdminSession()?.token).toBe('rotated-token');
    expect(onExitRiskChange).toHaveBeenLastCalledWith(expect.stringContaining('recovery codes will disappear'));
    fireEvent.click(screen.getByRole('button', { name: 'I saved these codes' }));
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Regenerate recovery codes' })).toBeTruthy();
  });

  it('preserves enrollment after a rejected confirmation code', async () => {
    auth.confirm.mockResolvedValue({ ok: false, status: 403, code: 'invalid_code', message: 'Incorrect confirmation code.' });
    const onExitRiskChange = vi.fn();
    render(<SecuritySettings initialMfaEnabled={false} onExitRiskChange={onExitRiskChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'a long admin password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to authenticator setup' }));
    fireEvent.change(await screen.findByLabelText('Authenticator confirmation code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
    await screen.findByText('Incorrect confirmation code.');
    expect(screen.getByText('TESTMANUALSECRET')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Recovery codes' })).toBeNull();
    expect(getAdminSession()?.token).toBe('original-token');
  });

  it('requires confirmed password and a second factor to change an MFA-protected password', async () => {
    render(<SecuritySettings initialMfaEnabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'a long admin password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a replacement admin password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'incorrect confirmation' } });
    fireEvent.change(screen.getByLabelText('Authenticator or recovery code'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(screen.getByText('The new passwords do not match.')).toBeTruthy();
    expect(auth.password).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'a replacement admin password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    await waitFor(() => expect(auth.password).toHaveBeenCalledWith('a long admin password', 'a replacement admin password', '654321'));
    await screen.findByText('Password changed. All other sessions have been signed out.');
    expect(screen.queryByLabelText('Current password')).toBeNull();
  });

  it('requires fresh password and factor to disable MFA and adopts the replacement session', async () => {
    render(<SecuritySettings initialMfaEnabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Disable two-factor authentication' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'a long admin password' } });
    fireEvent.change(screen.getByLabelText('Authenticator or recovery code'), { target: { value: 'recovery-code' } });
    fireEvent.click(within(screen.getByRole('form', { name: 'Disable two-factor authentication' })).getByRole('button', { name: 'Disable two-factor authentication' }));
    await waitFor(() => expect(auth.disable).toHaveBeenCalledWith('a long admin password', 'recovery-code'));
    await screen.findByRole('button', { name: 'Set up two-factor authentication' });
    expect(getAdminSession()?.token).toBe('rotated-token');
  });
});



it('does not restore a session from a confirmation response after sign out', async () => {
  let finish!: (value: { ok: true; data: { token: string; expiresAt: string; recoveryCodes: string[] } }) => void;
  auth.confirm.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<SecuritySettings initialMfaEnabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'a long admin password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to authenticator setup' }));
  fireEvent.change(await screen.findByLabelText('Authenticator confirmation code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));
  act(() => clearAdminSession());
  await act(async () => { finish(ok({ ...session, recoveryCodes: ['first-code'] })); });
  expect(getAdminSession()).toBeNull();
  expect(screen.queryByRole('list', { name: 'Recovery codes' })).toBeNull();
});
