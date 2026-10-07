import { getStore } from '@/lib/db/store';
import { getSettings, setSiteTitle } from '@/lib/db/repositories/settings';
import { jsonError, jsonOk, readJsonBody } from '@/lib/http/api';
import { rejectUntrustedMutation } from '@/lib/http/guard';
import { logger } from '@/lib/logger';
import { formatIssues, settingsInputSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/settings — public read (the main page renders the title from it). */
export async function GET(): Promise<Response> {
  try {
    return jsonOk({ settings: await getSettings(getStore()) });
  } catch (error) {
    logger.error('reading settings failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}

/**
 * PATCH /api/settings (admin authentication required) — updates site settings such as the
 * title of the main page. Values are validated and trimmed server-side.
 */
export async function PATCH(req: Request): Promise<Response> {
  try {
    const denied = await rejectUntrustedMutation(req);
    if (denied) return denied;

    const body = await readJsonBody(req);
    if (!body.ok) return jsonError(400, 'bad_request', 'Invalid request: unreadable data.');

    const parsed = settingsInputSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(422, 'validation', 'Some fields are invalid.', {
        issues: formatIssues(parsed.error),
      });
    }

    const settings = await setSiteTitle(getStore(), parsed.data.siteTitle);
    logger.info('settings updated', { siteTitle: settings.siteTitle });
    return jsonOk({ settings });
  } catch (error) {
    logger.error('updating settings failed', { error: (error as Error).message });
    return jsonError(500, 'server_error', 'An internal error occurred. Please try again.');
  }
}
