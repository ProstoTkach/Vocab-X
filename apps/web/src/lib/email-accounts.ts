// Accounts with an email and a password. An address counts only once its owner has clicked the
// link in the letter; until then the account cannot sign in.
//
// Every letter carries one link, and the account keeps the hash of the latest one only: a new
// letter (another registration, a new password asked for) makes the earlier links stop working.
// A registration's password waits next to its link (`pendingPasswordHash`) and becomes the
// account's password only through that link, so registering an address again cannot change the
// password of a registration already made, and an older letter cannot confirm a newer password.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { users } from './db/schema';
import { siteUrl, sendEmail } from './email';
import {
  emailLocale,
  renderAlreadyEmail,
  renderResetEmail,
  renderVerifyEmail,
} from './email-templates';
import { hashPassword, newToken, tokenHash, verifyPassword } from './password';

const LINK_LIFETIME_MS = 24 * 3_600_000;
/** A link for a new password is worth more to whoever finds it, so it lives shorter. */
const RESET_LIFETIME_MS = 3_600_000;
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

/** A new link: the token goes into the letter, its hash into the account. */
function newLink(now: number, lifetime: number) {
  const { token, hash } = newToken();
  return {
    token,
    columns: {
      verifyTokenHash: hash,
      verifyExpiresAt: new Date(now + lifetime),
      verifySentAt: new Date(now),
    },
  };
}

/** A letter that did not go out does not count towards the wait for the next one. */
async function sendCounted(db: Db, id: string, send: () => Promise<void>) {
  try {
    await send();
  } catch (e) {
    await db.update(users).set({ verifySentAt: null }).where(eq(users.id, id));
    throw e;
  }
}

function sendConfirmation(db: Db, id: string, email: string, token: string, locale: string) {
  const lang = emailLocale(locale);
  const link = `${siteUrl()}/api/account/verify?token=${token}&lang=${lang}`;
  return sendCounted(db, id, () =>
    sendEmail(email, (wolf) => renderVerifyEmail(lang, link, wolf), link),
  );
}

/**
 * Registers an address, or says nothing new about one already taken: whoever asks gets the same
 * answer, and only the address's owner learns from the letter which it was. Returns the key the
 * browser's proof is made from (see `registrationProof`): the new registration's own, or one that
 * matches nothing.
 */
export async function register(
  db: Db,
  input: { email: string; password: string; locale: string },
  now: number,
): Promise<string> {
  const email = normalizeEmail(input.email);
  // For every address, known or not: the time the answer takes tells nothing.
  const passwordHash = await hashPassword(input.password);
  const existing = await findByEmail(db, email);
  if (existing?.emailVerifiedAt) {
    if (!sentRecently(existing, now)) {
      await db
        .update(users)
        .set({ verifySentAt: new Date(now) })
        .where(eq(users.id, existing.id));
      const lang = emailLocale(input.locale);
      const link = `${siteUrl()}/${lang}/profile`;
      await sendCounted(db, existing.id, () =>
        sendEmail(email, (wolf) => renderAlreadyEmail(lang, link, wolf), link),
      );
    }
    return newToken().hash;
  }
  const { token, columns } = newLink(now, LINK_LIFETIME_MS);
  if (existing) {
    // Never confirmed: the newest registration wins, with a link of its own; earlier ones die.
    // Inside the wait between letters none goes out, and the next one is asked for again.
    const send = !sentRecently(existing, now);
    await db
      .update(users)
      .set({
        pendingPasswordHash: passwordHash,
        ...columns,
        verifySentAt: send ? columns.verifySentAt : existing.verifySentAt,
      })
      .where(eq(users.id, existing.id));
    if (send) await sendConfirmation(db, existing.id, email, token, input.locale);
    return passwordHash;
  }
  const [row] = await db
    .insert(users)
    .values({ email, pendingPasswordHash: passwordHash, ...columns })
    .returning({ id: users.id });
  await sendConfirmation(db, row!.id, email, token, input.locale);
  return passwordHash;
}

/**
 * Another letter for an address still waiting, asked for by the browser that registered it (its
 * proof is checked by the caller with `provesRegistration`). Says nothing about whether it exists.
 */
export async function resendConfirmation(
  db: Db,
  input: { email: string; locale: string; proves: (key: string) => boolean },
  now: number,
) {
  const row = await findByEmail(db, input.email);
  if (!row || row.emailVerifiedAt || !row.pendingPasswordHash || sentRecently(row, now)) return;
  // Someone else's registration of this address came later: its password is not sent for.
  if (!input.proves(row.pendingPasswordHash)) return;
  const { token, columns } = newLink(now, LINK_LIFETIME_MS);
  await db.update(users).set(columns).where(eq(users.id, row.id));
  await sendConfirmation(db, row.id, row.email, token, input.locale);
}

/**
 * The link in the letter: confirms the address and, if it is still waiting, makes the password
 * chosen together with this link the account's. It keeps working until it expires: mail scanners
 * open links before the owner does, and the owner must not then be told that it failed. `key` is
 * what the browser's proof must be made from to be signed in by the link.
 */
export async function confirmEmail(
  db: Db,
  token: string,
  now: number,
): Promise<{ id: string; email: string; key: string | null } | null> {
  const rows = await db
    .update(users)
    .set({
      passwordHash: sql`CASE WHEN ${users.emailVerifiedAt} IS NULL
        THEN coalesce(${users.pendingPasswordHash}, ${users.passwordHash})
        ELSE ${users.passwordHash} END`,
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
    })
    .where(
      and(
        eq(users.verifyTokenHash, tokenHash(token)),
        gt(users.verifyExpiresAt, new Date(now)),
        isNull(users.deletedAt),
      ),
    )
    .returning({ id: users.id, email: users.email, key: users.pendingPasswordHash });
  return rows[0] ?? null;
}

/**
 * A letter with a link to choose a new password, for an address with an account (with a password
 * or Google only). Says nothing about whether it exists. A registration still waiting is dropped:
 * the new password replaces it, and only the owner of the address can set it.
 */
export async function requestReset(
  db: Db,
  input: { email: string; locale: string },
  now: number,
): Promise<void> {
  const row = await findByEmail(db, input.email);
  if (!row || sentRecently(row, now)) return;
  const { token, columns } = newLink(now, RESET_LIFETIME_MS);
  await db
    .update(users)
    .set({ ...columns, pendingPasswordHash: null })
    .where(eq(users.id, row.id));
  const lang = emailLocale(input.locale);
  // After '#': the token never reaches a server, a log or the next page's Referer.
  const link = `${siteUrl()}/${lang}/profile#reset=${token}`;
  await sendCounted(db, row.id, () =>
    sendEmail(row.email, (wolf) => renderResetEmail(lang, link, wolf), link),
  );
}

/**
 * Sets the password chosen on the page the link opened. Any link of the account's latest letter
 * works (confirm or reset): it proves the address is the asker's, so the address counts as
 * confirmed too. Once only; also lifts a lock. Null: the link is wrong, used or too old.
 */
export async function resetPassword(
  db: Db,
  input: { token: string; password: string },
  now: number,
): Promise<{ id: string; email: string } | null> {
  const passwordHash = await hashPassword(input.password);
  const rows = await db
    .update(users)
    .set({
      passwordHash,
      pendingPasswordHash: null,
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
      verifyTokenHash: null,
      verifyExpiresAt: null,
      loginFailures: 0,
      lockedUntil: null,
    })
    .where(
      and(
        eq(users.verifyTokenHash, tokenHash(input.token)),
        gt(users.verifyExpiresAt, new Date(now)),
        isNull(users.deletedAt),
      ),
    )
    .returning({ id: users.id, email: users.email });
  return rows[0] ?? null;
}

/**
 * The learner's id, by the account Google says is theirs; the address follows Google's. An account
 * made earlier with a password joins it. If that address was never confirmed, the password and
 * the links go: whoever set them did not prove the address was theirs, and Google has just said
 * whose it is.
 */
export async function rememberGoogleUser(
  db: Db,
  googleSub: string,
  email: string,
): Promise<string> {
  const [known] = await db
    .update(users)
    .set({ email })
    .where(eq(users.googleSub, googleSub))
    .returning({ id: users.id });
  if (known) return known.id;
  const sameEmail = await findByEmail(db, email);
  if (sameEmail) {
    await db
      .update(users)
      .set({
        googleSub,
        emailVerifiedAt: sameEmail.emailVerifiedAt ?? new Date(),
        pendingPasswordHash: null,
        ...(sameEmail.emailVerifiedAt
          ? {}
          : { passwordHash: null, verifyTokenHash: null, verifyExpiresAt: null }),
      })
      .where(eq(users.id, sameEmail.id));
    return sameEmail.id;
  }
  const [row] = await db
    .insert(users)
    .values({ googleSub, email, emailVerifiedAt: new Date() })
    .returning({ id: users.id });
  return row!.id;
}

/**
 * Proof that this browser made the registration, kept in a cookie. The link signs in only together
 * with it: a link passed to someone else (or opened by a mail scanner) confirms the address, but
 * does not put that browser, and the data in it, into this account. It is made from the
 * registration's own key, so a browser that registered the same address earlier, before someone
 * else did, is not signed in by the other one's link.
 */
export const registrationProof = (email: string, key: string, secret: string) =>
  createHmac('sha256', secret)
    .update(`${normalizeEmail(email)}\n${key}`)
    .digest('base64url');

export function provesRegistration(
  email: string,
  key: string | null,
  proof: string | undefined,
  secret: string,
) {
  if (!proof || !key) return false;
  const a = Buffer.from(proof);
  const b = Buffer.from(registrationProof(email, key, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

export type LoginResult =
  { ok: true; id: string; email: string } | { ok: false; code: 'invalid' | 'unverified' };

const pause = () => new Promise((resolve) => setTimeout(resolve, WRONG_DELAY_MS));

/** Checked against when the address has no password, so that it takes as long as a real one. */
let stand: Promise<string> | null = null;
const standIn = () => (stand ??= hashPassword(newToken().token));

/**
 * Checks an email and a password. Too many wrong ones lock the account for a while. Every answer
 * but a right one is the same `invalid`, after the same work: an unknown address, a locked
 * account (even with the right password) and a wrong password cannot be told apart, so trying
 * says nothing about which addresses have an account. A new password by letter lifts the lock.
 */
export async function checkLogin(
  db: Db,
  email: string,
  password: string,
  now: number,
): Promise<LoginResult> {
  const row = await findByEmail(db, email);
  // Not yet confirmed: the password the latest registration chose (or one set before it kept them).
  const stored = row?.emailVerifiedAt
    ? row.passwordHash
    : (row?.pendingPasswordHash ?? row?.passwordHash);
  const right = await verifyPassword(password, stored ?? (await standIn()));
  const locked = !!row?.lockedUntil && row.lockedUntil.getTime() > now;
  if (!row || !stored || locked) {
    await pause();
    return { ok: false, code: 'invalid' };
  }
  if (!right) {
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
