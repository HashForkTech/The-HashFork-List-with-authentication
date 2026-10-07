import { authenticate, AuthError } from '@/lib/auth/service';
import { checkMutationRequest } from '@/lib/http/csrf';
import { jsonError } from '@/lib/http/api';
import { logger } from '@/lib/logger';

/** Server-side bearer authorization; middleware/UI alone are never sufficient. */
export async function rejectUnauthorized(req: Request): Promise<Response | null> {
  try { await authenticate(req); return null; }
  catch (error) {
    if (error instanceof AuthError) return jsonError(error.status, error.code, error.message);
    logger.error('admin authorization unavailable');
    return jsonError(503, 'auth_unavailable', 'Authentication is unavailable.');
  }
}
export async function rejectUntrustedMutation(req: Request): Promise<Response | null> {
  const check = checkMutationRequest(req);
  if (!check.ok) {
    logger.warn('blocked cross-origin mutation attempt', { reason: check.reason });
    return jsonError(403, 'forbidden', 'Request refused. Reload the page and try again.');
  }
  return rejectUnauthorized(req);
}
