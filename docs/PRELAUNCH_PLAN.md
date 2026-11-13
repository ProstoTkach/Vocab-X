# VocabX — pre-launch plan

Merged from two task briefs (data/security + data trust). Duplicates removed, work split into
phases and small steps. **Work goes by sessions** (table "Sessions" below: one chat = one row; say "do session N from
docs/PRELAUNCH_PLAN.md"). Do not read the whole file: read the session's row, its steps, and the
rows of "Additions to existing steps" that name them.

## Progress and handoff

Next: **session 20** (model S); owner's legal review of session 5 texts (`docs/LEGAL_REVIEW.md` §3) can run in parallel. Migration `0005` is applied to the main database (2026-11-12); migration `0006` (drops unused `users` columns) is applied **only after** the deploy with session 8 is live. Migration `0007` (`users.sessions_since`, session 15) is needed **before** that deploy: its one statement was run on the main database by hand (2026-11-13, owner's permission), so `pnpm db:migrate` after the deploy applies `0006` and passes over `0007` (`IF NOT EXISTS`). Update this line and the "Done" line at the end of every session.
Done: 0.1 (`docs/AUDIT.md`, 2026-11-12); 1.0 + 5.3a (session 1, 2026-11-12, commit b076026); 1.1 + 1.2 (session 2, 2026-11-12);
2.1a (session 3, 2026-11-12); 1.3 + 5.4 + 6.7 + 1.6 terms (session 4, 2026-11-12);
1.4 text + 5.1 text (session 5, 2026-11-12; `messages/*/legal.json`, format and review list in `docs/LEGAL_REVIEW.md`);
1.4 page + 5.1 page + Credits + links + 5.8 (session 6, 2026-11-12; contact address: `CONTACT_EMAIL` in `src/lib/contact.ts`, empty until the owner fills it in);
1.5 (session 7, 2026-11-12); 1.6 implementation + 5.3b (session 8, 2026-11-12; cleanup cron `/api/cleanup`, full resync rule in `@vocabx/data`, see `docs/DATA_MAP.md` §6.2–6.3);
2.1b + 2.2 + 5.2 (session 9, 2026-11-12; limits, body caps and quotas of the data routes, daily XP cap in the league, see `docs/DEVELOPMENT.md`);
2.3 + 2.4 + 2.5 + wiring of 6.1 and 6.3 (session 10, 2026-11-12, commit ae6b581); 6.4 + 6.6 local data migration test (session 11, 2026-11-12; storage-full handling, restore from a file, "keep your words" nudge, `persist()`, frozen v2 fixture, see `docs/DATA_MAP.md` §2.6);
6.5 + rest of 6.6 (session 12, 2026-11-12; sync integrity tests (fake server + `pnpm test:db`), `SYNC_PROTOCOL` / 426, "update the app" screen, service worker per build, see `docs/DEVELOPMENT.md` «Синхронізація», «Офлайн»);
6.15 (session 13, 2026-11-12; static example sentences, owner reviews them); 6.10 + 5.9 (session 14, 2026-11-13; kill switches, route error screens);
2.6 (session 15, 2026-11-13; `docs/THREAT_MODEL.md`; fixes W1–W4: sessions ended from the server (`lib/sessions.ts`, "sign out on all devices"), reset links of their own kind, limits on setting a password and on confirmation links, guard tests);
5.5 + 4.3 + 6.13 (session 16, 2026-11-13; «Випуск і відкат» and «Резервні копії» in `docs/DEVELOPMENT.md`, `docs/INCIDENTS.md`; restore on a test branch not yet tried — owner, see `to_test_locally.md`);
3.3 + 5.6 (session 17, 2026-11-13; Sentry + UptimeRobot, `lib/monitoring.ts`, `/api/health`, «Моніторинг» in `docs/DEVELOPMENT.md`; accounts and DSN not yet created — owner, see `to_test_locally.md`);
5.7 + 6.11 (session 18, 2026-11-13); 3.4 + 3.2 + 3.5 (session 19, 2026-11-13; `tools/load/`, no missing indexes, results in `docs/METRICS.md`; translate and Sheets writes not measurable on the preview);
owner: 6.8 (two-step sign-in everywhere), Neon test branch and load-test preview created.

Owner decisions that later sessions must respect (2026-11-12):

- **6.1 Domain:** stays `vocabx-sigma.vercel.app` for launch. Accepted risk: a later move to another
  domain loses the local data of learners without an account, PWA installs and push subscriptions;
  session 11 (6.4) must therefore include "export / sign in before a move" as the way out. Session 10
  only replaces the hard-coded address by `NEXTAUTH_URL`.
- **6.9 Plans:** free tiers of Vercel and Neon, no upgrade planned. Every design must fit them:
  check the current free-tier limits (cron frequency, function time, database size and compute,
  restore window) before choosing a mechanism; hourly reminders, if the cron limit forbids them,
  need an outside scheduler or stay daily. No paid service may be added without asking.
- **6.3 E-mail:** without an own domain SPF/DKIM/DMARC cannot be set up; sending stays on the
  current SMTP account. Session 10 documents its daily cap; the register limit (2.1a) must stay
  under it.
- **1.6 Retention terms:** approved as written in `docs/DATA_MAP.md` §6 (tombstones 90 days,
  `CACHE_MS` and translate `s-maxage` 15 days, drop `users.deleted_at` with `login_failures` and
  `locked_until` in one migration after a deploy). Session 8 implements them.
- **Art:** character pictures and icons are the owner's own (Gemini + Photoshop); no credit needed.
- **Tests:** the assistant runs them itself (output to a log, grep). `pnpm e2e:changed` after a
  local commit; one full `pnpm e2e` right before a push that gathers many changes.

**Handoff rule (assistant):** when a session is finished, first append its entry to
`docs/WORKLOG.md` (rule 9) and its manual checks to `docs/to_test_locally.md` (rule 11), then end
the report with a block the owner can use without thinking (the next row of "Sessions" not done,
or the one the owner chose):

1. **Модель:** the model's name in full (Opus or Sonnet), the effort level (see "Effort" under
   "Sessions") and one line on why.
2. **Промпт для нового чата:** a ready prompt in a code block, in Russian, to paste as it is. It
   names the session and its steps, and carries what the new chat cannot learn from the plan:
   decisions made in this chat, what was left unfinished ("part 2"), files that changed and
   matter, anything the owner must have done first. No retelling of the plan itself. The prompt
   always ends with: "If everything is fine and nothing needs a change or a question to the owner,
   run the tests (as on «прогони тесты»: local commit, then `pnpm e2e:changed`) and make the
   commit right away, without waiting for a reply." (In Russian in the prompt itself.)
3. **До запуска:** what the owner has to do by hand before starting it, if anything; if the next
   session needs approval or owner work first, say that instead of a prompt.

Never continue into the next session in the same chat unless the owner asks. The assistant cannot
switch models; the owner does it in the new chat.

## Working protocol (every step)

1. Read only the files the step names (grep first; no whole big files).
2. If the step starts with an audit: report findings and the change plan, then **wait for approval**.
3. Small changes, then `pnpm typecheck && pnpm lint && pnpm test` (tail the output) until clean.
4. Update e2e specs together with the code; list affected specs; run e2e only on request.
5. Visual change → screenshots check before commit (see CLAUDE.md).
6. Never delete production user data without explicit permission. DB migrations reversible or backed up.
7. Every number in a report is measured or computed; estimates are labelled "estimate" + method.
8. New data type ⇒ entry in `docs/DATA_MAP.md` (once step 1.3 creates it).
9. **Work log:** before the handoff line, append an entry to `docs/WORKLOG.md` (format is at the
   top of that file; written in Russian, for the owner's final report). A step is not finished
   without it. Steps done by the owner by hand get an entry too (the assistant writes it when told).
10. Before starting a step, grep `docs/PRELAUNCH_PLAN.md` for its number: the table "Additions to
    existing steps" may add work to it.
11. **Manual checks for the owner:** before the handoff, without being asked, append a section
    for the session to `docs/to_test_locally.md` (format at the top of that file; in Russian):
    what the owner should click through locally and look at before a push — every visible change
    (texts, screens, states, phone and desktop, dark theme if colors changed), how to reach each
    state by hand (which words, how many times, which setting), what to prepare first (migration,
    `.env`, an account), and what can only be seen on Vercel. Each item is a checkbox with an
    action and the expected result. Only what tests and screenshots did not settle, or what the
    owner should see with their own eyes; nothing from the plan retold. A session with nothing
    to check by hand writes one line saying so. In the report, say that the section was added.

Models: **F** = Fable (hardest reasoning), **O** = Opus, **S** = Sonnet (default for implementation).
"F→S" = plan with F, implement with S.
**The model of a session is the one in the "Sessions" table; it overrides the labels in step
headings** (reassigned 2026-11-12: with `docs/AUDIT.md` in place no remaining step needs F).

## Snapshot (checked in code, 2026-11-12)

| Fact                   | State                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/privacy` page        | missing (`app/[locale]` has no such route)                                                                                                                 |
| Consent dialog         | `dismissible={false}` still set (`analytics-provider.tsx:329`)                                                                                             |
| Rate limit             | some routes mention 429 (`track`, `feedback`, `translate`, `push/test`); nature (in-memory?) unverified; `sync`, `auth`, `account`, `dev-unlock` not seen  |
| Security headers / CSP | none in `next.config.ts` or `vercel.json`                                                                                                                  |
| `.env.example`         | missing                                                                                                                                                    |
| Error monitoring       | none                                                                                                                                                       |
| Cron                   | one job (`/api/push/cron`, daily, `vercel.json`); no cleanup job                                                                                           |
| Account deletion       | route exists (`api/account`); completeness unverified                                                                                                      |
| DB tables              | users, user_state, words, decks, card_progress, review_events, league_profiles, league_members (`lib/db/schema.ts`); analytics/push still in Google Sheets |

---

## Phase 0 — Audit (once, before anything else)

### 0.1 Full audit report — model **F** (or O)

Check every item of phases 1–5 against the code: done / partial / missing, with files and lines.
Also look for problems not on the list (separate section). Output: `docs/AUDIT.md` + change plan.
Wait for approval. Everything later is cheaper once this exists, so spend the strong model here.

---

## Phase 1 — Trust and privacy (P0)

### 1.0 Account pre-hijack fix — **O**

`docs/AUDIT.md` finding A1. A second registration of an unconfirmed address must not silently
replace the password: keep the pending password together with its token, a link confirms only the
password set with it, the newest letter wins and older links die. Tests for both orders of the
two registrations. The full fix (set a password from a link) comes with the reset flow in 5.3.

### 1.1 Consent that is real — **S**

- Restore "Не надсилати" button (commented block in `analytics-provider.tsx`), remove `dismissible={false}`.
- Nothing is sent before an answer or after refusal; no repeat prompts. Settings → Data toggle works both ways.
- Update README and `docs/ANALYTICS.md` (drop "cannot be skipped").
- Tests: no `/api/track` call without consent / after refusal.

### 1.2 Privacy-by-test — **S**

- Test walks `EVENTS`, `EVENT_COLUMNS`, `SESSION_COLUMNS`, `PARAM_KEYS`; fails on personal fields (email, name, phone, IP, user-agent, word text, translation, typed input, account `user_id`). Forbidden list lives in the test.
- Test: `anon_id` never in sync/account requests; account `user_id` never in analytics requests.
- Check `anon_id` is not linked to an account anywhere (DB, sync, sheets); if linked, remove or explain.

### 1.3 Data map — **O**

`docs/DATA_MAP.md`: per data type → fields, where collected, where stored (browser / Neon / Sheets / third party), route, purpose, access, retention, deletion. Mermaid: (1) one answer's path (swipe → local log → FSRS → `/api/sync` → Neon; consent-gated tracker → `/api/track`), (2) sign-in and two-device sync, (3) account deletion. Add the "new data type needs a map entry" rule to `docs/DEVELOPMENT.md`.

### 1.4 `/privacy` page (uk + en) — **O** for text, **S** for page

Written from actual code (use DATA_MAP): data, storage, third parties (Vercel, Neon, Google Sheets/Translate/OAuth, SMTP, Telegram, browser push services, dictionaries), purpose, retention, view/export/delete, withdraw consent. Contact address left blank for the owner. Mark legal wording for owner review. Link from onboarding, consent dialog, profile (near sign-in and "Delete account"), settings. Messages via next-intl, no JSX literals.

### 1.5 "My data" screen + export + deletion — **S** (+ screenshots)

- Settings/profile section: on device (words, decks, log entries, KB, first-visit date); on server (signed in? synced what, last sync, league, reminders); analytics (toggle, random browser ID, what is / is never collected); link to `/privacy`.
- Buttons with in-app confirm: "Download my data" (JSON, local + server), "Delete account", "Reset data on device".
- Verify deletion removes **everything**: all Neon tables (cascade), the user's push subscription in Sheets, league participation, NextAuth sessions, tokens. Test on a test DB.
- Screenshots (390×844, 1280×800, light/dark) of consent, `/privacy`, "My data" → `apps/web/screenshots/data-trust/`.

### 1.6 Retention and auto-cleanup — **S** (propose terms first, owner approves)

Proposed: soft-deleted rows (`deleted_at`) purged after 30 days; unconfirmed email accounts and expired tokens after 7 days; disabled/inactive (>90 days) push subscriptions; analytics 12 months. Implement as cron (same mechanism as reminders, protected by `CRON_SECRET`), log only row counts. Terms into DATA_MAP and `/privacy`.

---

## Phase 2 — Server hardening (P0)

### 2.1 Rate limits everywhere — **O** design, **S** implement

Two sessions. **2.1a** (early, see order): shared limiter + `translate`, `register`, sign-in, `dev-unlock` (AUDIT A2–A4, A10). **2.1b**: the rest, `Retry-After`, client messages; `track` keyed by the sender's address (hashed, short-lived), not by `anon_id`.
Owner decided (2026-11-12): store = Neon table, on condition that it does not load Neon. So the table is used only on rare or costly routes (`translate`, `register`, sign-in, `dev-unlock`, `feedback`) and on routes that open the database anyway (`sync`, `league`); `track`, `push` and `dictionary` must not wake the database for a limit check (keep a cheap in-process limit there until 3.1 moves analytics into Neon). Measure in 2.1a: queries per limited request (target 1) and added latency.
`translate` ("Suggest" in the word form): 10 free uses before sign-in, then the form asks to sign in. The browser's counter is only for the message; the server enforces: without sign-in 10 per day per sender address (hashed), signed in 100 per day per account (numbers confirmed by the owner), plus a global daily ceiling tied to the kill switch (6.10). Add a shared translation cache in Neon (same word → same answer for everyone; check Google's terms on storing results, see 6.7), so repeated words cost nothing.
Check what the current limiter is; in-memory limits do not work across Vercel instances → move to a shared store (Neon table or another option, propose). Cover `/api/track`, `translate` (paid), `sync`, sign-up/sign-in, e-mail sending, `feedback`, `push`, `push/test`, `dev-unlock` (brute force). Response `429` + `Retry-After`; the app shows a clear message and does not break. Tests.

### 2.2 Access control and input validation — **O**

Every user-data route (`sync`, profile, league, delete) takes `user_id` only from the session, never the body; no reading/changing foreign rows by id swap. Body size limits and schema validation for `sync`, `feedback`, `push` (as already done for `track`). Tests for foreign-data access attempts.

### 2.3 Security headers — **S**

`next.config`/proxy: CSP (only needed domains: dictionaries, Google, push), HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (microphone self only), `frame-ancestors 'none'`. Then verify: Google sign-in, translation, speech, microphone in sentences mode, push, service worker.

### 2.4 Secrets and logs — **S**

- Search `.next` after `pnpm build` for server keys (Google, DB, VAPID private, `NEXTAUTH_SECRET`, `DEVELOPER_CODE`, `CRON_SECRET`, Telegram).
- Scan git history for committed `.env`/keys; if found, tell the owner which keys to rotate.
- Create `.env.example` (no values, each variable described).
- Audit all `console.*`/server logs: no e-mail, tokens, sync payloads, IP, headers; errors logged with code + route only.

### 2.5 Dependencies and CI — **S**

`pnpm audit`: fix critical/high, explain the rest. Add `pnpm audit --prod` and secret scanning to CI; enable Dependabot/Renovate.

### 2.6 Threat model — **F** (or O)

`docs/THREAT_MODEL.md` table: threat → component → protection in code (file, function) → test → residual risk. Minimum: password theft/brute force, dev-code brute force, foreign data via id swap, analytics/feedback sheet leak, key leak, XP botting in league, `/api/translate` abuse (Google bill), registration/e-mail spam, XSS via words/examples/league names, lost phone, cleared browser without account. Verify each protection **exists in code**, not only in docs; list weak spots separately, implement after approval.

---

## Phase 3 — Scale (P1)

### 3.1 Analytics and push subscriptions: Sheets → PostgreSQL — **F→S**

Neon tables: events, sessions, feedback (copy), push subscriptions; indexes on time, `anon_id`, `session_id`; dedupe by `event_id` and one-row-per-session via unique keys/upsert. Sheets stays reporting only (daily export of aggregates/new rows by cron). One-off migration script for existing Sheets data (backup first). Update ANALYTICS/DEVELOPMENT docs. Split: (a) schema + dual write, (b) migration script, (c) Sheets export, (d) switch reads.

### 3.2 Indexes and queries — **O**

Check Neon indexes for sync (`server_seq`, `user_id`) and league (week). Fix missing ones via reversible migration.

### 3.3 Monitoring — **S**

Error monitoring for client and server without personal data (no e-mail, no word text); sync, sign-in and cron failures visible. Propose the tool first (needs owner account).

### 3.4 Test environment — **owner + S**

Neon branch + Vercel preview used for all load tests. Never load-test production. If missing, describe what the owner must create and stop.

### 3.5 Load tests — **S**, analysis by **O**

`tools/load/` (k6 or autocannon): typical signed-in session (`/api/sync` on open, after review, on background), tracker, translate with mocked Google API. Report in `docs/METRICS.md`: concurrent users per route at p95 < 500 ms, what breaks first (DB, Sheets, Vercel limits), errors.

### 3.6 Scaling plan — **F** (or O)

`docs/SCALING.md`: now → 1k → 10k → 100k active users; per stage: bottleneck (from 3.5), change, trigger (metric + threshold), cost estimate from public pricing (label "estimate" + date).

---

## Phase 4 — Efficiency and metrics (P2)

### 4.1 Traffic and bundle — **S**

Bundle size and heaviest dependencies; lazy-loading proposals. Service worker: old caches dropped on version change, cache bounded. Character/deck images not re-downloaded needlessly. Report KB on first open vs repeat (cache).

### 4.2 `pnpm metrics` + `docs/METRICS.md` — **S**

Playwright network interception, mobile viewport: KB first/repeat open (home, review); requests per 30-answer session (signed in / out) vs hypothetical request-per-answer; built-in content size now vs with 5 examples per word (estimate, from real sentence lengths); analytics fields count and personal-field count (expect 0, link to 1.2 test); sheet figures (answers/session, sessions/user, no internal visits) if access exists, else ask the owner for an export.

### 4.3 Backups — **S**

Neon restore procedure in `docs/DEVELOPMENT.md`; try it on a test branch if possible.

---

## Phase 5 — Added by analysis (not in the briefs)

Priority: ★ before launch, ☆ soon after.

| #      | Task                                                                                                         | Why                                                                                            | Model                        |
| ------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| ★ 5.1  | Terms of service page + "not for children under N" / age statement                                           | A language app attracts minors; consent rules differ by age                                    | O (text), owner legal review |
| ★ 5.2  | League anti-cheat: server validates XP/reviews plausibility                                                  | Bots inflating league ranks; client is untrusted                                               | O                            |
| ★ 5.3  | Auth review: password hashing params, e-mail verification, reset flow, session expiry, CSRF on custom routes | Account takeover is the worst realistic incident                                               | O                            |
| ★ 5.4  | Cookie/local-storage inventory in privacy text (NextAuth cookie, `vocabx:*` keys)                            | Needed for honest privacy text; strictly-necessary storage needs no banner, but must be listed | S                            |
| ★ 5.5  | Release & rollback: staging flow, migration order, how to revert a bad deploy                                | A bad migration on live users is irreversible without it                                       | S                            |
| ★ 5.6  | Uptime check + alert (cron, sync, site)                                                                      | You learn about outages from users otherwise                                                   | S                            |
| ☆ 5.7  | Accessibility pass (axe is already in devDeps): new screens, focus, contrast in all themes                   | Required quality bar in project rules                                                          | S                            |
| ☆ 5.8  | SEO/share: meta, OG image, sitemap, robots, manifest check                                                   | Needed once there is public traffic                                                            | S                            |
| ☆ 5.9  | Error/empty/offline states for all new screens                                                               | Offline-first promise                                                                          | S                            |
| ☆ 5.10 | Cost guard: budget alerts on Google Cloud/Vercel/Neon                                                        | Translate abuse can produce a surprise bill                                                    | owner + S                    |
| ☆ 5.11 | Support flow: where feedback goes, who answers, data-request SLA                                             | Privacy requests need an owner and a deadline                                                  | owner                        |

Not needed now: cookie banner (no tracking cookies), multi-region, CDN tuning, native apps.

---

## Phase 6 — Added after the audit (2026-11-12)

Things neither the briefs nor phase 5 cover. ★ before launch, ☆ soon after.

| #      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Why                                                                                                                                                                                                                                                               | Model                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| ★ 6.1  | Final domain before any real users: buy/attach it, then `NEXTAUTH_URL`, OAuth redirect URIs, VAPID subject (`lib/push.ts:59` has a hard-coded `vercel.app` address), `metadataBase`                                                                                                                                                                                                                                                                                                                                                                   | Local data, PWA installs, push subscriptions and sign-in are bound to the origin: a domain change after launch wipes every learner without an account                                                                                                             | owner + S                            |
| ★ 6.2  | Google OAuth consent screen: move from "Testing" to "In production" (needs the privacy page URL and a verified domain)                                                                                                                                                                                                                                                                                                                                                                                                                                | In testing mode Google limits who can sign in; check the current limits in the Google Cloud console                                                                                                                                                               | owner (after 1.4, 6.1)               |
| ★ 6.3  | E-mail deliverability: sending from the own domain (transactional provider or domain SMTP), SPF + DKIM + DMARC, test letters to Gmail, Outlook, ukr.net                                                                                                                                                                                                                                                                                                                                                                                               | Sign-up depends on one letter; a personal Gmail SMTP account has a daily cap and lands in spam                                                                                                                                                                    | owner + S                            |
| ★ 6.4  | Local data durability: measure storage per 1000 answers against the browser's limit, handle "storage full" without losing answers, ask for persistent storage (`navigator.storage.persist`), check Safari's eviction of sites not used for a week, nudge to sign in or export after N words                                                                                                                                                                                                                                                           | The app is local-first: for a learner without an account the browser is the only copy                                                                                                                                                                             | O                                    |
| ★ 6.5  | Sync integrity tests: two devices, offline edits on both, request cut mid-way, device clock wrong, sign-out and another account on the same browser. Property: no answer lost, none doubled                                                                                                                                                                                                                                                                                                                                                           | Load tests (3.5) show speed, not correctness; lost progress is the one thing learners do not forgive                                                                                                                                                              | O                                    |
| ★ 6.6  | Version skew: old cached client against a new server (protocol version in `/api/sync`, an "update the app" state), service-worker update flow, migration test of local data from today's format                                                                                                                                                                                                                                                                                                                                                       | A PWA keeps old code for days; the first breaking release would otherwise corrupt or reject data                                                                                                                                                                  | S                                    |
| ★ 6.7  | Content licences and attribution: Tatoeba sentences, Wiktionary, Free Dictionary, Google Translate terms (attribution, storing results), character art, fonts, built-in decks; a "Credits" screen; list in `docs/LICENSES.md`                                                                                                                                                                                                                                                                                                                         | Some of these sources require attribution or share-alike; cheap now, painful after a complaint                                                                                                                                                                    | O + owner                            |
| ★ 6.8  | Owner accounts: two-step sign-in on GitHub, Vercel, Neon, Google (Cloud + mail), domain registrar; branch protection on `main`; the app's DB role without rights to change the schema                                                                                                                                                                                                                                                                                                                                                                 | Whoever takes one of these accounts takes all users' data, whatever the code does                                                                                                                                                                                 | owner (30 min)                       |
| ★ 6.9  | Platform plans and limits, from the providers' current terms: Vercel plan (commercial use, cron frequency, function limits), Neon (storage, compute, restore window), Sheets size, SMTP cap. Write into `docs/SCALING.md` draft                                                                                                                                                                                                                                                                                                                       | Decides cost and several designs (hourly reminders, backups in 4.3) before code is written                                                                                                                                                                        | owner + S                            |
| ★ 6.10 | Kill switches: env flags that turn off translate, registration, league and analytics writes without a code change; a "temporarily unavailable" state in the UI for each                                                                                                                                                                                                                                                                                                                                                                               | The fastest answer to abuse or a surprise bill while a real fix is made                                                                                                                                                                                           | S                                    |
| ★ 6.11 | Other browsers and real devices: Playwright smoke in WebKit and Firefox (CI runs Chromium only); manual checklist on an iPhone (install, push, speech, microphone) and an Android phone                                                                                                                                                                                                                                                                                                                                                               | Push and speech differ most on iOS; nothing checks it now                                                                                                                                                                                                         | S + owner                            |
| ★ 6.15 | Example sentences without live requests for built-in words: a script fetches up to 5 examples per built-in word once (Tatoeba, dictionaries), the owner reviews them, they ship as per-deck static files loaded on demand; `useExampleTopUp` (`lib/lexicon/example-top-up.ts`) asks third parties only for the learner's own words. For those: remember empty answers for 7 days (now retried on every page open), a daily cap per device (30) on top of 10 per review, stop for an hour after a 429/5xx, and a per-sender limit on `/api/dictionary` | Today every review asks Tatoeba from the browser and two dictionaries through our server for up to 10 words; Tatoeba's API is marked `unstable`, and all learners' dictionary requests come from our server's address, which a free service can throttle or block | S (script + owner review), after 6.7 |
| ☆ 6.12 | Launch metrics: define activation, day-1/day-7 return and the onboarding funnel from existing events; one summary sheet; a threshold for "soft launch went well"                                                                                                                                                                                                                                                                                                                                                                                      | Analytics is collected, but nothing says what number means success                                                                                                                                                                                                | O                                    |
| ☆ 6.13 | Incident runbook (`docs/INCIDENTS.md`): key rotation per key, what to do on a data leak (who is told, when), contact address                                                                                                                                                                                                                                                                                                                                                                                                                          | Written calmly now, used in a hurry later; pairs with 5.5                                                                                                                                                                                                         | S                                    |
| ☆ 6.14 | Soft launch: a small audience first, watch 6.12 and monitoring for a week, then widen                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Finds the problems audits do not                                                                                                                                                                                                                                  | owner                                |

### Additions to existing steps (from `docs/AUDIT.md` §7 and this review)

| Step | Also do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0  | **Server tests with a database** (`pnpm test:db`, not part of `pnpm test`): the e2e server runs with `DATABASE_URL=''`, so `sync-server`, `league-server`, `email-accounts` SQL and `/api/account` are checked by nothing. Session 1 sets it up against the test database (`DATABASE_URL_TEST`, a Neon branch — never the main one; the script refuses to run if it equals `DATABASE_URL`) and covers registration, confirmation, reset. Sessions 3, 7, 8, 9, 12 add their cases to it |
| 1.2  | Server accepts only known `params` keys per event, or the test checks every `track()` call site                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.5  | On account deletion: unsubscribe the browser and remove its push row (AUDIT A11)                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.6  | Decide `users.deleted_at` (drop, or soft delete + purge); reminder schedule (cron runs once a day, phones plan by the hour; depends on 6.9)                                                                                                                                                                                                                                                                                                                                            |
| 2.2  | Body caps for `sync` and `feedback`; upper bound for an answer's time; per-user row quota                                                                                                                                                                                                                                                                                                                                                                                              |
| 2.4  | Vercel log retention and what it holds (addresses of senders) → DATA_MAP and `/privacy`                                                                                                                                                                                                                                                                                                                                                                                                |
| 2.5  | `nodemailer` → ≥ 10.1.4 (check next-auth's peer range; re-test e-mail sign-up by hand)                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5.3  | Password reset flow (AUDIT A8); change password and e-mail while signed in; `Origin` check on custom routes; sign-in must not reveal which addresses exist; `league` answers 401, not 500, for a deleted account                                                                                                                                                                                                                                                                       |
| 5.9  | Route-level error screens (`error.tsx`, `global-error.tsx`): check they exist and are translated                                                                                                                                                                                                                                                                                                                                                                                       |
| 6.4  | Feeds the threat-model rows "lost phone" and "cleared browser" in 2.6                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Sessions (order, grouping, model)

One row = one chat. Steps share a row when they edit the same files or one feeds the other
directly, so the files are read once. Unrelated steps are not merged: a long chat pays for its
whole context on every turn, which costs more than a fresh start.

Rules:

- Start from the files in "Start from"; for audit findings grep `docs/AUDIT.md` by the finding's
  id (A1…A12) or the step number, never read it whole.
- "Gate" = the session stops there and waits for the owner.
- If a row turns out bigger than expected (context grows heavy, or more than one round of
  screenshots is needed), finish the current step, write the work log, and hand off the rest of
  the row as "session N, part 2" — do not push on.
- A step that proves harder than its model (S stuck on a design decision) stops and hands off to O.

Effort (a judgment, not measured; raise one level if a session got stuck, never start at the top):

- **Opus, high:** sessions 1, 3, 11, 12, 15, 22 — logic and design where a mistake is costly.
- **Opus, medium:** sessions 4, 5, 21 — inventories, texts and conclusions from ready material.
- **Sonnet, high:** sessions 9, 23 — validation on many routes, data migration script.
- **Sonnet, medium:** every other Sonnet session.
- **Sonnet, low:** chats that only format, run tests and commit.

| #   | Model | Steps                                                                                    | Why together                                                                                              | Start from                                                                                                      | Gate                                                                      |
| --- | ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | O     | 1.0 + 5.3a (reset flow, sign-in does not reveal addresses, `Origin` check, `league` 401) | One design and one DB migration for "password set by a link"; same two files                              | `lib/email-accounts.ts`, `lib/auth.ts`, `api/account/*`, `lib/db/schema.ts`                                     | owner has put `DATABASE_URL_TEST` (Neon test branch) into `apps/web/.env` |
| 2   | S     | 1.1 + 1.2                                                                                | Same provider, tracker, schema and test file                                                              | `components/analytics/analytics-provider.tsx`, `lib/analytics/*`                                                | —                                                                         |
| 3   | O     | 2.1a                                                                                     | New shared piece (limiter + translation cache), four routes                                               | `api/translate`, `api/account/register`, `lib/email-accounts.ts`, `api/dev-unlock`                              | —                                                                         |
| 4   | O     | 1.3 + 5.4 + 6.7 + 1.6 (terms proposal only)                                              | All four are inventories read from the same code: data, storage keys, third parties, how long things live | `lib/db/schema.ts`, `lib/analytics/identity.ts`, `lib/lexicon/*`, `packages/content`, `packages/data/src/local` | owner approves retention terms                                            |
| 5   | O     | 1.4 text + 5.1 text (uk + en)                                                            | Both written from the documents of session 4; no code reading                                             | `docs/DATA_MAP.md`, `docs/LICENSES.md`                                                                          | owner's legal review, contact address, domain (6.1)                       |
| 6   | S     | 1.4 page + 5.1 page + Credits screen + links + 5.8                                       | Same kind of static page, one round of screenshots; sitemap lists these pages                             | `app/[locale]/`, `messages/*`, onboarding, profile, settings                                                    | —                                                                         |
| 7   | S     | 1.5 (with its addition)                                                                  | Large on its own: screen, export, deletion check, screenshots                                             | `components/settings/data-settings.tsx`, `components/profile/account-card.tsx`, `api/account`                   | test DB exists (3.4) for the deletion check                               |
| 8   | S     | 1.6 implementation + 5.3b (reset dialog, change password and e-mail in profile)          | Both small; 5.3b needs the routes of session 1, 1.6 needs the terms of session 4                          | `api/push/cron` (pattern), `components/account/sign-in-dialog.tsx`                                              | —                                                                         |
| 9   | S     | 2.1b + 2.2 + 5.2 (what is left)                                                          | Same route files: limits, body caps and validation are added in one pass                                  | `api/sync`, `api/feedback`, `api/track`, `api/push*`, `api/league`, `lib/sync-server.ts`                        | —                                                                         |
| 10  | S     | 2.3 + 2.4 + 2.5 + wiring of 6.1 and 6.3                                                  | All configuration: headers, env, CI, dependencies, domain and mail settings                               | `next.config.ts`, `vercel.json`, `.github/`, `package.json`, `lib/email.ts`, `lib/push.ts`                      | owner checks sign-in, speech, microphone, push by hand after headers      |
| 11  | O     | 6.4 + 6.6 (local data migration test)                                                    | Same local storage code                                                                                   | `packages/data/src/local/`                                                                                      | —                                                                         |
| 12  | O     | 6.5 + 6.6 (protocol version, "update the app", service-worker update)                    | Same sync code on both sides                                                                              | `lib/sync.tsx`, `lib/sync-server.ts`, `packages/data/src`, `public/sw.js`                                       | —                                                                         |
| 13  | S     | 6.15                                                                                     | Own script and files; uses `docs/LICENSES.md`                                                             | `lib/lexicon/*`, `packages/content/src/decks`                                                                   | owner reviews the sentences                                               |
| 14  | S     | 6.10 + 5.9                                                                               | A switched-off feature is one more "unavailable" state of the same screens                                | routes of sessions 3 and 9, their screens                                                                       | —                                                                         |
| 15  | O     | 2.6                                                                                      | Reads the finished protections; needs all of the above done                                               | `docs/AUDIT.md` (by id), protection files named in sessions 1–14                                                | owner approves fixes for weak spots                                       |
| 16  | S     | 5.5 + 4.3 + 6.13                                                                         | Three short operating documents about the same deploy and database                                        | `docs/DEVELOPMENT.md`, `drizzle/`, `scripts/db-migrate.mjs`                                                     | —                                                                         |
| 17  | S     | 3.3 + 5.6                                                                                | One tool choice covers errors and uptime                                                                  | `app/` (error boundaries), `api/*`                                                                              | owner creates the account                                                 |
| 18  | S     | 5.7 + 6.11                                                                               | Both are Playwright runs over all screens                                                                 | `e2e/`, `playwright.config.ts`                                                                                  | owner does the phone checklist                                            |
| 19  | S     | 3.4 + 3.2 (what is left) + 3.5                                                           | Load tests need the test environment; pool cost is measured by them                                       | `lib/db/client.ts`, `api/sync`, new `tools/load/`                                                               | owner creates Neon branch + preview                                       |
| 20  | S     | 4.1 + 4.2                                                                                | Same Playwright network measurements                                                                      | `e2e/`, `public/sw.js`                                                                                          | —                                                                         |
| 21  | O     | 3.6 + 6.12 + analysis of sessions 19–20                                                  | Conclusions from the same numbers                                                                         | `docs/METRICS.md`, 6.9 notes                                                                                    | —                                                                         |
| 22  | O     | 3.1 design (schema, dual write, migration order)                                         | Design only; short                                                                                        | `api/track`, `api/feedback`, `lib/reminder-store.ts`, `lib/google-sheets.ts`                                    | owner approves                                                            |
| 23  | S     | 3.1 a + b (schema + dual write, migration script)                                        | Same tables                                                                                               | as 22                                                                                                           | backup of the sheets first                                                |
| 24  | S     | 3.1 c + d (Sheets export, switch reads)                                                  | Finishes the move                                                                                         | as 22                                                                                                           | —                                                                         |

Owner-only steps (no chat needed unless the owner wants a checklist): 6.8, 6.1, 6.9, 6.3, 6.2,
5.10, 5.11, 6.14. Sessions 1–3 can start before any of them.

Launch needs sessions 1–18 and the owner steps; 19–24 are P1/P2 and can follow a soft launch
(6.14), except that 3.4 (test DB) is needed by session 7.

Owner track, in parallel from day one: 6.8 → 6.1 → 6.9 → 6.3 → 6.2 (after 1.4).

Dependencies: 1.4 needs 1.3 (and 1.6 terms) and the domain from 6.1; 1.5 needs 1.4 link; 6.2 needs 1.4 and 6.1; 3.5 needs 3.4; 3.6 needs 3.5 and 6.9; 3.1 before any Sheets-dependent metric; 5.3 completes 1.0.

## Owner manual tasks (collected)

Contact address for `/privacy`; legal review of privacy/terms text; approve retention terms; rotate any leaked keys; Vercel env vars (`CRON_SECRET` etc.); Neon test branch + preview deploy; monitoring account; Google Cloud budget alerts; analytics sheet export if direct access is unavailable.

## Final checklist before launch

- [ ] Consent works both ways; nothing sent without it
- [ ] `/privacy` and terms published, linked everywhere, owner-reviewed
- [ ] Export and account deletion verified on a test DB
- [ ] Cleanup cron running, counts logged
- [ ] Rate limits on all public routes (shared store), 429 handled in UI
- [ ] Headers/CSP verified against sign-in, translate, speech, mic, push, service worker
- [ ] No secrets in bundle or git history; `.env.example` exists
- [ ] `pnpm audit` clean (critical/high)
- [ ] Monitoring and uptime alerts live
- [ ] Load test report + scaling plan reviewed
- [ ] Backup restore tried (procedure written, session 16; the owner tries it on a test branch)
- [x] Rollback procedure written (`docs/DEVELOPMENT.md`, session 16)
- [ ] Unconfirmed address cannot be taken over; password reset works (A1, A8)
- [ ] Final domain in place; OAuth consent screen in production; letters reach Gmail/Outlook/ukr.net inbox
- [ ] Two-step sign-in on all owner accounts
- [ ] Local data: "storage full" handled, sync integrity tests green, old client against new server tested
- [ ] Licences listed, Credits screen published
- [ ] Kill switches tried once each
- [ ] iPhone and Android checklist passed
- [ ] `docs/WORKLOG.md` has an entry for every session
