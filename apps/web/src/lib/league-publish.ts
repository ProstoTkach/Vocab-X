// Tells the others what the learner looks like now, as soon as it changes: not only when the
// learner next opens the league. Costs nothing for someone not taking part.
import type { AvatarFrame, PublishedLook } from '@vocabx/core';
import type { LocalStorageRepo } from '@vocabx/data';
import { readLeagueCache, writeLeagueCache } from './league-cache';

export async function publishLeagueShown(
  repos: LocalStorageRepo,
  look: PublishedLook,
  frame: AvatarFrame,
): Promise<void> {
  const { leagueJoined } = await repos.settings.get();
  if (!leagueJoined) return;
  const cache = readLeagueCache(repos.journal.owner);
  if (!cache) return;
  const profile = await repos.profile.get();
  const shown = { name: profile?.displayName ?? '', look, frame };
  const text = JSON.stringify(shown);
  if (text === cache.shown) return;
  try {
    const res = await fetch('/api/league', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ join: false, shown, scoresOf: cache.standing.week }),
    });
    // Not told: the next time the league opens, it tries again.
    if (res.ok) writeLeagueCache({ ...cache, shown: text });
  } catch {
    // Offline: the same.
  }
}
