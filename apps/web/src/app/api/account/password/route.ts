import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { crossSite, fail, requestUserId } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';
import { changePassword } from '@/lib/email-accounts';

const bodySchema = z.object({
  current: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

/** What each result answers: 409 no password yet (a letter sets one), 422 the current one is wrong. */
const STATUS = { ok: 204, wrong: 422, limited: 429, none: 409, gone: 401 } as const;

/** A new password while signed in, `{ current, password }`. */
export async function POST(request: NextRequest): Promise<Response> {
  if (crossSite(request)) return fail(403);
  const db = dbFromEnv();
  if (!db) return fail(503);
  const userId = await requestUserId(request);
  if (!userId) return fail(401);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400);
  try {
    return fail(STATUS[await changePassword(db, userId, body.data, new Date().getTime())]);
  } catch (e) {
    console.error('password change failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
