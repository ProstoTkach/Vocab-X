import type { NextRequest } from 'next/server';
import { exportAccount } from '@/lib/account-export';
import { fail, NO_STORE, requestCaller } from '@/lib/api-user';
import { dbFromEnv } from '@/lib/db/client';

/** "Download my data": everything the server keeps of the signed-in learner, as JSON. */
export async function GET(request: NextRequest): Promise<Response> {
  const db = dbFromEnv();
  if (!db) return fail(503);
  const caller = await requestCaller(request);
  if (!caller) return fail(401);
  try {
    const data = await exportAccount(db, caller);
    // A cookie of an account that no longer exists.
    if (!data) return fail(401);
    return Response.json(data, { headers: NO_STORE });
  } catch (e) {
    console.error('account export failed', e instanceof Error ? e.message : 'unknown');
    return fail(500);
  }
}
