import { adminRequest } from '@/lib/api/admin-client';
import type { AdminSession } from '@/lib/api/admin-session';

export type AuthStatus = { initialized: boolean; setupAvailable: boolean };
export type SecurityStatus = { mfaEnabled: boolean; expiresAt: string };
export type LoginResponse = AdminSession | { mfaRequired: true; challenge: string };
export type RecoveryResponse = AdminSession & { recoveryCodes: string[] };

const post = <T>(action: string, body: unknown, authenticated = true) =>
  adminRequest<T>(`/api/auth/${action}`, { method: 'POST', body, authenticated });

export const authApi = {
  status: () => adminRequest<AuthStatus>('/api/auth/status', { authenticated: false }),
  security: () => adminRequest<SecurityStatus>('/api/auth/security'),
  setup: (setupToken: string, password: string) => post<AdminSession>('setup', { setupToken, password }, false),
  login: (password: string) => post<LoginResponse>('login', { password }, false),
  verify: (challenge: string, code: string) => post<AdminSession>('verify', { challenge, code }, false),
  logout: () => post<{ ok: true }>('logout', {}),
  enroll: (password: string) => post<{ secret: string; uri: string }>('enroll', { password }),
  confirm: (code: string) => post<RecoveryResponse>('confirm', { code }),
  disable: (password: string, code: string) => post<AdminSession>('disable', { password, code }),
  password: (password: string, newPassword: string, code?: string) =>
    post<AdminSession>('password', { password, newPassword, ...(code ? { code } : {}) }),
  recovery: (password: string, code: string) => post<RecoveryResponse>('recovery', { password, code }),
};
