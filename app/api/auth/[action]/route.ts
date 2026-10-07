import { z } from 'zod';
import { authenticate, authStatus, AuthError, executeAuth, requireSecureTransport, securityStatus, throttle } from '@/lib/auth/service';
import { jsonError, jsonOk, readJsonBody } from '@/lib/http/api';
import { checkMutationRequest } from '@/lib/http/csrf';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ action: string }> };
const password = z.string().min(1).max(128);
const newPassword = z.string().min(15, 'Use at least 15 characters.').max(128);
const factor = z.string().trim().min(1).max(100);
const schemas: Record<string, z.ZodTypeAny> = {
  setup: z.object({ setupToken: z.string().min(1).max(512), password: newPassword }).strict(),
  login: z.object({ password }).strict(),
  verify: z.object({ challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: factor }).strict(),
  logout: z.object({}).strict(),
  enroll: z.object({ password }).strict(),
  confirm: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
  disable: z.object({ password, code: factor }).strict(),
  password: z.object({ password, newPassword, code: factor.optional() }).strict(),
  recovery: z.object({ password, code: factor }).strict(),
};
function errorResponse(error: unknown): Response {
  if (error instanceof AuthError) return jsonError(error.status, error.code, error.message, undefined, error.status === 429 ? { 'retry-after': '300' } : undefined);
  // Database/crypto errors can contain credential material. Never log raw errors here.
  logger.error('admin authentication failed');
  return jsonError(503, 'auth_unavailable', 'Authentication is unavailable. Check the server configuration.');
}
export async function GET(req: Request, context: Context): Promise<Response> {
  try {
    requireSecureTransport(req);
    const { action } = await context.params;
    if (action === 'status') return jsonOk(await authStatus());
    if (action === 'security') return jsonOk(await securityStatus(req));
    return jsonError(405, 'method_not_allowed', 'Use POST for this action.', undefined, { allow: 'POST' });
  } catch (error) { return errorResponse(error); }
}
export async function POST(req: Request, context: Context): Promise<Response> {
  try {
    requireSecureTransport(req);
    if (!checkMutationRequest(req).ok) return jsonError(403, 'forbidden', 'Request refused.');
    const { action } = await context.params;
    const schema = schemas[action];
    if (!schema) return jsonError(404, 'not_found', 'Unknown authentication action.');
    // Anonymous callers cannot exhaust buckets for authenticated security operations.
    if (!['setup', 'login', 'verify'].includes(action)) await authenticate(req);
    // Count malformed input as attempts as well as incorrect credentials.
    if (action !== 'logout') await throttle(req, ['login', 'verify'].includes(action) ? 'login' : action);
    const body = await readJsonBody(req, 4096);
    if (!body.ok) return jsonError(400, 'bad_request', 'Invalid authentication request.');
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return jsonError(422, 'validation', action === 'setup' || action === 'password' ? 'Use a password between 15 and 128 characters and complete all fields.' : 'Complete all authentication fields correctly.');
    return jsonOk(await executeAuth(action, parsed.data as Record<string, string>, req));
  } catch (error) { return errorResponse(error); }
}
