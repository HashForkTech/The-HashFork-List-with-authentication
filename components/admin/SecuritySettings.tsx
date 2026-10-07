'use client';

import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Download, ShieldCheck } from 'lucide-react';
import { authApi } from '@/lib/api/auth-client';
import { getAdminSession, setAdminSession, type AdminSession } from '@/lib/api/admin-session';
import type { ApiResult } from '@/lib/api/admin-client';

type Mode = 'password' | 'enroll' | 'disable' | 'recovery' | null;
type Enrollment = { secret: string; uri: string };

function downloadCodes(codes: string[]) {
  const blob = new Blob([
    'The HashFork List — admin recovery codes\n\nEach code can be used once. Keep these codes somewhere private.\n\n',
    codes.join('\n'), '\n',
  ], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hashfork-admin-recovery-codes.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Password and optional TOTP settings, with fresh credentials for sensitive changes. */
export function SecuritySettings({ initialMfaEnabled, onExitRiskChange }: {
  initialMfaEnabled: boolean;
  onExitRiskChange?: (message: string | null) => void;
}) {
  const [mfaEnabled, setMfaEnabled] = useState(initialMfaEnabled);
  const [mode, setMode] = useState<Mode>(null);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!enrollment) { setQr(null); return; }
    let active = true;
    void QRCode.toDataURL(enrollment.uri, { width: 240, margin: 2, errorCorrectionLevel: 'M' })
      .then((value) => { if (active) setQr(value); })
      .catch(() => { if (active) setQr(null); });
    return () => { active = false; };
  }, [enrollment]);

  useEffect(() => {
    if (!recoveryCodes) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [recoveryCodes]);

  useEffect(() => {
    onExitRiskChange?.(recoveryCodes
      ? 'Your recovery codes will disappear when you leave. Continue only after saving them.'
      : enrollment
        ? 'Authenticator setup is unfinished. Leave without enabling two-factor authentication?'
        : password || newPassword || confirmation || code
          ? 'Leave without submitting your security changes?'
          : null);
    return () => onExitRiskChange?.(null);
  }, [recoveryCodes, enrollment, password, newPassword, confirmation, code, onExitRiskChange]);

  function select(nextMode: Mode) {
    setMode(nextMode);
    setPassword(''); setNewPassword(''); setConfirmation(''); setCode('');
    setEnrollment(null); setError(null); setMessage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !mode) return;
    setError(null); setMessage(null);
    if (mode === 'password' && newPassword !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    const originalToken = getAdminSession()?.token;
    if (mode === 'enroll') {
      const result = await authApi.enroll(password);
      setBusy(false); setPassword('');
      if (!result.ok) { setError(result.message); return; }
      setEnrollment(result.data);
      return;
    }
    const result: ApiResult<AdminSession & { recoveryCodes?: string[] }> = mode === 'password'
      ? await authApi.password(password, newPassword, mfaEnabled ? code.trim() : undefined)
      : mode === 'disable'
        ? await authApi.disable(password, code.trim())
        : await authApi.recovery(password, code.trim());
    setBusy(false);
    setPassword(''); setNewPassword(''); setConfirmation(''); setCode('');
    if (!result.ok) { setError(result.message); return; }
    if (!originalToken || getAdminSession()?.token !== originalToken) return;
    setAdminSession({ token: result.data.token, expiresAt: result.data.expiresAt });
    if (mode === 'disable') setMfaEnabled(false);
    if (result.data.recoveryCodes) setRecoveryCodes(result.data.recoveryCodes);
    setMessage(mode === 'password'
      ? 'Password changed. All other sessions have been signed out.'
      : mode === 'disable'
        ? 'Two-factor authentication disabled. All other sessions have been signed out.'
        : 'New recovery codes created. All previous recovery codes are now invalid.');
    setMode(null);
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const originalToken = getAdminSession()?.token;
    const result = await authApi.confirm(code.trim());
    setBusy(false); setCode('');
    if (!result.ok) { setError(result.message); return; }
    if (!originalToken || getAdminSession()?.token !== originalToken) return;
    setAdminSession({ token: result.data.token, expiresAt: result.data.expiresAt });
    setMfaEnabled(true); setEnrollment(null); setMode(null);
    setRecoveryCodes(result.data.recoveryCodes);
    setMessage('Two-factor authentication enabled. All other sessions have been signed out.');
  }

  return (
    <section aria-labelledby="security-title" className="mt-14">
      <h2 id="security-title" className="section-title">Security</h2>
      <div className="panel mt-4 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-base font-medium text-paper">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Admin authentication
        </div>
        <p className="field-hint">
          Two-factor authentication is <strong>{mfaEnabled ? 'enabled' : 'disabled'}</strong>.
          {mfaEnabled ? ' Sign in with your password and an authenticator code.' : ' Add an authenticator app for extra protection.'}
        </p>
        {message ? <p role="status" className="mt-4 text-sm text-paper/75">{message}</p> : null}
        {error ? <p role="alert" className="field-error mt-4">{error}</p> : null}

        {recoveryCodes ? (
          <div className="mt-5 rounded-sm border border-paper/25 p-4">
            <h3 className="text-sm font-semibold text-paper">Save your recovery codes</h3>
            <p className="field-hint">These codes are shown only once. Each code replaces one authenticator code at sign in. Keep them private and separate from your password.</p>
            <ul aria-label="Recovery codes" className="mt-3 grid gap-2 font-mono text-sm text-paper sm:grid-cols-2">
              {recoveryCodes.map((recoveryCode) => <li key={recoveryCode}>{recoveryCode}</li>)}
            </ul>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="btn" onClick={() => downloadCodes(recoveryCodes)}><Download className="h-4 w-4" aria-hidden="true" />Download codes</button>
              <button type="button" className="btn" onClick={() => setRecoveryCodes(null)}>I saved these codes</button>
            </div>
          </div>
        ) : enrollment ? (
          <form onSubmit={(event) => void confirmEnrollment(event)} className="mt-5 max-w-lg space-y-4">
            <h3 className="text-base font-medium text-paper">Connect your authenticator</h3>
            <p className="field-hint">Scan this QR code in your authenticator app, or enter the setup key manually. Confirm a current code to finish enabling two-factor authentication.</p>
            {qr ? (
              // The QR code is generated locally; the enrollment secret never goes to an image service.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Authenticator setup QR code" width={240} height={240} className="rounded-sm" />
            ) : null}
            <div><p className="field-label">Manual setup key</p><code className="block break-all select-all text-sm text-paper">{enrollment.secret}</code><p className="field-hint">Time-based codes (TOTP), 6 digits, SHA-1, changing every 30 seconds.</p></div>
            <div><label htmlFor="enrollment-code" className="field-label">Authenticator confirmation code</label><input id="enrollment-code" className="field-input" type="text" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} required /></div>
            <div className="flex flex-wrap gap-3"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Enable two-factor authentication'}</button><button type="button" className="btn" disabled={busy} onClick={() => select(null)}>Cancel setup</button></div>
          </form>
        ) : mode ? (
          <form onSubmit={(event) => void submit(event)} className="mt-5 max-w-lg space-y-4" aria-label={mode === 'password' ? 'Change password' : mode === 'enroll' ? 'Set up two-factor authentication' : mode === 'disable' ? 'Disable two-factor authentication' : 'Regenerate recovery codes'}>
            <div><label htmlFor="security-password" className="field-label">Current password</label><input id="security-password" className="field-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} required /></div>
            {mode === 'password' ? <>
              <div><label htmlFor="security-new-password" className="field-label">New password</label><input id="security-new-password" className="field-input" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={15} maxLength={128} required /><p className="field-hint">Use 15–128 characters.</p></div>
              <div><label htmlFor="security-confirm-password" className="field-label">Confirm new password</label><input id="security-confirm-password" className="field-input" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={15} maxLength={128} required /></div>
            </> : null}
            {mfaEnabled ? <div><label htmlFor="security-code" className="field-label">Authenticator or recovery code</label><input id="security-code" className="field-input" type="text" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={64} required /></div> : null}
            {mode === 'disable' ? <p className="field-hint">After disabling, only your password will be required to sign in.</p> : mode === 'recovery' ? <p className="field-hint">Creating new recovery codes invalidates every previous recovery code.</p> : null}
            <div className="flex flex-wrap gap-3"><button type="submit" className={mode === 'disable' ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy}>{busy ? 'Checking…' : mode === 'password' ? 'Save new password' : mode === 'enroll' ? 'Continue to authenticator setup' : mode === 'disable' ? 'Disable two-factor authentication' : 'Create new recovery codes'}</button><button type="button" className="btn" disabled={busy} onClick={() => select(null)}>Cancel</button></div>
          </form>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn" onClick={() => select('password')}>Change password</button>
            {mfaEnabled ? <><button type="button" className="btn" onClick={() => select('recovery')}>Regenerate recovery codes</button><button type="button" className="btn btn-danger" onClick={() => select('disable')}>Disable two-factor authentication</button></> : <button type="button" className="btn" onClick={() => select('enroll')}>Set up two-factor authentication</button>}
          </div>
        )}
      </div>
    </section>
  );
}
