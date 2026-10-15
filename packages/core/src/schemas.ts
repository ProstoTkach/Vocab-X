// Runtime schemas for data crossing a trust boundary: imported files now, sync payloads in
// phase B. They mirror model.ts; unknown fields are stripped.
import { z } from 'zod';

const id = z.string().min(1).max(200);
const lang = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);
const time = z.number().nonnegative();
const langMap = <T extends z.ZodType>(v: T) => z.record(lang, v);

export const cefrSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export const posSchema = z.enum([
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'interjection',
  'phrase',
  'other',
]);

export const exampleSchema = z.object({
  text: z.string().max(1000),
  translations: langMap(z.string().max(1000)).optional(),
});

export const wordSchema = z.object({
  id,
  lang,
  term: z.string().min(1).max(200),
  lemma: z.string().min(1).max(200),
  pos: posSchema.optional(),
  cefr: cefrSchema.optional(),
  translations: langMap(z.array(z.string().max(300)).max(20)),
  variants: z.array(z.string().max(200)).max(20).optional(),
  examples: z.array(exampleSchema).max(20),
  imageUrl: z.url().optional(),
  source: z.enum(['builtin', 'manual', 'public_deck', 'video', 'import']),
  video: z.object({ id: z.string().max(64), timeS: time }).optional(),
  createdAt: time,
  updatedAt: time,
});

export const deckSchema = z.object({
  id,
  title: z.string().max(200),
  titleI18n: langMap(z.string().max(200)).optional(),
  description: z.string().max(2000).optional(),
  descriptionI18n: langMap(z.string().max(2000)).optional(),
  cefr: cefrSchema.optional(),
  lang,
  wordIds: z.array(id).max(100_000),
  origin: z.enum(['own', 'builtin']),
  builtinId: id.optional(),
  personal: z.boolean().optional(),
  archived: z.boolean(),
  createdAt: time,
  updatedAt: time,
});

export const profileSchema = z.object({
  id,
  displayName: z.string().max(100),
  uiLocale: lang,
  nativeLang: lang,
  targetLangs: z.array(lang).min(1).max(20),
  activeTargetLang: lang,
  onboardedAt: time.nullable(),
  createdAt: time,
});

export const studySettingsSchema = z.object({
  retention: z.number().min(0.5).max(0.99),
  newPerDay: z.number().int().min(0).max(1000).nullable(),
  reviewsPerDay: z.number().int().min(0).max(10_000).nullable(),
  twoGrades: z.boolean(),
  typing: z.boolean(),
  autoSpeak: z.boolean(),
  animationSpeed: z.number().min(0).max(4),
  cardFontScale: z.number().min(0.5).max(3),
  swipeLayout: z.enum(['default', 'mirrored']),
  dailyGoalXp: z.number().int().min(1).max(10_000),
});

/** Stored settings are partial: missing fields fall back to defaults. */
export const settingsPatchSchema = z.object({
  themeId: z.string().max(64).optional(),
  study: studySettingsSchema.partial().optional(),
  timeOffsetMs: z.number().optional(),
  devTools: z.boolean().optional(),
});

export const cardStateSchema = z.object({
  stability: z.number().positive(),
  difficulty: z.number().min(1).max(10),
  lastReviewAt: time,
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  levelStreak: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
});

export const cardProgressSchema = z.object({
  wordId: id,
  lang,
  card: cardStateSchema,
  dueAt: time,
  lastEventId: id,
});

export const dailyStatsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reviews: z.number().int(),
  newCards: z.number().int(),
  correct: z.number().int(),
  xp: z.number().int(),
});

export const gamificationSchema = z.object({
  xpTotal: z.number().int().nonnegative(),
  streakDays: z.number().int().nonnegative(),
  streakFreezes: z.number().int().nonnegative(),
  lastGoalDate: z.string().nullable(),
  achievements: z.record(id, time),
  inventory: z.array(id),
  equipped: z.record(z.string(), id),
});
