# VocabX

Product name: **VocabX**. Talk to the user in **Russian**.
Docs: `README.md` (users), `docs/DEVELOPMENT.md` (setup, structure, decisions), `docs/ANALYTICS.md`.
Next.js 16 has breaking changes: read `node_modules/next/dist/docs/` before writing Next code.

## Monorepo (pnpm, Node 22, strict TS)

- `apps/web` — Next.js 16 App Router, Tailwind v4 (semantic tokens), next-intl (default `uk`, plus `en`), Radix UI, motion, next-auth, Neon + drizzle.
- `packages/core` — pure logic: `scheduler.ts` (FSRS), `session.ts`, `stack.ts`, `placement.ts`, `quiz.ts`, `sentence.ts`, `league.ts`, `xp.ts`, `streak.ts`; `Clock` in `clock.ts`, `Rng` in `rng.ts`.
- `packages/content` — built-in decks (`src/decks`), languages, placement words.
- `packages/data` — storage (`src/local/`), sync merge/journal.
- `tools/eslint-plugin-vocabx` — rules `vocabx/design-tokens`, `vocabx/no-jsx-literals`.

Inside `apps/web`:

- Themes: `src/themes/` (+ `src/app/globals.css`, `src/lib/theme.tsx`).
- i18n messages: `messages/{uk,en}/*.json`; code in `src/i18n/` (`messages.test.ts` checks uk/en parity).
- UI primitives: `src/components/ui/`; feature components: `src/components/<feature>/`.
- Repos/helpers: `useRepos()` (`src/lib/repos.tsx`), `useClock()` (`src/lib/clock.tsx`), other helpers in `src/lib/`.
- Analytics: `src/lib/analytics/schema.ts` (`EVENTS`), `tracker.ts`, `track()`; server `src/app/api/track/route.ts`.
- E2E: `e2e/*.spec.ts`, `e2e/fixtures.ts`, `scripts/e2e-changed.mjs`.

## Rules

- Semantic theme tokens only (`bg-surface`, `text-fg-muted`, `bg-accent`). No raw Tailwind colors (`bg-white`, `text-gray-*`, `[#…]`), no `dark:`.
- Logical spacing only: `ms/me/ps/pe/start/end`, never `ml/mr/pl/pr/left/right`.
- No hardcoded text in JSX (incl. `alt/title/placeholder/aria-*`): use next-intl; add every key to both `uk` and `en` at once.
- Reuse `components/ui` instead of repeating markup.
- No `localStorage`/`sessionStorage` in components: use `useRepos()` or `lib` helpers. Use `Rng`/`Clock`, not `Math.random`/`Date.now`.
- Responsive (phone + desktop) and `prefers-reduced-motion` support are required.
- New analytics event: add to `EVENTS` in `schema.ts` and to the table in `docs/ANALYTICS.md` (steps: "Як додати подію"), update `analytics.test.ts`.

## Checks and git

- After every batch of edits (not each single edit) run `pnpm typecheck`, `pnpm lint`, `pnpm test` until clean; before any commit also `pnpm exec prettier --write <changed files>` (CI runs `format:check`).
- Do not run e2e after ordinary edits, but update e2e specs together with the code and list the affected ones in the report.
- No commit unless asked. Exception: on "прогони тесты" make a local commit (no push), then run `pnpm e2e:changed` (picks specs from the diff).
- Push only on explicit request. When the owner asks to push, run the full `pnpm e2e` once first, without asking, and push only if it passes; skip it only if a full run already passed on this exact commit. Never run the full suite at any other time unless asked.
- Before a push, if `docs/to_test_locally.md` has unchecked items (`- [ ]`), list their section titles and ask the owner whether they were checked by hand; push only after the answer.
- The assistant runs the tests itself (the owner does not paste output): write the output to a log and grep it. E2E failure: rerun only the failed test once before diagnosing (flaky runs).

## Visual check

Any visual change (markup, classes, CSS, themes, layout, animation) must be checked by screenshots before it is committed (including the local commit on "прогони тесты"):

1. Finish all edits and get typecheck/lint/test clean first.
2. Run `pnpm screenshots` once (output to a log, `tail` it); PNGs land in `apps/web/screenshots/`.
3. Open only the frames the change touches: usually one phone (360×740 or 390×844) and one desktop (1280×800); add a theme/dark frame if colors changed.
4. If something is wrong, fix and repeat once; no endless edit → screenshot loops. Report what was checked.

## Pre-launch plan

Work from `docs/PRELAUNCH_PLAN.md`, one row of its "Sessions" table per chat (the row sets the model and the steps); read only that row, its steps and their "Additions" rows; grep `docs/AUDIT.md` by finding id, never read it whole. Follow its "Handoff rule" at the end of each session (the model to use and a ready prompt for the new chat). Before the handoff, append an entry to `docs/WORKLOG.md` and a section of manual checks to `docs/to_test_locally.md` (both Russian, format at the top of each file; rule 11 of the plan's working protocol), without being asked.

## Token economy

Context size × turns is the cost: every image read stays in context. Don't screenshot after each small edit, only once per finished batch (see Visual check). Pipe long output (typecheck, lint, test, e2e, build) through `tail`/`grep`; for big files read with offset or grep; no subagents unless asked.
