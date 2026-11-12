import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { crossSite, fail, requestUserId } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

/**
 * Deletes the account and, with it, everything the server has of this learner: every table
 * refers to `users` with ON DELETE CASCADE, so no row stays behind. It cannot be undone.
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const userId = await requestUserId(request);
  if (!userId) return fail(401);
  try {
    await db.delete(users).where(eq(users.id, userId));
    return fail(204);
  } catch (e) {
    console.error('account deletion failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
