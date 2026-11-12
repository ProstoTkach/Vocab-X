import type { NextRequest } from 'next/server';
import { crossSite, fail, requestCaller } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { liveAccount } from '@/lib/sessions';

/**
 * "Sign out on all devices": every session of the account signed in until now stops counting,
 * this one too (the page signs itself out after). For a lost phone or a password someone saw.
 * 204; 401: not signed in, the account is gone, or this session was already ended.
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const caller = await requestCaller(request);
  if (!caller) return fail(401);
  try {
    // A millisecond on: a session that signed in this very moment ends as well.
    const ended = await db
      .update(users)
      .set({ sessionsSince: new Date(new Date().getTime() + 1) })
      .where(liveAccount(caller))
      .returning({ id: users.id });
    return fail(ended.length > 0 ? 204 : 401);
  } catch (e) {
    console.error('sign out everywhere failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
