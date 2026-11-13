import type { NextRequest } from 'next/server';
import { crossSite, fail, NO_STORE, requestCaller } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { signInMethods } from '@/lib/email-accounts';
import { pushEndpoint } from '@/lib/push';
import { anonDbFromEnv } from '@/lib/db/anon-client';
import { removeReminderDb } from '@/lib/reminder-store';
import { liveAccount } from '@/lib/sessions';

/** How the signed-in account signs in (`{ password, google }`), for the profile's choices. */
export async function GET(request: NextRequest): Promise<Response> {
  const db = dbFromEnv();
  if (!db) return fail(503);
  const caller = await requestCaller(request);
  if (!caller) return fail(401);
  const methods = await signInMethods(db, caller);
  return methods ? Response.json(methods, { headers: NO_STORE }) : fail(401);
}

/**
 * Deletes the account and, with it, everything the server has of this learner: every table
 * refers to `users` with ON DELETE CASCADE, so no row stays behind. It cannot be undone.
 * Reminders are not tied to an account: the browser may send `{ endpoint }` (its push address),
 * and that subscription's row is removed from the anonymous-data database.
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const caller = await requestCaller(request);
  if (!caller) return fail(401);
  try {
    // A session that was ended cannot delete the account.
    const gone = await db.delete(users).where(liveAccount(caller)).returning({ id: users.id });
    if (gone.length === 0) return fail(401);
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
    if (!endpoint) return;
    const anon = anonDbFromEnv();
    if (anon) await removeReminderDb(anon, endpoint);
  } catch (e) {
    console.error('account deletion: reminder row', e instanceof Error ? e.message : 'unknown');
  }
}
