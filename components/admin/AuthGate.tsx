'use client';

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { adminApi } from '@/lib/api/admin-client';
import { authApi, type AuthStatus } from '@/lib/api/auth-client';
import {
  clearAdminSession,
  getAdminSession,
  getSignedOutMessage,
  setAdminSession,
  subscribeAdminSession,
} from '@/lib/api/admin-session';
import type { CategoryWithCount, ListItem } from '@/lib/types';

type DashboardData = {
  categories: CategoryWithCount[];
  items: ListItem[];
  siteTitle: string;
  mfaEnabled: boolean;
};

/** The server renders this login shell without querying or exposing admin data. */
export function AuthGate() {
  const session = useSyncExternalStore(subscribeAdminSession, getAdminSession, () => null);
  const signedIn = Boolean(session);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (signedIn) return;
    let active = true;
    setData(null);
    setStatus(null);
    setChallenge(null);
    setError(null);
    void authApi.status().then((result) => {
      if (!active) return;
      if (result.ok) setStatus(result.data);
      else setError(result.message);
    });
    return () => { active = false; };
  }, [signedIn, retry]);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    setError(null);
    void Promise.all([
      adminApi.listCategories(), adminApi.listItems(), adminApi.getSettings(), authApi.security(),
    ]).then(([categories, items, settings, security]) => {
      if (!active) return;
      if (categories.ok && items.ok && settings.ok && security.ok) {
        setData({
          categories: categories.data.categories,
          items: items.data.items,
          siteTitle: settings.data.settings.siteTitle,
          mfaEnabled: security.data.mfaEnabled,
        });
      } else {
        const failure = [categories, items, settings, security].find((result) => !result.ok);
        if (failure && !failure.ok) setError(failure.message);
      }
    });
    return () => { active = false; };
  }, [signedIn, retry]);

  useEffect(() => {
    if (!session) return;
    const remaining = new Date(session.expiresAt).getTime() - Date.now();
    const timeout = window.setTimeout(() => {
      clearAdminSession('Your session has expired. Sign in again to continue.');
    }, Math.max(0, Math.min(remaining, 2_147_483_647)));
    return () => window.clearTimeout(timeout);
  }, [session]);

  async function logout(): Promise<string | null> {
    const result = await authApi.logout();
    if (!result.ok && result.status !== 401) return result.message;
    clearAdminSession('You have signed out.');
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status || busy) return;
    setError(null);
    if (!status.initialized && password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    const result = challenge
      ? await authApi.verify(challenge, code.trim())
      : status.initialized
        ? await authApi.login(password)
        : await authApi.setup(setupToken.trim(), password);
    setBusy(false);
    setPassword('');
    setConfirmation('');
    setCode('');
    if (!result.ok) {
      if (!status.initialized && result.status === 409) {
        const refreshed = await authApi.status();
        if (refreshed.ok) { setStatus(refreshed.data); setSetupToken(''); }
      }
      setError(result.message);
      return;
    }
    if ('mfaRequired' in result.data) {
      setChallenge(result.data.challenge);
      return;
    }
    setSetupToken('');
    setChallenge(null);
    setAdminSession(result.data);
  }

  if (signedIn && data) {
    return <AdminDashboard
      initialCategories={data.categories}
      initialItems={data.items}
      initialSiteTitle={data.siteTitle}
      initialMfaEnabled={data.mfaEnabled}
      onLogout={logout}
    />;
  }

  const setup = status && !status.initialized;
  return (
    <AdminLayout>
      <main id="main-content" className="mx-auto w-full max-w-xl px-4 pb-24 pt-12 sm:px-6">
        <p className="section-title">Administration</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-paper">
          {signedIn ? 'Loading your dashboard' : challenge ? 'Two-factor authentication' : setup ? 'Create your admin password' : 'Admin sign in'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-paper/65">
          Your session stays in this tab’s memory. Refreshing the page signs you out. No cookies are used.
        </p>
        {getSignedOutMessage() && !signedIn ? (
          <p role="status" className="mt-5 text-sm text-paper/75">{getSignedOutMessage()}</p>
        ) : null}
        {error ? <p role="alert" className="field-error mt-5">{error}</p> : null}
        {signedIn || !status ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {error ? <button type="button" className="btn" onClick={() => setRetry((value) => value + 1)}>Try again</button> : <p role="status" className="text-sm text-paper/60">Loading…</p>}
            {signedIn ? <button type="button" className="btn" onClick={() => void logout().then(setError)}>Sign out</button> : null}
          </div>
        ) : setup && !status.setupAvailable ? (
          <p className="panel mt-6 p-5 text-sm text-paper/75">
            Initial setup is unavailable. Configure ADMIN_SETUP_TOKEN on the deployment, then reload this page.
          </p>
        ) : (
          <form className="panel mt-6 space-y-5 p-5" onSubmit={(event) => void submit(event)}>
            {challenge ? (
              <div>
                <label htmlFor="login-code" className="field-label">Authenticator or recovery code</label>
                <input id="login-code" className="field-input" type="text" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={64} autoFocus />
                <p className="field-hint">Enter a current authenticator code, or one unused recovery code.</p>
              </div>
            ) : (
              <>
                {setup ? (
                  <div>
                    <label htmlFor="setup-token" className="field-label">Owner setup token</label>
                    <input id="setup-token" className="field-input" type="password" autoComplete="off" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} required />
                    <p className="field-hint">Paste the ADMIN_SETUP_TOKEN configured for this deployment. Setup can only be completed once.</p>
                  </div>
                ) : null}
                <div>
                  <label htmlFor="login-password" className="field-label">{setup ? 'New password' : 'Password'}</label>
                  <input id="login-password" className="field-input" type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={setup ? 15 : undefined} maxLength={128} required />
                  {setup ? <p className="field-hint">Use 15–128 characters. The app stores only a salted, one-way password hash.</p> : null}
                </div>
                {setup ? (
                  <div>
                    <label htmlFor="confirm-password" className="field-label">Confirm password</label>
                    <input id="confirm-password" className="field-input" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={15} maxLength={128} required />
                  </div>
                ) : null}
              </>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : challenge ? 'Verify code' : setup ? 'Create password and sign in' : 'Sign in'}</button>
              {challenge ? <button type="button" className="btn" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setError(null); }}>Start again</button> : null}
            </div>
          </form>
        )}
      </main>
    </AdminLayout>
  );
}
