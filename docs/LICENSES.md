# VocabX — licences, terms and attribution

Step 6.7 of `docs/PRELAUNCH_PLAN.md` (session 4, 2026-11-12). What the app uses that is not its
own, under which terms, what each requires, and what is missing today. The source for the
Credits screen (session 6) and for the third-party part of `/privacy` (session 5). A new source
of content, art, font or online service gets its row here in the same change.

"Checked" = read on the provider's page this session; "known" = the provider's published licence,
not re-read this session (confirm during the owner's legal review, session 5).

## 1. The app itself

| What                                                                                        | Licence                                                    | Note                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code of this repository                                                                     | GPL-3.0 (`LICENSE`)                                        | GPL-3.0 does not oblige publishing the source of a web service that is only run, not distributed (that would be AGPL); the repository is the source anyway |
| Built-in decks (`packages/content/src/decks/*.json`): words, translations, one example each | Written for the project (commits from 2d06be3, 2026-10-14) | Owner accepted this record on 2026-11-12: own content under the repository licence                                                                         |
| Placement test words (`packages/content/src/placement.ts`)                                  | Taken from the built-in decks                              | —                                                                                                                                                          |
| Interface texts (`apps/web/messages`)                                                       | Own                                                        | —                                                                                                                                                          |

## 2. Online services whose results the learner sees

### 2.1 Google Cloud Translation (`api/translate`, "Suggest" in the word form) — checked

- **Service Specific Terms** (cloud.google.com/terms/service-terms, page dated 2026-04-02): the
  only Translation clause asks to follow the HTML markup requirements (translate/markup) and the
  attribution requirements (translate/attribution). **No clause on caching or storing the
  results.** The Cloud Terms of Service read this session have none either.
- **Data usage FAQ** (translate/data-usage): the text sent is held briefly in memory to translate
  it; Google does not use it for anything else. Nothing about caching on the customer's side.
- **The 15-day limit** found in session 3 comes from the terms of the old Google AJAX Language
  API / Translate API v1 (a Google Groups thread, 2 121 days old by the search result's date). Those terms no longer apply
  to Cloud Translation v2/v3, which we use.
- **Attribution — required, missing today:**
  - "powered by Google Translate" (badge or text) shown **next to** any translation results,
    linking to `https://translate.google.com`;
  - make clear to the user that these are automatic translations from Google Translate;
  - the app's description / help names Google Translate as the source;
  - results shown unmodified need the disclaimer "THIS SERVICE MAY CONTAIN TRANSLATIONS POWERED BY
    GOOGLE…" available (on `/privacy` or Credits);
  - on indexable pages machine translations need the HTML markup — not our case (results are
    shown only inside the signed-in or local app, never on indexable pages).
- **Storage in the app:** `translation_cache` (shared, 30 days now), the CDN copy (`s-maxage` 30
  days), the browser cache (`vocabx:cache:google-translations`, 30 days). The translation the
  learner picks and confirms is kept with their word: that is the learner's own content.
- **Proposal for `CACHE_MS`:** 15 days, and the same for `s-maxage` of `/api/translate` and for
  the browser cache of Google answers. Not required by any current term found; it keeps us within
  the only storage limit Google has ever written down, at a small cost (estimate, not measured: a
  word asked again 15–30 days after the first ask costs one more request; with the 15 000
  characters/day ceiling of 2.1a that stays inside the free 500 000/month). **Approved by the owner
  (2026-11-12)**; session 8 changes the numbers.

### 2.2 Tatoeba (sentences in review and "Suggest", browser → `api.tatoeba.org`) — known

- Sentences: CC BY 2.0 FR (most), some CC0. CC BY needs credit to the author, a link to the
  licence and an indication of changes.
- **Done (session 13, step 6.15):** `lib/lexicon/tatoeba.ts` keeps the sentence id, the author and
  the licence with the example (`Example.credit`, also in the sync schema). The credit "Tatoeba ·
  author" (link to the sentence) is shown under the example in the word's details, in the review
  card and after an answer in the sentence tasks (`components/ui/example-credit.tsx`). Credits
  names Tatoeba and the licence. Sentences stored before session 13 have no credit; they are the
  learner's own copies from before and are not touched. Only sentences with an author are kept.
- **Built-in words:** their extra sentences come from one run of `apps/web/scripts/fetch-examples.ts`
  (Tatoeba only, so every one has an author and a licence) and ship as `/public/examples/<deck>.json`
  with the credit inside. The licence stays in each sentence, so a later sentence under another
  licence needs no change in code. The API used is marked `unstable` by Tatoeba itself.
- Translations of Tatoeba sentences are not taken (they would need their own authors' credit).

### 2.3 Wiktionary (definitions via `/api/dictionary`; translations from the browser) — known

- Text: CC BY-SA 4.0 (and GFDL). Credit: "Wiktionary", link to the entry, the licence. ShareAlike
  applies to adapted text that is redistributed.
- **Missing today:** no credit anywhere.
- Wikimedia's API rules ask for a descriptive `User-Agent` with a way to contact the operator: the
  server proxy sends `VocabX (vocabulary trainer)` without a contact. Add the site address (not a
  personal e-mail) in session 10 or 13.

### 2.4 Free Dictionary API (`api.dictionaryapi.dev`, via `/api/dictionary`) — known

- Free, no key, no service guarantee. Its data comes from Wiktionary; answers carry a licence
  (CC BY-SA 3.0) and source URLs. Credit as for Wiktionary.
- **Missing today:** no credit; the licence and source fields of the answer are dropped.

## 3. Services without content shown to the learner

| Service                                | Terms that matter                                                                                         | Status                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Google Sign-In (OAuth)                 | Google API Services User Data Policy; the consent screen must be in production with a privacy policy link | Owner step (final checklist); `/privacy` link needed (1.4)                                                  |
| Google Sheets API                      | Google APIs Terms                                                                                         | Nothing to show                                                                                             |
| Vercel (Hobby, free)                   | Hobby plan is for personal, non-commercial use                                                            | **Owner to note:** a paid or commercial launch would break the Hobby terms; free and non-commercial is fine |
| Neon (free)                            | Free plan limits                                                                                          | 6.9                                                                                                         |
| Gmail SMTP                             | Daily sending cap of the account                                                                          | Session 10 documents it (6.3)                                                                               |
| Telegram Bot API                       | Bot terms                                                                                                 | Nothing to show                                                                                             |
| Web Push services                      | —                                                                                                         | Nothing to show                                                                                             |
| Browser speech recognition / synthesis | The browser's own terms (Chrome sends audio to Google)                                                    | Say so in `/privacy` (session 5)                                                                            |

## 4. Fonts, icons, art, libraries

| What                                                                                                                     | Licence                                                                                                                                                                                                                  | Credit                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Inter, Manrope (`next/font/google`, served from our domain)                                                              | SIL Open Font License 1.1                                                                                                                                                                                                | Not required on screen; list in Credits                    |
| Icons (`lucide-react` 1.56.0)                                                                                            | ISC                                                                                                                                                                                                                      | List in Credits                                            |
| Character art (`public/male/*`: 13 PNGs — dog and wolf heads and bodies, clothes, accessories)                           | Owner's own: generated with Google Gemini, then reworked by the owner in Photoshop (owner, 2026-11-12). Google does not claim rights in Gemini output; Gemini's use policy applies to how it was made, not to showing it | None required; Credits may say "Art: the author of VocabX" |
| App icons, `og.png`, `apple-touch-icon.png` (`public/`, copied to `apps/web/public`)                                     | Owner's own images (same answer, 2026-11-12)                                                                                                                                                                             | None required                                              |
| Next.js 16.4.3, React 19.3.0, next-intl 4.14.9, Radix UI 1.8.1, motion 14.2.0, zod 4.6.7, @neondatabase/serverless 1.2.0 | MIT                                                                                                                                                                                                                      | Licence texts ship with the code; Credits lists them       |
| next-auth 4.24.15                                                                                                        | ISC                                                                                                                                                                                                                      | as above                                                   |
| drizzle-orm 0.45.4                                                                                                       | Apache-2.0                                                                                                                                                                                                               | as above (keep its NOTICE if any)                          |
| nodemailer 7.0.13                                                                                                        | MIT-0                                                                                                                                                                                                                    | No credit required                                         |

Versions from `node_modules/*/package.json` on 2026-11-12.

## 5. Credits screen — content for session 6

1. Translations: "powered by Google Translate" (+ link) — also next to the suggestions in the word
   form, not only on Credits.
2. Example sentences: Tatoeba (tatoeba.org), CC BY 2.0 FR; authors credited with each sentence.
3. Definitions and translations: Wiktionary (CC BY-SA 4.0), through Free Dictionary API.
4. Fonts: Inter, Manrope — SIL OFL 1.1.
5. Icons: Lucide — ISC.
6. Character art: the author of VocabX.
7. Open-source libraries: list from section 4, with a link to the repository's licence files.
8. Google Translate disclaimer (section 2.1), in English as Google gives it.

## 6. Open items

| Item                                                                                                     | Who       | Where                     |
| -------------------------------------------------------------------------------------------------------- | --------- | ------------------------- |
| "powered by Google Translate" next to suggestions                                                        | assistant | session 6 (with Credits)  |
| Tatoeba id + author kept and shown (Wiktionary / Free Dictionary examples are not credited per sentence) | assistant | done in session 13 (6.15) |
| `User-Agent` with the site address for Wikimedia                                                         | assistant | session 10 or 13          |
| `CACHE_MS` 15 days (and `s-maxage`, browser cache), approved                                             | assistant | session 8 with 1.6        |
| Vercel Hobby = non-commercial                                                                            | owner     | before any paid feature   |
