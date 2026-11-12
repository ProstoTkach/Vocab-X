import { timingSafeEqual } from 'node:crypto';

/** A scheduled run (Vercel Cron, or an outside scheduler) sends `Bearer CRON_SECRET`. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
