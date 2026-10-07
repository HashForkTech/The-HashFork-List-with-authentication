/** A bearer session lives only in this JavaScript module; reloads start signed out. */
export type AdminSession = { token: string; expiresAt: string };

let currentSession: AdminSession | null = null;
let signedOutMessage: string | null = null;
const listeners = new Set<() => void>();

export function getAdminSession(): AdminSession | null {
  return currentSession;
}

export function getSignedOutMessage(): string | null {
  return signedOutMessage;
}

export function setAdminSession(session: AdminSession): void {
  currentSession = session;
  signedOutMessage = null;
  for (const listener of listeners) listener();
}

export function clearAdminSession(message: string | null = null): void {
  currentSession = null;
  signedOutMessage = message;
  for (const listener of listeners) listener();
}

export function subscribeAdminSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
