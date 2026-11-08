import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

/** Who is asking, from the signed cookie alone (no database). Null: not signed in. */
export async function requestUserId(request: NextRequest): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const token = await getToken({ req: request, secret });
  return token?.sub ?? null;
}

export const NO_STORE = { 'Cache-Control': 'no-store' };
export const fail = (status: number) => new Response(null, { status, headers: NO_STORE });
