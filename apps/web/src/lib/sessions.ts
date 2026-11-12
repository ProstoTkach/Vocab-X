// Ending sessions from the server (threat model: a stolen password, a lost phone). A session is a
// signed cookie the server keeps no list of, so it cannot be deleted; instead the account notes a
// moment (`users.sessions_since`), and a session that signed in before it no longer counts on the
// routes that read the account's row anyway (sync, league, export, the account's own routes), at
// no extra cost to the database. The moment a session signed in (`authAt`) is a claim of its own:
// the cookie's `iat` changes every time next-auth renews it.
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { users } from './db/schema';

/** Who is asking, from the signed cookie: the account, its address, when this session signed in. */
export interface Caller {
  id: string;
  email: string | null;
  /** Milliseconds; 0 for a cookie made before this was noted (it ends with the next cut-off). */
  authAt: number;
}

/** The account of this caller, if this session still counts for it. */
export const liveAccount = (caller: Caller) =>
  and(
    eq(users.id, caller.id),
    or(isNull(users.sessionsSince), lte(users.sessionsSince, new Date(caller.authAt))),
  );
