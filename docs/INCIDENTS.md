# VocabX — incident runbook (step 6.13)

Written calmly, to be used in a hurry. Read top to bottom the first time; later jump to the case.
Related: `docs/THREAT_MODEL.md` §3 (what each key gives and what its rotation breaks — **not
repeated here**), `docs/DEVELOPMENT.md` («Випуск і відкат», «Резервні копії», «Вимикачі»),
`docs/DATA_MAP.md` (what data exists), `docs/PRELAUNCH_PLAN.md` (owner tasks).

## 0. First ten minutes (any incident)

1. **Stop the damage, then understand it.** Fastest tools, in order:
   - a kill switch (`KILL_TRANSLATE`, `KILL_REGISTRATION`, `KILL_LEAGUE`, `KILL_ANALYTICS`: set
     `1` in Vercel → Settings → Environment Variables, redeploy; see `lib/kill-switch.ts`);
   - Vercel → Deployments → Instant Rollback to the last good deploy (DEVELOPMENT.md);
   - Vercel's attack-challenge mode (Firewall) for a flood from the outside;
   - rotating the key, if one is suspected (THREAT_MODEL §3).
2. **Write down the time** you noticed and each step you take (a plain note is enough; it goes
   into `docs/WORKLOG.md` afterwards). Do not delete logs or rows to "clean up" before you have
   looked at them. Vercel runtime logs live only about an hour on the free plan (DATA_MAP): copy
   what matters at once.
3. **Do not touch user data to fix it** without a restore point (Neon branch, DEVELOPMENT.md
   «Резервні копії»).
4. Decide the class below and follow it.

## 1. A key or secret leaked (or may have)

Go to `THREAT_MODEL.md` §3: the table gives, per key, what it gives an attacker, how to rotate and
what rotation breaks. Extra steps that table does not carry:

- Rotate **before** investigating; every hour counts more than finding out how it leaked.
- After rotating `DATABASE_URL`, `NEXTAUTH_SECRET` or `GOOGLE_PRIVATE_KEY`, look for use of the
  old key: Neon Console → Monitoring (unfamiliar connections/queries); Google Cloud → IAM → service
  account → key usage; Vercel logs. If the old key was **used by someone else**, this is also a
  data leak (section 2).
- If it was committed to git: removing it from the file is not enough, the history keeps it
  (`git log -S`); the key must be considered public, rotated, and the history is not rewritten
  without the owner's decision.
- Check `.env`, the Vercel environment (Preview scope too), CI secrets and chat/tickets where it
  could have been pasted.

## 2. User data may have leaked or been changed

Examples: database credentials used by a stranger, a route returning another user's rows, a
spreadsheet shared too widely, an export sent to a wrong address.

1. Contain (section 0): rotate the key, switch the feature off, roll back the deploy.
2. **Scope it.** Which data (DATA_MAP lists every table, sheet and field), whose (all, one
   account, accounts of one day), when it started, whether it is still open. Neon history
   (point-in-time) and the `review_events`/`users` rows show what changed; Vercel logs show who
   asked (addresses, paths) while they last.
3. **Who is told, and when.** The owner is the controller. If personal data of people in the EU is
   involved and there is a risk to them, the supervisory authority must be told **within 72 hours**
   of learning about it (GDPR art. 33), and the people affected **without undue delay** when the
   risk is high (art. 34). Ukraine's law has its own deadlines: ask the lawyer who reviews the
   privacy text (`docs/LEGAL_REVIEW.md`) **before** launch which authority and which wording apply,
   and write the answer here: `Authority: ________`. If in doubt, tell the people: it costs
   less than hiding it.
4. **What the message to learners says:** what happened (plain words), what data, since when,
   what we did, what they should do (for passwords: change the password, and if the same password
   is used elsewhere, there too; the app signs out every device after a password change), who to
   write to. No blame, no promise that cannot be kept. Send it from the app's address to the
   affected accounts, and put a notice on the site if it cannot be narrowed down.
5. Force sign-out of everyone if sessions may be stolen: rotate `NEXTAUTH_SECRET` (all sessions
   end), or for one account the «Вийти на всіх пристроях» action / password reset.
6. Afterwards: a `WORKLOG.md` entry, a test or check that would have caught it, an update of
   THREAT_MODEL and DATA_MAP if the picture was wrong.

Data deleted by mistake or by a bad migration: this is a restore, not a leak —
DEVELOPMENT.md «Резервні копії» (and the window there is limited: act the same day).

## 3. Abuse or a surprise bill

Translate or dictionary abuse, a registration flood, sheet writes growing. Switch the matching
`KILL_*` flag on first; then look at what the 429 limits did (`lib/rate-limit.ts`); then at the
provider's usage page (Google Cloud → Billing, Neon usage, Vercel usage). Budget alerts are owner
step 5.10. A flood from one address range: Vercel Firewall rule. Do not raise limits during
the incident.

## 4. The site or sync is down

1. Vercel status and the last deploy first: a bad deploy → Instant Rollback (DEVELOPMENT.md).
2. Neon status and Console (compute suspended or out of free hours?): the app works from the
   local copy, so learners can keep reviewing; sync catches up later. Say so in one line if you
   announce anything: their data is safe on their device.
3. A migration gone wrong → restore (DEVELOPMENT.md); applied `0006`-type drop → its SQL for
   undo is in the file header.
4. Alerts come from UptimeRobot (`/api/health` answers 503: the site is up but the database does
   not) and Sentry (errors, a missed daily `cleanup` check-in) — set-up and what each sees:
   DEVELOPMENT.md «Моніторинг». Until the owner has created both accounts and put the DSN into
   Vercel, nothing alerts and the owner learns from users. A Sentry flood of one error: look at
   the release (`NEXT_PUBLIC_BUILD_ID`) — it points at the deploy to roll back.

## 5. People write to us

- Contact address: `CONTACT_EMAIL` in `apps/web/src/lib/contact.ts` — **empty until the owner
  fills it** (privacy and terms pages show a placeholder). Fill it before launch and keep one
  inbox that someone reads: this runbook relies on it.
- Requests about data (view, export, delete, correct): export and deletion are in the app
  (Settings → Data, Profile → Account); the privacy text promises an answer — the owner sets the
  deadline (step 5.11); GDPR's limit is one month.
- A report of a vulnerability or leak: answer within a day, thank them, do not argue, handle as
  section 2 if real.

## 6. Who does what

Owner-only (nobody else has the accounts): Vercel, Neon, Google Cloud, GitHub, the mail account,
the domain registrar, the bot in Telegram. Each must have two-step sign-in (step 6.8). The
assistant can run the migrations and scripts the owner allows, read the code and write the notes,
but not log in to these consoles: when the runbook says «Console», the owner does it.

Fill in before launch (the owner): contact address in the code; the supervisory authority and
the lawyer's name/contact (section 2); where the incident notes are kept.
