import { checkMutationRequest } from '@/lib/http/csrf';
import { jsonError } from '@/lib/http/api';
import { logger } from '@/lib/logger';

/**
 * Gate for state-changing endpoints.
 *
 * There is no login in this build (see lib/http/csrf.ts): this guard blocks
 * cross-origin "drive-by" mutations and nothing else. Returns `null` when the
 * request may proceed, or a ready-made 403 response.
 */
export function rejectUntrustedMutation(req: Request): Response | null {
  const check = checkMutationRequest(req);
  if (check.ok) return null;
  logger.warn('blocked cross-origin mutation attempt', { reason: check.reason });
  return jsonError(403, 'forbidden', 'Request refused. Reload the page and try again.');
}
