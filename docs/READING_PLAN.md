# VocabX — reading and listening module plan

A library of short texts written in advance for each CEFR level, with recorded audio. The learner
reads or listens, sees which words are new, saves them to a deck in one tap, and is tested on them
afterwards. Design session R0, 2026-11-16 (Fable). No application code exists yet.

This module starts **after** the launch described in `docs/PRELAUNCH_PLAN.md`. The rules of that
plan's "Working protocol" apply to every session here (checks, screenshots, work log, manual
checks); the session rows below replace its "Sessions" table for this module.

## Progress and handoff

Next: **owner decisions** (section "Owner decisions"), then session **R1**.
Done: R0 (this document, six pilot texts in `packages/content/src/texts/en/`, 2026-11-16).

Handoff: as in `docs/PRELAUNCH_PLAN.md` ("Handoff rule"): work log entry headed `R<n>`, manual
checks, then the model and a ready prompt for the next row. Update the two lines above.

## Snapshot (checked in code, 2026-11-16)

- `LanguageAdapter` (`packages/core/src/language.ts`) already has `tokenize` and `lemmatize`; the
  English adapter (`packages/content/src/adapters/en.ts`) has no lemmatizer: `lemmatize` only
  normalizes. Nothing in the repository knows word frequency or the CEFR level of an arbitrary word.
- `WordSource` is a closed list in `packages/core/src/schemas.ts` (`z.enum`): a new value would be
  rejected by devices running older code. `Word.video` exists and is unused.
- `Example` has `text`, `credit` (Tatoeba only) and `translations`; `clozeOf` in `sentence.ts`
  builds a fill-the-gap task from any example sentence, so a sentence of a text can be used as is.
- Built-in decks are JSON inside the app bundle (`packages/content/src/decks`); topic decks carry
  `topic` (`travel`, `food`, `home`, `emotions`, `sport`, `health`, `work`, `career`, `tech`,
  `social`, `money`, `education`, `climate`, `ai`, `society`).
- Placement (`placement.ts`) puts the learner at a level by built-in decks and records known words
  as events of kind `placement`; there is no stored "knows the first N words" number.
- `lib/speech.ts` speaks with the device's voice at a fixed rate 0.95 and picks the voice by
  language; quality and the set of accents depend on the device.
- The service worker (`public/sw.js`) serves static files cache-first and pages network-first; it
  has no rule for content files or audio.
- Hosting limits (`docs/SCALING.md`): Vercel Hobby 100 GB transfer a month and non-commercial use
  only; Neon Free 1 GB. This module adds no database tables and no API routes.

## Decisions

1. **Everything is static.** Texts, the manifest and the timings are files; audio is in object
   storage behind a CDN. Search, coverage ("you know 94%") and ranking run on the device, also
   offline. The learner's vocabulary never leaves the device.
2. **A script decides the level, not the author.** `pnpm reading:validate` measures every text
   against the criteria below and fails the ones outside their level. The thresholds here are
   starting values (estimate); R1 calibrates them on the six pilot texts and records the result.
3. **CEFR lists first, frequency second.** Concrete beginner nouns ("sock", "airport") are rare in
   corpora, so frequency alone marks an A1 text as hard. A word's level is its tag in the CEFR
   list; only a word with no tag falls back to its frequency rank.
4. **Texts are written in Claude Code chats**, one chat per level, not through an API: no keys, no
   pipeline. The validator is the loop: write five, validate, rewrite the failures.
5. **Audio is recorded in advance** by a neural TTS provider. Speed is changed in the player
   (`playbackRate`, pitch preserved), so one file serves every speed. An accent is a separate
   recording. Pasted texts of the learner (R8) use the device's voice through `lib/speech.ts`.
6. **No new value in `WordSource`.** A word saved from a library text gets `source: 'public_deck'`
   and the new optional `Example.text`; that field, not the source, says where it came from.
7. **First version:** English only; sentence translations into Ukrainian only; two accents
   (en-US, en-GB), one voice each; 120 texts (6 levels × 20).

## Word data for English (licences)

Found by search on 2026-11-16; licence texts were not opened one by one. **R1 opens each licence
page before adding a file** and writes the entry in `docs/LICENSES.md` and the Credits page.

| Data                | Source                                             | Licence (as found)                                           | Use                                                          |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| CEFR levels A1–B2   | CEFR-J Wordlist 1.5 (Tono Lab, TUFS)               | free for research and commercial use, citation required      | **primary level of a word**                                  |
| CEFR levels C1–C2   | Octanove Vocabulary Profile 1.0                    | CC BY-SA 4.0                                                 | **primary level of a word**                                  |
| Frequency           | hermitdave/FrequencyWords `en` (film subtitles)    | data CC BY-SA 4.0 (code MIT)                                 | **rank of a lemma** (spoken, fits stories and dialogues)     |
| Frequency, other    | wordfreq                                           | data CC BY-SA 4.0 (code MIT/Apache by version)               | alternative if the subtitle list proves too noisy            |
| Core words          | NGSL 1.2 (2809 words)                              | CC BY-SA 4.0                                                 | check of the first bands only; too short to be the main list |
| Form → lemma        | 12dicts (`2+2+3lem`)                               | public domain (the 12dicts package; file name not confirmed) | **primary lemma table**                                      |
| Form → lemma, other | michmech/lemmatization-lists                       | ODbL 1.0                                                     | fills gaps                                                   |
| Form → lemma, other | AGID (Kevin Atkinson)                              | permissive, WordNet-style notice                             | fills gaps                                                   |
| **Not to be used**  | Oxford 3000/5000, English Vocabulary Profile, COCA | proprietary                                                  | —                                                            |

CC BY-SA and ODbL are share-alike: the file built from them is published under the same licence
and credited. Reading taken here (to be confirmed in the owner's legal review, `docs/LEGAL_REVIEW.md`):
the data file is a separate work, the application code is not covered. R1 therefore keeps the
derived file apart from code (one JSON per language) with its licence beside it.

Shape of the derived file (`packages/content/src/lexicon/en.json`, built by a script from the
sources, loaded lazily, never in the main bundle): the first 20 000 lemmas in rank order with a
level where one is known, and a form → lemma table for forms that differ from their lemma.
Estimate: 300–500 KB gzipped (20 000 lemmas ≈ 150 KB, ≈ 60 000 forms ≈ 300 KB; to be measured in R1).

## Level criteria (starting values, estimate)

Counted on tokens after lemmatization. Names (a capitalized token that is not first in its
sentence and is not in the list) and numbers are left out of every share.

A token is **at level L or below** when its lemma's CEFR tag is ≤ L, or, with no tag, when its
rank is within the fallback rank of L.

| Level | Fallback rank | Tokens at ≤ L, min | Tokens two levels above or more, max | Unique lemmas at exactly L, min | Mean sentence, words | Longest sentence |
| ----- | ------------- | ------------------ | ------------------------------------ | ------------------------------- | -------------------- | ---------------- |
| A1    | 1 000         | 92%                | 2%                                   | —                               | 5–8                  | 12               |
| A2    | 2 000         | 90%                | 2%                                   | 8%                              | 7–10                 | 16               |
| B1    | 3 500         | 90%                | 2%                                   | 8%                              | 9–13                 | 23               |
| B2    | 6 000         | 90%                | 3%                                   | 8%                              | 12–17                | 30               |
| C1    | 10 000        | 90%                | 3% outside the first 20 000          | 8%                              | 14–21                | 40               |
| C2    | 20 000        | —                  | 4% outside the first 20 000          | 8% at C1 or C2                  | 15–24                | 45               |

- "Unique lemmas at exactly L" keeps a text from being too easy for its level.
- The upper bound of the mean and the longest sentence fail a text; the **lower bound of the mean
  only warns**. One-word lines pull the mean down in any format: measured on the pilots
  (2026-11-16), the C1 letter has a mean of 10.0 because of four quoted one-word sentences, the
  B1 episode 8.9 because of its dialogue. For `dialogue` and `chat` the lower bound is also
  multiplied by 0.6 (pilots: A2 chat 4.7, B2 dialogue 8.5).
- Grammar is not measured. It is a rule for the author, checked by reading: A1 present simple and
  continuous, `can`, `there is`; A2 adds past simple, `going to`, comparatives; B1 adds present
  perfect, past continuous and perfect, first and second conditional, passive; B2 and above — no limit.
- The validator also checks the schema, the length (table below, ±15%), that every sentence has a
  translation, that ids are unique and that a series has all its episodes.

## Length

Length is promised to the learner as reading time. Words = minutes × reading rate of the level
(estimate from typical learner reading speeds; R1 may correct the rates, not the minutes).

| Level | Words a minute | 1 min | 3 min | 5 min | 8 min |
| ----- | -------------- | ----- | ----- | ----- | ----- |
| A1    | 60             | 60    | 180   | 300   | 480   |
| A2    | 80             | 80    | 240   | 400   | 640   |
| B1    | 110            | 110   | 330   | 550   | 880   |
| B2    | 140            | 140   | 420   | 700   | 1120  |
| C1    | 170            | 170   | 510   | 850   | 1360  |
| C2    | 190            | 190   | 570   | 950   | 1520  |

First library, 20 texts a level with the four lengths in equal numbers: 85 minutes a level,
≈ 63 750 words in all (85 × the sum of the rates, 750), ≈ 365 000 characters (× 5.7, estimate).

## Formats and what makes a text worth reading

Formats (`format` in the file): `story` (one scene with an ending), `serial` (an episode of a
series), `dialogue` (two speakers, spoken), `chat` (messages), `letter`, `diary`, `howto`
(a situation from life told step by step), `essay` (C1–C2 only: one idea, argued).

Rules for the author:

1. **Something changes by the end.** A reversal, a discovery, a decision. No text that only
   describes ("My family", "My day").
2. **The first two sentences raise a question** the reader wants answered.
3. **An episode of a serial stops at an open question**; the last episode answers all of them.
   A series has 5–8 episodes of one level and one length.
4. **People, not types.** A name, one concrete detail, one thing the person wants.
5. **Humour and warmth over drama.** No violence, no politics, no religion, no illness as a plot,
   nothing that reads badly out of context.
6. **Nothing about the real world that can be wrong**: no real people, events, dates, figures or
   brands. Places may be named; facts about them may not be invented.
7. **No textbook phrases** ("Let me tell you about…", "In conclusion…") and no moral at the end.
8. **A new word is helped by its sentence**: the context should let the reader guess it.
9. **One spelling: British** (as in the built-in decks: "neighbour"). The accent of the audio does
   not change the text.
10. **Translations are natural Ukrainian**, sentence for sentence, not word for word; the same
    name is written the same way through the whole series.
11. A text built on a deck (`deckId`) uses at least 8 of the deck's words, each in a sentence that
    shows its meaning.

A level's set of 20: 2 series of 5 episodes, 6 stories, 4 dialogues, chats, letters or diaries
(and essays from C1); lengths 1, 3, 5 and 8 minutes in equal numbers; 4 texts built on a deck.

## File formats

### Text: `packages/content/src/texts/<lang>/<slug>.json`

```jsonc
{
  "id": "text:en-b1-night-bus-1", // "text:" + file name
  "lang": "en",
  "cefr": "B1",
  "minutes": 3, // 1 | 3 | 5 | 8
  "format": "serial",
  "title": "The Night Bus",
  "titleI18n": { "uk": "Нічний автобус" },
  // One line shown on the card; must not give the ending away.
  "summaryI18n": { "uk": "…", "en": "…" },
  "topics": ["travel"], // `topic` values of the built-in topic decks
  "keywords": ["bus", "night", "stranger", "mystery"], // 5–8, lower case, lemmas
  "series": { "id": "series:en-b1-night-bus", "episode": 1, "of": 6 }, // optional
  "deckId": "builtin:en-topic-travel", // optional: the text is built on this deck's words
  "paragraphs": [
    {
      "speaker": "Nora", // optional: dialogue and chat
      "sentences": [{ "text": "…", "translations": { "uk": "…" } }],
    },
  ],
}
```

A sentence is addressed by its number in reading order through the whole text (from 0). An edit
that adds or removes a sentence shifts the numbers after it: saved examples keep their own copy of
the sentence text, so nothing breaks, only the "open in the text" link may land one sentence off.

Texts are not imported into the bundle. The build copies them to `apps/web/public/reading/`
(as `sync-media` copies `sw.js`) under names that contain a content hash; the service worker
serves `/reading/*` cache-first and keeps the texts the learner opened.

### Manifest: `reading/<lang>/manifest.<hash>.json`

Written by `pnpm reading:validate`, never by hand. One entry per text:

```jsonc
{
  "id": "text:en-b1-night-bus-1",
  "file": "en-b1-night-bus-1.3f9a1c.json",
  "cefr": "B1",
  "minutes": 3,
  "words": 330,
  "format": "serial",
  "title": "The Night Bus",
  "titleI18n": { "uk": "Нічний автобус" },
  "summaryI18n": { "uk": "…", "en": "…" },
  "topics": ["travel"],
  "keywords": ["bus", "night", "stranger", "mystery"],
  "series": { "id": "series:en-b1-night-bus", "episode": 1, "of": 6 },
  "deckId": null,
  // Ranks of the unique lemmas, ascending; 0 stands for a lemma outside the list.
  // Coverage and "has my words" are computed from this without opening the text.
  "lemmas": [1, 2, 3, 5, 8, 13],
  "audio": [
    {
      "voice": "en-GB-1",
      "accent": "en-GB",
      "url": "https://<audio host>/en/en-b1-night-bus-1/en-GB-1.9c2e7a.mp3",
      "timings": "en-b1-night-bus-1.en-GB-1.9c2e7a.json",
      "durationMs": 171000,
      "bytes": 1368000,
    },
  ],
}
```

Size (estimate): 120 entries × ≈ 300 unique lemmas ≈ 250 KB, under 100 KB gzipped; loaded when the
reading tab is first opened and cached.

### Audio and timings

- One file per text and voice: **MP3, mono, 24 kHz, 64 kbit/s, constant bitrate** (constant, so a
  jump to a sentence lands exactly; MP3, so every browser plays it). ≈ 0.48 MB a minute.
- Pauses are part of the file: 350 ms after a sentence, 800 ms after a paragraph.
- Slow levels are recorded slower, not stretched afterwards: speaking rate 0.85 for A1–A2, 0.92
  for B1, 1.0 from B2.
- Timings `…/<text>.<voice>.<hash>.json`:

```jsonc
{
  "textId": "text:en-b1-night-bus-1",
  "voice": "en-GB-1",
  "textHash": "3f9a1c", // of the text file the audio was made from
  "durationMs": 171000,
  "sentences": [
    [0, 4180],
    [4530, 8020],
  ], // [startMs, endMs], reading order
  "words": [
    [
      [0, 310],
      [310, 520],
    ],
  ], // optional, per sentence, when the provider gives it
}
```

- A changed text gets a new hash; the manifest lists audio only when `textHash` matches, so the
  player never highlights the wrong sentence. The script re-records only what changed.
- Size of the first library (estimate): ≈ 63 750 words at ≈ 140 words a minute ≈ 455 minutes
  ≈ 220 MB per voice, 440 MB for two.

## TTS providers

Prices and features by search on 2026-11-16, mostly from third-party pages; "memory" = not
confirmed by the search. **The owner checks the price page and the output-rights terms of the
chosen provider before paying.** Cost is for the first library in two voices, ≈ 730 000 characters.

| Provider                     | Voices for en-US / en-GB        | Word timings                                      | Price per 1M characters                                   | First library (estimate)  | Keeping and serving the audio in a commercial product          |
| ---------------------------- | ------------------------------- | ------------------------------------------------- | --------------------------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| **Azure AI Speech** (neural) | many, also AU, IN, IE (memory)  | yes, word boundary events of the SDK (memory)     | ≈ $15 neural, ≈ $22 HD; 0.5M a month free                 | ≈ $11–16                  | allowed on a paid resource by forum answers; free tier unclear |
| Google Cloud TTS, Chirp 3 HD | yes, also AU, IN (memory)       | no for Chirp 3 HD (memory); marks in older voices | $30; first 1M a month free (Neural2 $16, legacy)          | $0–22                     | not found in the search; read the service terms                |
| Amazon Polly                 | several each                    | yes, speech marks (not listed for Generative)     | $16 neural, $30 generative                                | ≈ $12–22                  | caching and replay allowed (memory); not found in the search   |
| ElevenLabs                   | large library, the most natural | yes, per character (`/with-timestamps`)           | by plan: commercial licence from Starter (≈ $5–6 a month) | ≈ $100–200 (plan credits) | commercial licence on paid plans only                          |

Why word timings matter beyond highlighting: with them a whole paragraph is recorded in one
request and the sentence boundaries are read from the timings, so the intonation runs across
sentences. Without them every sentence is recorded alone and joined, which is exact but sounds
flatter at the joins.

**Recommendation:** Azure neural as the first choice (timings, the widest set of accents, the
lowest price), Google Chirp 3 HD as the comparison. R6 records the six pilot texts with both and
the owner chooses by ear before the library is recorded.

## Audio storage

| Option                         | Free allowance (search, 2026-11-16)                     | For 440 MB of audio                                                                                         |
| ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Cloudflare R2** + own domain | 10 GB stored, 10M reads a month, no charge for transfer | fits with room for ≈ 20 more voices; needs a Cloudflare account, a card and a domain on Cloudflare (memory) |
| Vercel Blob (Hobby)            | 1 GB stored, 10 GB transfer a month, hard stop          | fits; 10 GB ≈ 5 000 full listens a month (≈ 2 MB each), then audio stops until next month                   |
| Backblaze B2 behind Cloudflare | 10 GB stored; transfer free through Cloudflare          | fits; two services to set up instead of one                                                                 |
| `apps/web/public/` on Vercel   | counts against the 100 GB transfer of Hobby             | puts 440 MB of binaries into the repository and every deployment; not recommended                           |

**Recommendation:** Cloudflare R2. Files are immutable (hash in the name, `Cache-Control: public,
max-age=31536000, immutable`); the security headers get `media-src` for the audio host.

## New data (all optional fields, no `SYNC_PROTOCOL` change)

| Where                               | Field                                                                                                  | Notes                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `Example`                           | `text?: { id: string; sentence: number }`                                                              | the sentence came from a library text; the reader opens it at that sentence                                     |
| `Deck`                              | `textId?: string`                                                                                      | "words of this text": one per text, as `builtinId` is one per built-in deck (same merge rule: the oldest stays) |
| `AppSettings`                       | `reading?: { topics: string[]; targetCoverage: number; tint: boolean; voice?: string; rate?: number }` | settings stay per device, as today                                                                              |
| local only, key `vocabx:v1:reading` | `{ [textId]: { sentence: number; openedAt: number; finishedAt?: number; quizAt?: number } }`           | at most 200 texts, oldest dropped; not synced in the first version                                              |

- R1 checks first how the zod schemas in `packages/core/src/schemas.ts` treat an unknown key
  (strip or reject). If an older device rejects a word because of `Example.text`, the field waits
  for a `SYNC_PROTOCOL` step and R3 stores the reference only in the local reading record.
- The local schema change follows "Ключові рішення" in `docs/DEVELOPMENT.md`: a migration in
  `packages/data/src/local/schema.ts`, the frozen `storage-v2.json` test stays green.
- Known lemmas are derived on the device and not stored: lemmas of the learner's words that have
  progress, the "learned" deck, and every lemma at or below the level **under** the placement
  level (placed at B1 ⇒ A1 and A2 words count as known). Estimate; R1 may tune it.
- Each new stored item gets its row in `docs/DATA_MAP.md` (R3) and a line in `/privacy` (R9).

## Pure logic: `packages/core/src/reading/`

`profile.ts` (tokens, unique lemmas, shares by level, sentence lengths), `level.ts` (the criteria
table as data in `config/params.ts` and the verdict with reasons), `known.ts`, `coverage.ts`
(share known, list of unknown lemmas), `text-deck.ts` (candidates for the deck of a text, most
useful first), `search.ts` (query → lemmas → matches in title, keywords and lemma ranks; filters),
`rank.ts` (score for the shelves: closeness of coverage to the target, number of the learner's
due words in the text, topic match, not read yet, next episode of a started series first),
`timings.ts` (sentence at a time, binary search). No browser or Node APIs; `Clock` and `Rng` only.

## Sessions

One row = one chat. Models: **F** Fable, **O** Opus, **S** Sonnet, **H** Haiku.
MVP is R1–R5 (reading). R6–R7 (audio) start after the owner has seen that reading is used.

| #   | Model                    | Steps                                                                                                                                                                                            | Why together                                              | Start from                                                                                             | Gate                                                  |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| R1  | O, high                  | Word data for English (licences opened, `LICENSES.md`, Credits); `lemmatize` for `en`; `core/reading/*`; `tools/reading-validate` + `pnpm reading:validate`; thresholds calibrated on the pilots | The validator is the first user of the data and the logic | `packages/core/src/language.ts`, `schemas.ts`, `packages/content/src/adapters/en.ts`, the pilot texts  | owner decisions 1–3 below                             |
| R2  | F or O, one chat a level | 20 texts of the level, validated in batches of five                                                                                                                                              | One level's rules and vocabulary stay in one context      | "Formats", "Length", "Level criteria", "Text" above; the pilot text of the level                       | owner reads the list flagged for review               |
| R3  | S                        | Reader page: text by sentences, word tint by status, word popover and "add", sentence translation, reading record, `/reading/*` in the service worker                                            | One screen and its data                                   | `components/review`, `lib/lexicon/use-lexicon.ts`, `packages/data/src/local/schema.ts`, `public/sw.js` | —                                                     |
| R4  | S                        | Deck of a text (add / skip picker), warm-up before, quiz after, `deckToTsv` and the export button                                                                                                | All of it turns a text into cards                         | `components/library/word-picker.tsx`, `core/decks.ts` (`builtinPickState`), `core/sentence.ts`         | —                                                     |
| R5  | S                        | Reading tab: topics on first open, shelves, card of a text, keyword search and filters                                                                                                           | One screen over the manifest                              | `components/shell/sidebar.tsx`, `components/library/*`, `core/reading/search.ts`, `rank.ts`            | owner decides whether audio (R6–R7) goes ahead        |
| R6  | O design, S script       | `tools/reading-tts`: record, join, timings, upload, manifest; `media-src`; the six pilots in both candidate voices                                                                               | The timing format and the script that writes it           | "Audio and timings" above, `next.config.ts` headers                                                    | owner picks the provider by ear; provider account, R2 |
| R7  | O, medium                | Audio player in the reader: highlight, jump, speed, accent, pause-and-repeat, listen first, dictation, lock-screen controls, save for offline                                                    | Playback state and its edge cases in one place            | R3's reader, `core/reading/timings.ts`, `core/grading.ts`                                              | —                                                     |
| R8  | S                        | Own text: paste or `.txt`, kept on the device with a size limit; share target; device voice by accent and speed                                                                                  | The same reader fed from another source                   | R3's reader, `lib/speech.ts`, the web manifest                                                         | —                                                     |
| R9  | S (key parity: H)        | Analytics events, XP for a finished text with a daily cap, full e2e, axe, README, `DEVELOPMENT.md`, `DATA_MAP.md`, `/privacy`                                                                    | Closing checklist                                         | `lib/analytics/schema.ts`, `core/xp.ts`, `e2e/fixtures.ts`                                             | owner's legal read of the `/privacy` lines            |

Effort: R1 Opus high; R2 the highest writing quality available, medium; R7 Opus medium; the
Sonnet rows medium. A Sonnet session stuck on a design question stops and hands off to Opus.

## Owner decisions

Before R1:

1. **Pilot texts and the rules for texts** — are the six pilots the tone and quality wanted? What
   to change in "Formats and what makes a text worth reading"?
2. **Level criteria and lengths** — accept the starting tables (R1 calibrates the numbers), and
   British spelling for all texts?
3. **Share-alike word data** (CC BY-SA, ODbL) in a separate data file — acceptable, or use only
   CEFR-J and public-domain lists (weaker frequency data)?

Before R6:

4. **TTS provider** — Azure (recommended) or Google Chirp 3 HD after hearing both, or another.
5. **Audio storage** — Cloudflare R2 (recommended; needs an account, a card and the domain on
   Cloudflare) or Vercel Blob.
6. **Accents and voices** — en-US and en-GB, one voice each, or more.

## Final checklist before the module is switched on

- [ ] `pnpm reading:validate` passes on all 120 texts; the owner has read the flagged ones.
- [ ] Every data source is in `docs/LICENSES.md` and on the Credits page.
- [ ] A text opens, tints, saves a word and runs its quiz with the network off.
- [ ] An older build of the app still syncs after a word with `Example.text` was saved.
- [ ] Audio plays on iOS Safari and Android Chrome; a jump to a sentence lands on its first word.
- [ ] `/privacy` and `docs/DATA_MAP.md` name the audio host and the reading record.
