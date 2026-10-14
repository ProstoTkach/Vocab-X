// First-run setup and deck import, shared by the onboarding flow and the deck library.
import type { SchedulerParams } from './config/params';
import type { LangCode } from './language';
import type { Deck, Id, Profile, StudySettings, Word } from './model';
import { markKnown } from './placement';
import type { Repos } from './repos';

export type DailyGoalPreset = 'light' | 'regular' | 'intense';

/** Daily pace presets offered during onboarding; fine-tuned later in settings. */
export const DAILY_GOAL_PRESETS: Record<
  DailyGoalPreset,
  Pick<StudySettings, 'newPerDay' | 'dailyGoalXp'>
> = {
  light: { newPerDay: 5, dailyGoalXp: 20 },
  regular: { newPerDay: 10, dailyGoalXp: 50 },
  intense: { newPerDay: 20, dailyGoalXp: 100 },
};

interface Ctx {
  now: number;
  newId: () => string;
}

/** Copies a built-in deck into the learner's own decks (words stay shared, read-only). */
export async function importBuiltinDeck(
  repos: Pick<Repos, 'decks'>,
  builtin: Deck,
  uiLocale: LangCode,
  ctx: Ctx,
): Promise<Deck> {
  const deck: Deck = {
    id: ctx.newId(),
    title: builtin.titleI18n?.[uiLocale] ?? builtin.title,
    ...(builtin.cefr ? { cefr: builtin.cefr } : {}),
    lang: builtin.lang,
    wordIds: [...builtin.wordIds],
    origin: 'own',
    builtinId: builtin.id,
    archived: false,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await repos.decks.save(deck);
  return deck;
}

export interface OnboardingChoices {
  uiLocale: LangCode;
  nativeLang: LangCode;
  targetLangs: LangCode[];
  goal: DailyGoalPreset;
  themeId: string;
  builtinDeckIds: Id[];
  /** Words marked "I know it" in the level check. */
  knownWords: Word[];
}

export async function completeOnboarding(
  repos: Pick<Repos, 'profile' | 'settings' | 'decks' | 'progress' | 'reviewLog'>,
  c: OnboardingChoices,
  ctx: Ctx & { params: SchedulerParams },
): Promise<Profile> {
  const settings = await repos.settings.update({
    themeId: c.themeId,
    study: DAILY_GOAL_PRESETS[c.goal],
  });
  for (const id of c.builtinDeckIds) {
    const builtin = await repos.decks.get(id);
    if (builtin?.origin === 'builtin') await importBuiltinDeck(repos, builtin, c.uiLocale, ctx);
  }
  await markKnown(repos, c.knownWords, { ...ctx, retention: settings.study.retention });
  const profile: Profile = {
    id: ctx.newId(),
    displayName: '',
    uiLocale: c.uiLocale,
    nativeLang: c.nativeLang,
    targetLangs: c.targetLangs,
    activeTargetLang: c.targetLangs[0]!,
    // Saved last: a profile with onboardedAt marks setup as complete, so an interrupted
    // setup simply starts over.
    onboardedAt: ctx.now,
    createdAt: ctx.now,
  };
  await repos.profile.save(profile);
  return profile;
}
