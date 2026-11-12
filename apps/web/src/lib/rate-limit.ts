// How often a route may be asked. The counts live in the database (`rate_limits`), so that every
// server instance counts together; an in-memory count would reset with each new instance.
// Owner's condition (2026-11-12): the database must not be woken for this, so only rare or costly
// routes, and routes that open the database anyway, count there. A check is one statement (an
// upsert that returns the new counts), sent in the same request to the database as the route's
// own statements where it can (`db.batch`). Cheap per-instance limits (`memoryLimiter`) guard
// the routes that must not wake the database, and stand in when there is no database at all.
import { createHmac } from 'node:crypto';
import { and, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { rateLimits } from './db/schema';
import { NO_STORE } from './api-user';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** At most `max` (in units of `cost`, 1 by default) in a window that starts with the first one. */
export interface Rule {
  key: string;
  max: number;
  windowMs: number;
  cost?: number;
}

export interface Count {
  key: string;
  count: number;
  resetAt: Date;
}

export type Verdict = { ok: true } | { ok: false; retryAfterS: number };

/** Over the limit of any rule: how long until the latest of them lets the next one through. */
export function verdictOf(rows: readonly Count[], rules: readonly Rule[], now: number): Verdict {
  let wait = 0;
  for (const rule of rules) {
    const row = rows.find((r) => r.key === rule.key);
    if (row && row.count > rule.max) wait = Math.max(wait, row.resetAt.getTime() - now);
  }
  return wait > 0 ? { ok: false, retryAfterS: Math.ceil(wait / 1000) } : { ok: true };
}

/** Already at the limit (looked at without counting): the next one would be refused. */
export function isFull(rows: readonly Count[], rule: Rule, now: number): boolean {
  const row = rows.find((r) => r.key === rule.key);
  return !!row && row.resetAt.getTime() > now && row.count >= rule.max;
}

const distinct = (rules: readonly Rule[]) => {
  // One upsert cannot touch a row twice.
  if (new Set(rules.map((r) => r.key)).size !== rules.length) throw new Error('duplicate key');
  return rules;
};

/**
 * Counts one more against every rule and returns the counts: one statement, to be sent alone
 * (`spend`) or together with the route's own (`db.batch`). A window that has ended starts again.
 */
export function spendQuery(db: Db, rules: readonly Rule[], now: number) {
  const at = sql`${new Date(now).toISOString()}::timestamptz`;
  const ended: SQL = sql`rate_limits.reset_at <= ${at}`;
  return db
    .insert(rateLimits)
    .values(
      distinct(rules).map((r) => ({
        key: r.key,
        count: r.cost ?? 1,
        resetAt: new Date(now + r.windowMs),
      })),
    )
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${ended} THEN excluded.count ELSE rate_limits.count + excluded.count END`,
        resetAt: sql`CASE WHEN ${ended} THEN excluded.reset_at ELSE rate_limits.reset_at END`,
      },
    })
    .returning({ key: rateLimits.key, count: rateLimits.count, resetAt: rateLimits.resetAt });
}

/** The counts of these keys, without counting anything. */
export const peekQuery = (db: Db, keys: readonly string[]) =>
  db
    .select({ key: rateLimits.key, count: rateLimits.count, resetAt: rateLimits.resetAt })
    .from(rateLimits)
    .where(inArray(rateLimits.key, [...keys]));

/** Forgets every count whose key starts with this (a lock lifted). */
export const forgetQuery = (db: Db, prefix: string) =>
  db.delete(rateLimits).where(sql`starts_with(${rateLimits.key}, ${prefix})`);

/** Rows swept per request: enough to keep up, never a long statement. */
const SWEEP = 20;

/**
 * Deletes a few counts whose window ended over an hour ago, so the table holds only live ones.
 * The outer condition is checked again on a row another request has just started anew.
 */
export function sweepQuery(db: Db, now: number) {
  const before = new Date(now - HOUR_MS);
  return db
    .delete(rateLimits)
    .where(
      and(
        lt(rateLimits.resetAt, before),
        inArray(
          rateLimits.key,
          db
            .select({ key: rateLimits.key })
            .from(rateLimits)
            .where(lt(rateLimits.resetAt, before))
            .limit(SWEEP),
        ),
      ),
    );
}

/** Counts in this server instance only: a guard in front of the database, or its stand-in. */
export function memoryLimiter(maxKeys = 10_000) {
  const counts = new Map<string, { count: number; resetAt: number }>();
  return {
    spend(rules: readonly Rule[], now: number): Verdict {
      const rows = distinct(rules).map((rule) => {
        const known = counts.get(rule.key);
        const c = known && known.resetAt > now ? known : { count: 0, resetAt: now + rule.windowMs };
        c.count += rule.cost ?? 1;
        // The newest last, so the oldest go first when there are too many.
        counts.delete(rule.key);
        counts.set(rule.key, c);
        return { key: rule.key, count: c.count, resetAt: new Date(c.resetAt) };
      });
      while (counts.size > maxKeys) counts.delete(counts.keys().next().value!);
      return verdictOf(rows, rules, now);
    },
  };
}

/** Without a database (local runs, the e2e server) the limits are counted here. */
const standIn = memoryLimiter();

/** Counts one more against the rules, with a sweep, in one request to the database. */
export async function count(db: Db, rules: readonly Rule[], now: number): Promise<Count[]> {
  const [rows] = await db.batch([spendQuery(db, rules, now), sweepQuery(db, now)]);
  return rows;
}

/** Counts one more against the rules (in this instance when there is no database). */
export async function spend(db: Db | null, rules: readonly Rule[], now: number): Promise<Verdict> {
  if (!db) return standIn.spend(rules, now);
  return verdictOf(await count(db, rules, now), rules, now);
}

/**
 * A short keyed hash: the limits tell senders, accounts and addresses apart without keeping any
 * of them. Keyed with the server's secret, so nobody can hash every IPv4 address to undo it.
 */
export function hashed(value: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? 'vocabx-local';
  return createHmac('sha256', secret).update(value).digest('base64url').slice(0, 22);
}

/**
 * The network a request came from. On Vercel `x-real-ip` and `x-forwarded-for` are set by the
 * platform, not by the sender. An IPv6 sender gets a whole /64, so it counts as one.
 */
export function senderNetwork(header: (name: string) => string | null | undefined): string {
  const raw = header('x-real-ip') ?? header('x-forwarded-for')?.split(',')[0];
  const ip = raw?.trim().replace(/%.*$/, '').toLowerCase() || 'local';
  if (!ip.includes(':')) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return mapped[1]!;
  const [head = '', tail] = ip.split('::');
  const start = head ? head.split(':') : [];
  const end = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? start
      : [...start, ...Array<string>(Math.max(0, 8 - start.length - end.length)).fill('0'), ...end];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** Whom the per-sender limits count: the hashed network of the request. */
export const senderKey = (request: Request) =>
  hashed(senderNetwork((name) => request.headers.get(name)));

/** 429 with the time to wait; `body` (JSON) says more where the page shows it. */
export function tooMany(verdict: { retryAfterS: number }, body?: object): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status: 429,
    headers: {
      ...NO_STORE,
      'Retry-After': String(verdict.retryAfterS),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}
