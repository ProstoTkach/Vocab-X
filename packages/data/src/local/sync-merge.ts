// How two copies of the same thing become one, when both browsers changed it before they talked.
// Every rule gives the same answer on every device, and none of them loses an answer or a word.
import type { AppSettings, Deck, GamificationState, Profile } from '@vocabx/core';

/** Settings without those of one browser (the developer's tools and time travel), never sent. */
export function sharedSettings(settings: AppSettings): Partial<AppSettings> {
  const {
    timeOffsetMs: _offset,
    devTools: _tools,
    devUnlocked: _unlocked,
    xpBonus: _bonus,
    ...shared
  } = settings;
  return shared;
}

/** The learner's own choices on this device stay; what is known about them adds up. */
export function mergeProfile(local: Profile, remote: Profile): Profile {
  const onboarded = [local.onboardedAt, remote.onboardedAt].filter((t) => t !== null);
  return {
    ...local,
    id: remote.id,
    displayName: local.displayName.trim() ? local.displayName : remote.displayName,
    targetLangs: [...new Set([...local.targetLangs, ...remote.targetLangs])],
    onboardedAt: onboarded.length ? Math.min(...onboarded) : null,
    createdAt: Math.min(local.createdAt, remote.createdAt),
  };
}

/** What was earned or opened on either device stays; what is worn is this device's choice. */
export function mergeGamification(
  local: GamificationState,
  remote: GamificationState,
): GamificationState {
  const achievements = { ...remote.achievements };
  for (const [id, at] of Object.entries(local.achievements))
    achievements[id] = Math.min(at, achievements[id] ?? at);
  return {
    ...local,
    achievements,
    inventory: [...new Set([...local.inventory, ...remote.inventory])],
    wardrobeSeen: [...new Set([...local.wardrobeSeen, ...remote.wardrobeSeen])],
    ...(local.avatarFrame || remote.avatarFrame
      ? { avatarFrame: (local.avatarFrame ?? remote.avatarFrame)! }
      : {}),
  };
}

/** The newer deck, with the words of both: a word removed may return, but none is lost. */
export function mergeDeck(local: Deck, remote: Deck): Deck {
  const [newer, older] = local.updatedAt >= remote.updatedAt ? [local, remote] : [remote, local];
  return { ...newer, wordIds: [...new Set([...newer.wordIds, ...older.wordIds])] };
}

/** Decks there must be one of, made separately on each device before they met. */
const singleKey = (d: Deck): string | null =>
  d.personal
    ? `${d.lang}:personal`
    : d.learned
      ? `${d.lang}:learned`
      : d.builtinId
        ? `builtin:${d.builtinId}`
        : null;

/**
 * One deck per key: the oldest one stays (so every device picks the same) with the words of the
 * others, which go away. Returns the decks to save and the ids to delete.
 */
export function joinDuplicateDecks(decks: readonly Deck[]): { save: Deck[]; remove: string[] } {
  const groups = new Map<string, Deck[]>();
  for (const deck of decks) {
    const key = singleKey(deck);
    if (key) groups.set(key, [...(groups.get(key) ?? []), deck]);
  }
  const save: Deck[] = [];
  const remove: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = [...group].sort(
      (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1),
    ) as [Deck, ...Deck[]];
    const wordIds = [...new Set(group.flatMap((d) => d.wordIds))];
    const skipped = [...new Set(group.flatMap((d) => d.skippedIds ?? []))].filter(
      (id) => !wordIds.includes(id),
    );
    const { pickSummary: _summary, skippedIds: _skipped, ...kept } = first;
    save.push({
      ...kept,
      wordIds,
      ...(skipped.length ? { skippedIds: skipped } : {}),
      updatedAt: Math.max(...group.map((d) => d.updatedAt)),
    });
    remove.push(...rest.map((d) => d.id));
  }
  return { save, remove };
}
