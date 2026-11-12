import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { crossSite, fail, requestUserId } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { sheetsConfigFromEnv } from '@/lib/google-sheets';
import { pushEndpoint } from '@/lib/push';
import { removeReminder } from '@/lib/reminder-store';

/**
 * Deletes the account and, with it, everything the server has of this learner: every table
 * refers to `users` with ON DELETE CASCADE, so no row stays behind. It cannot be undone.
 * Reminders are not tied to an account: the browser may send `{ endpoint }` (its push address),
 * and that subscription's row is emptied in the spreadsheet too.
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const userId = await requestUserId(request);
  if (!userId) return fail(401);
  try {
    await db.delete(users).where(eq(users.id, userId));
    await forgetReminder(request);
    return fail(204);
  } catch (e) {
    console.error('account deletion failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}

/** Best effort: the account is already gone, a failure here is only logged (no address in it). */
async function forgetReminder(request: Request): Promise<void> {
  try {
    const text = await request.text();
    if (!text || text.length > 2000) return;
    const endpoint = pushEndpoint((JSON.parse(text) as { endpoint?: unknown }).endpoint);
    const sheets = sheetsConfigFromEnv(process.env, 'GOOGLE_SPREADSHEET_ANALYTICS_ID');
    if (endpoint && sheets) await removeReminder(sheets, endpoint);
  } catch (e) {
    console.error('account deletion: reminder row', e instanceof Error ? e.message : 'unknown');
  }
}
