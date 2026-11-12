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
  renderEmailChangeEmail,
  renderResetEmail,
  renderVerifyEmail,
} from './email-templates';
import { hashPassword, newToken, tokenHash, verifyPassword } from './password';
import { liveAccount, type Caller } from './sessions';
import {
  forgetQuery,
  hashed,
  isFull,
  MINUTE_MS,
  HOUR_MS,
  peekQuery,
  spendQuery,
  sweepQuery,
  verdictOf,
  type Rule,
} from './rate-limit';

const LINK_LIFETIME_MS = 24 * 3_600_000;
/** A link for a new password is worth more to whoever finds it, so it lives shorter. */
const RESET_LIFETIME_MS = 3_600_000;
/** One letter a minute to one address, however often someone asks. */
const LETTER_GAP_MS = 60_000;
/**
 * Sign-in limits (AUDIT A4). Tries from one sender, right or wrong, whatever the address: trying
 * many accounts from one place is slow. Wrong passwords for one address from one sender close it
 * to that sender only, so nobody can keep its owner out from elsewhere; from everyone together,
 * a much higher count closes it for all (guessing from many places at once).
 */
const TRIES: Omit<Rule, 'key'> = { max: 30, windowMs: 15 * MINUTE_MS };
const WRONG_HERE: Omit<Rule, 'key'> = { max: 10, windowMs: 15 * MINUTE_MS };
const WRONG_ANYWHERE: Omit<Rule, 'key'> = { max: 100, windowMs: HOUR_MS };
/** Keyed by the address, known or not, so a closed address says nothing about an account. */
const wrongKey = (email: string) => `login-wrong:${hashed(normalizeEmail(email))}`;
/** A wrong password waits this long: guessing by trying many is slow. */
const WRONG_DELAY_MS = 800;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const byEmail = (email: string) => sql`lower(${users.email}) = ${normalizeEmail(email)}`;

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
      and(eq(users.verifyTokenHash, tokenHash(token)), gt(users.verifyExpiresAt, new Date(now))),
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
    .set({ ...columns, verifyTokenHash: resetHash(token), pendingPasswordHash: null })
    .where(eq(users.id, row.id));
  const lang = emailLocale(input.locale);
  // After '#': the token never reaches a server, a log or the next page's Referer.
  const link = `${siteUrl()}/${lang}/profile#reset=${token}`;
  await sendCounted(db, row.id, () =>
    sendEmail(row.email, (wolf) => renderResetEmail(lang, link, wolf), link),
  );
}

/**
 * The hash a reset link keeps: of its own kind, so that only a reset letter's link sets a password.
 * A confirmation link lives a day, travels in an address (server logs) and keeps working after
 * use, so it must not be one too.
 */
const resetHash = (token: string) =>
  tokenHash(`reset
${token}`);

/**
 * Sets the password chosen on the page the link of the latest reset letter opened. It proves the
 * address is the asker's, so the address counts as confirmed too. Once only; also lifts a lock and
 * ends every session signed in before (the caller signs this browser in as of `now`). Null: the
 * link is wrong, used or too old, and then no password is even hashed: a flood of made-up links
 * costs a lookup each.
 */
export async function resetPassword(
  db: Db,
  input: { token: string; password: string },
  now: number,
): Promise<{ id: string; email: string } | null> {
  const valid = and(
    eq(users.verifyTokenHash, resetHash(input.token)),
    gt(users.verifyExpiresAt, new Date(now)),
  );
  const [known] = await db.select({ id: users.id }).from(users).where(valid);
  if (!known) return null;
  const passwordHash = await hashPassword(input.password);
  const rows = await db
    .update(users)
    .set({
      passwordHash,
      pendingPasswordHash: null,
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
      verifyTokenHash: null,
      verifyExpiresAt: null,
      sessionsSince: new Date(now),
    })
    .where(valid)
    .returning({ id: users.id, email: users.email });
  const user = rows[0] ?? null;
  // The owner of the address has proved it: the wrong passwords of others no longer count.
  if (user) await forgetQuery(db, wrongKey(user.email));
  return user;
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
  | { ok: true; id: string; email: string }
  | { ok: false; code: 'invalid' | 'unverified' | 'limited' };

const pause = () => new Promise((resolve) => setTimeout(resolve, WRONG_DELAY_MS));

/** Checked against when the address has no password, so that it takes as long as a real one. */
let stand: Promise<string> | null = null;
const standIn = () => (stand ??= hashPassword(newToken().token));

/**
 * Checks an email and a password, for a sender (`senderKey`). Too many tries, or too many wrong
 * passwords for the address, answer `limited` before any password is looked at (see the limits
 * above); an address without an account is counted and closed just the same. Any other answer
 * but a right one is the same `invalid`, after the same work: an unknown address and a wrong
 * password cannot be told apart, so trying says nothing about which addresses have an account.
 * A new password by letter lifts the closing.
 */
export async function checkLogin(
  db: Db,
  email: string,
  password: string,
  now: number,
  sender: string,
): Promise<LoginResult> {
  const tries: Rule = { key: `login:${sender}`, ...TRIES };
  const wrongHere: Rule = { key: `${wrongKey(email)}:${sender}`, ...WRONG_HERE };
  const wrongAnywhere: Rule = { key: wrongKey(email), ...WRONG_ANYWHERE };
  // One request to the database: this try counted, the account, its wrong passwords so far.
  const [counted, found, wrong] = await db.batch([
    spendQuery(db, [tries], now),
    db.select().from(users).where(byEmail(email)),
    peekQuery(db, [wrongHere.key, wrongAnywhere.key]),
    sweepQuery(db, now),
  ]);
  if (
    !verdictOf(counted, [tries], now).ok ||
    isFull(wrong, wrongHere, now) ||
    isFull(wrong, wrongAnywhere, now)
  ) {
    await pause();
    return { ok: false, code: 'limited' };
  }
  const row = found[0] ?? null;
  // Not yet confirmed: the password the latest registration chose (or one set before it kept them).
  const stored = row?.emailVerifiedAt
    ? row.passwordHash
    : (row?.pendingPasswordHash ?? row?.passwordHash);
  const right = await verifyPassword(password, stored ?? (await standIn()));
  if (!row || !stored || !right) {
    await Promise.all([spendQuery(db, [wrongHere, wrongAnywhere], now), pause()]);
    return { ok: false, code: 'invalid' };
  }
  // Only the owner of the password learns that the address is still to be confirmed.
  if (!row.emailVerifiedAt) return { ok: false, code: 'unverified' };
  if (wrong.length) await forgetQuery(db, wrongKey(email));
  return { ok: true, id: row.id, email: row.email };
}

/** How the account signs in, for the profile's choices. Null: there is no such account. */
export async function signInMethods(
  db: Db,
  caller: Caller,
): Promise<{ password: boolean; google: boolean } | null> {
  const [row] = await db
    .select({ hash: users.passwordHash, sub: users.googleSub })
    .from(users)
    .where(liveAccount(caller));
  return row ? { password: !!row.hash, google: !!row.sub } : null;
}

/** Changes asked for while signed in that need the password: ten tries per account in 15 minutes. */
const CHECKS: Omit<Rule, 'key'> = { max: 10, windowMs: 15 * MINUTE_MS };
const checksOf = (userId: string): Rule => ({ key: `account-check:${hashed(userId)}`, ...CHECKS });

/**
 * The account, with this try counted. `limited`: too many tries; null: no such account, or this
 * session no longer counts for it.
 */
async function checkedAccount(
  db: Db,
  caller: Caller,
  now: number,
): Promise<Row | 'limited' | null> {
  const rule = checksOf(caller.id);
  const [counted, found] = await db.batch([
    spendQuery(db, [rule], now),
    db.select().from(users).where(liveAccount(caller)),
  ]);
  if (!verdictOf(counted, [rule], now).ok) return 'limited';
  return found[0] ?? null;
}

export type ChangeResult = 'ok' | 'wrong' | 'limited' | 'none' | 'gone';

/**
 * A new password while signed in: the current one must be right. `none`: the account has no
 * password (Google only); a letter sets one (`requestReset`). Links still waiting stop working,
 * and so do the other sessions (whoever knew the old password may be signed in somewhere): the
 * caller signs this one in again as of `now`.
 */
export async function changePassword(
  db: Db,
  caller: Caller,
  input: { current: string; password: string },
  now: number,
): Promise<ChangeResult> {
  const row = await checkedAccount(db, caller, now);
  if (row === 'limited') return 'limited';
  if (!row) return 'gone';
  if (!row.passwordHash) return 'none';
  if (!(await verifyPassword(input.current, row.passwordHash))) {
    await pause();
    return 'wrong';
  }
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(input.password),
      pendingPasswordHash: null,
      verifyTokenHash: null,
      verifyExpiresAt: null,
      sessionsSince: new Date(now),
    })
    .where(eq(users.id, row.id));
  return 'ok';
}

/** The hash an address change keeps: of the token and the new address, so neither can change. */
const changeHash = (token: string, email: string) =>
  tokenHash(`${token}\n${normalizeEmail(email)}`);

export type EmailChangeResult = 'sent' | 'same' | 'wrong' | 'limited' | 'google' | 'gone';

/**
 * A new address for the account: a letter goes to it, and only its link makes the change (the
 * old address stays until then). With a password, it must be given. An account with Google keeps
 * Google's address (`google`). An address another account has gets no letter, and the answer is
 * the same `sent`, so nothing tells which addresses have accounts.
 */
export async function requestEmailChange(
  db: Db,
  caller: Caller,
  input: { email: string; password: string; locale: string },
  now: number,
): Promise<EmailChangeResult> {
  const row = await checkedAccount(db, caller, now);
  const userId = caller.id;
  if (row === 'limited') return 'limited';
  if (!row) return 'gone';
  if (row.googleSub) return 'google';
  if (!row.passwordHash || !(await verifyPassword(input.password, row.passwordHash))) {
    await pause();
    return 'wrong';
  }
  const email = normalizeEmail(input.email);
  if (email === normalizeEmail(row.email)) return 'same';
  if (sentRecently(row, now) || (await findByEmail(db, email))) return 'sent';
  const { token, columns } = newLink(now, LINK_LIFETIME_MS);
  await db
    .update(users)
    .set({ ...columns, verifyTokenHash: changeHash(token, email) })
    .where(eq(users.id, userId));
  const lang = emailLocale(input.locale);
  const link = `${siteUrl()}/${lang}/profile#email=${token}&to=${encodeURIComponent(email)}`;
  await sendCounted(db, userId, () =>
    sendEmail(email, (wolf) => renderEmailChangeEmail(lang, link, wolf), link),
  );
  return 'sent';
}

const isUniqueViolation = (e: unknown): boolean => {
  const code = (x: unknown) => (x as { code?: unknown } | null)?.code;
  return code(e) === '23505' || code((e as { cause?: unknown } | null)?.cause) === '23505';
};

/**
 * The link of an address change: the account takes the new address, confirmed. Once only, for a
 * day. Null: the link is wrong, used or too old; `taken`: another account got the address since.
 */
export async function confirmEmailChange(
  db: Db,
  input: { token: string; email: string },
  now: number,
): Promise<{ id: string; email: string } | 'taken' | null> {
  const email = normalizeEmail(input.email);
  try {
    const [user] = await db
      .update(users)
      .set({
        email,
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
        verifyTokenHash: null,
        verifyExpiresAt: null,
      })
      .where(
        and(
          eq(users.verifyTokenHash, changeHash(input.token, email)),
          gt(users.verifyExpiresAt, new Date(now)),
          isNull(users.googleSub),
        ),
      )
      .returning({ id: users.id, email: users.email });
    return user ?? null;
  } catch (e) {
    if (isUniqueViolation(e)) return 'taken';
    throw e;
  }
}
