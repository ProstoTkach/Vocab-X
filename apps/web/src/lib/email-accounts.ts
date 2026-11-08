// Accounts with an email and a password. An address counts only once its owner has clicked the
// link in the letter; until then the account cannot sign in.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { users } from './db/schema';
import { siteUrl, sendEmail } from './email';
import { emailLocale, renderAlreadyEmail, renderVerifyEmail } from './email-templates';
import { hashPassword, newToken, tokenHash, verifyPassword } from './password';

const LINK_LIFETIME_MS = 24 * 3_600_000;
/** One letter a minute to one address, however often someone asks. */
const LETTER_GAP_MS = 60_000;
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60_000;
/** A wrong password waits this long: guessing by trying many is slow. */
const WRONG_DELAY_MS = 800;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const byEmail = (email: string) =>
  and(sql`lower(${users.email}) = ${normalizeEmail(email)}`, isNull(users.deletedAt));

type Row = typeof users.$inferSelect;

async function findByEmail(db: Db, email: string): Promise<Row | null> {
  const [row] = await db.select().from(users).where(byEmail(email));
  return row ?? null;
}

const sentRecently = (row: Row, now: number) =>
  !!row.verifySentAt && now - row.verifySentAt.getTime() < LETTER_GAP_MS;

/** A letter that did not go out does not count towards the wait for the next one. */
async function sendCounted(db: Db, id: string, send: () => Promise<void>) {
  try {
    await send();
  } catch (e) {
    await db.update(users).set({ verifySentAt: null }).where(eq(users.id, id));
    throw e;
  }
}

async function sendConfirmation(db: Db, row: Row, locale: string, now: number) {
  const { token, hash } = newToken();
  const lang = emailLocale(locale);
  const link = `${siteUrl()}/api/account/verify?token=${token}&lang=${lang}`;
  await db
    .update(users)
    .set({
      verifyTokenHash: hash,
      verifyExpiresAt: new Date(now + LINK_LIFETIME_MS),
      verifySentAt: new Date(now),
    })
    .where(eq(users.id, row.id));
  await sendCounted(db, row.id, () =>
    sendEmail(row.email, (wolf) => renderVerifyEmail(lang, link, wolf), link),
  );
}

/**
 * Registers an address, or says nothing new about one already taken: whoever asks gets the same
 * answer, and only the address's owner learns from the letter which it was.
 */
export async function register(
  db: Db,
  input: { email: string; password: string; locale: string },
  now: number,
): Promise<void> {
  const email = normalizeEmail(input.email);
  const existing = await findByEmail(db, email);
  if (existing?.emailVerifiedAt) {
    if (sentRecently(existing, now)) return;
    await db
      .update(users)
      .set({ verifySentAt: new Date(now) })
      .where(eq(users.id, existing.id));
    const lang = emailLocale(input.locale);
    const link = `${siteUrl()}/${lang}/profile`;
    await sendCounted(db, existing.id, () =>
      sendEmail(email, (wolf) => renderAlreadyEmail(lang, link, wolf), link),
    );
    return;
  }
  const passwordHash = await hashPassword(input.password);
  if (existing) {
    // Never confirmed: the last one to register is the one whose password counts.
    await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
    if (sentRecently(existing, now)) return;
    await sendConfirmation(db, existing, input.locale, now);
    return;
  }
  const [row] = await db.insert(users).values({ email, passwordHash }).returning();
  await sendConfirmation(db, row!, input.locale, now);
}

/** Another letter for an address still waiting. Says nothing about whether it exists. */
export async function resendConfirmation(db: Db, email: string, locale: string, now: number) {
  const row = await findByEmail(db, email);
  if (!row || row.emailVerifiedAt || sentRecently(row, now)) return;
  await sendConfirmation(db, row, locale, now);
}

/**
 * The link in the letter. It keeps working until it expires: mail scanners open links before the
 * owner does, and the owner must not then be told that it failed.
 */
export async function confirmEmail(
  db: Db,
  token: string,
  now: number,
): Promise<{ id: string; email: string } | null> {
  const rows = await db
    .update(users)
    .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(
      and(
        eq(users.verifyTokenHash, tokenHash(token)),
        gt(users.verifyExpiresAt, new Date(now)),
        isNull(users.deletedAt),
      ),
    )
    .returning({ id: users.id, email: users.email });
  return rows[0] ?? null;
}

/**
 * Proof that this browser asked for the letter, kept in a cookie. The link signs in only together
 * with it: a link passed to someone else (or opened by a mail scanner) confirms the address, but
 * does not put that browser, and the data in it, into this account.
 */
export const registrationProof = (email: string, secret: string) =>
  createHmac('sha256', secret).update(normalizeEmail(email)).digest('base64url');

export function provesRegistration(email: string, proof: string | undefined, secret: string) {
  if (!proof) return false;
  const a = Buffer.from(proof);
  const b = Buffer.from(registrationProof(email, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

export type LoginResult =
  | { ok: true; id: string; email: string }
  | { ok: false; code: 'invalid' | 'unverified' | 'locked' };

const pause = () => new Promise((resolve) => setTimeout(resolve, WRONG_DELAY_MS));

/** Checks an email and a password. Too many wrong ones lock the account for a while. */
export async function checkLogin(
  db: Db,
  email: string,
  password: string,
  now: number,
): Promise<LoginResult> {
  const row = await findByEmail(db, email);
  if (!row?.passwordHash) {
    await pause();
    return { ok: false, code: 'invalid' };
  }
  if (row.lockedUntil && row.lockedUntil.getTime() > now) return { ok: false, code: 'locked' };
  if (!(await verifyPassword(password, row.passwordHash))) {
    const failures = row.loginFailures + 1;
    await db
      .update(users)
      .set(
        failures >= MAX_FAILURES
          ? { loginFailures: 0, lockedUntil: new Date(now + LOCK_MS) }
          : { loginFailures: failures },
      )
      .where(eq(users.id, row.id));
    await pause();
    return { ok: false, code: 'invalid' };
  }
  // Only the owner of the password learns that the address is still to be confirmed.
  if (!row.emailVerifiedAt) return { ok: false, code: 'unverified' };
  if (row.loginFailures > 0 || row.lockedUntil)
    await db.update(users).set({ loginFailures: 0, lockedUntil: null }).where(eq(users.id, row.id));
  return { ok: true, id: row.id, email: row.email };
}
