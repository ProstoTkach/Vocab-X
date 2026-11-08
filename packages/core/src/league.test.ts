import { describe, expect, test } from 'vitest';
import {
  creditXp,
  leagueRaceStart,
  leagueWeek,
  leagueWeekEnd,
  leagueZones,
  nextLeagueTier,
  rankLeague,
  TOP_TIER,
} from './league';
import type { ReviewEvent } from './model';

const T0 = Date.parse('2026-11-04T10:00:00Z');
let n = 0;
const answer = (o: Partial<ReviewEvent> = {}): ReviewEvent => ({
  id: `e${++n}`,
  wordId: `w${n}`,
  at: T0,
  grade: 3,
  format: 'REC',
  responseMs: 1500,
  wasNew: false,
  retention: 0.9,
  xp: 10,
  ...o,
});
const ctx = { now: T0 + 60_000, since: T0 - 1000, known: [] };

describe('zones', () => {
  test('nobody moves below four; one of four, three of ten', () => {
    expect(leagueZones(3, 2)).toEqual({ up: 0, down: 0 });
    expect(leagueZones(4, 2)).toEqual({ up: 1, down: 1 });
    expect(leagueZones(7, 2)).toEqual({ up: 2, down: 2 });
    expect(leagueZones(10, 2)).toEqual({ up: 3, down: 3 });
  });

  test('nothing above the top league or below the first', () => {
    expect(leagueZones(10, TOP_TIER).up).toBe(0);
    expect(leagueZones(10, 0).down).toBe(0);
  });
});

describe('the week', () => {
  test('starts on Monday in UTC, whatever the day', () => {
    expect(leagueWeek(Date.parse('2026-11-02T00:00:00Z'))).toBe('2026-11-02');
    expect(leagueWeek(Date.parse('2026-11-08T23:59:59Z'))).toBe('2026-11-02');
    expect(leagueWeek(Date.parse('2026-11-09T00:00:00Z'))).toBe('2026-11-09');
    expect(leagueWeekEnd('2026-11-02')).toBe(Date.parse('2026-11-09T00:00:00Z'));
  });

  test('whoever joins during a week races from the next Monday', () => {
    const monday = Date.parse('2026-11-09T00:00:00Z');
    expect(leagueRaceStart(Date.parse('2026-11-04T10:00:00Z'))).toBe(monday);
    expect(leagueRaceStart(Date.parse('2026-11-08T23:59:59Z'))).toBe(monday);
    expect(leagueRaceStart(monday)).toBe(Date.parse('2026-11-16T00:00:00Z'));
  });
});

describe('places', () => {
  test('more XP first; of equal scores the one who got there first', () => {
    const ranked = rankLeague([
      { id: 'late', xp: 50, xpAt: 20 },
      { id: 'top', xp: 90, xpAt: 30 },
      { id: 'early', xp: 50, xpAt: 10 },
    ]);
    expect(ranked.map((m) => m.id)).toEqual(['top', 'early', 'late']);
  });

  test('the top goes up, the bottom goes down, the middle stays', () => {
    expect(nextLeagueTier(2, 0, 10, 100)).toBe(3);
    expect(nextLeagueTier(2, 2, 10, 100)).toBe(3);
    expect(nextLeagueTier(2, 3, 10, 100)).toBe(2);
    expect(nextLeagueTier(2, 6, 10, 100)).toBe(2);
    expect(nextLeagueTier(2, 7, 10, 100)).toBe(1);
  });

  test('no XP, no way up, even alone at the top of a quiet group', () => {
    expect(nextLeagueTier(2, 0, 4, 0)).toBe(2);
  });

  test('a small group changes nothing', () => {
    expect(nextLeagueTier(2, 0, 3, 100)).toBe(2);
    expect(nextLeagueTier(2, 2, 3, 0)).toBe(2);
  });
});

describe('what an answer earns in the league', () => {
  const credit = (e: ReviewEvent, c: Partial<Parameters<typeof creditXp>[1]> = {}) =>
    creditXp([e], { ...ctx, ...c }).get(e.id);

  test('an honest answer gets what the device says', () => {
    expect(credit(answer({ xp: 10 }))).toBe(10);
  });

  test('a device that claims more gets only the most possible', () => {
    expect(credit(answer({ xp: 100_000 }))).toBe(10);
  });

  test('a claim below the limit stays as it is: a review too early earns little', () => {
    expect(credit(answer({ xp: 3 }))).toBe(3);
  });

  test('from the future, before joining, too fast, from the level check: nothing', () => {
    expect(credit(answer({ at: T0 + 3_600_000 }))).toBe(0);
    expect(credit(answer({ at: T0 - 5000 }))).toBe(0);
    expect(credit(answer({ responseMs: 50 }))).toBe(0);
    expect(credit(answer({ kind: 'placement' }))).toBe(0);
  });

  test('one word pays three times a day, however it is sent', () => {
    const repeats = [1, 2, 3, 4].map((i) => answer({ wordId: 'same', at: T0 + i * 10_000 }));
    const credits = creditXp(repeats, ctx);
    expect(repeats.map((e) => credits.get(e.id))).toEqual([10, 10, 10, 0]);
    const later = answer({ wordId: 'same', at: T0 + 50_000 });
    const known = repeats.slice(0, 3).map((e) => ({ wordId: e.wordId, at: e.at }));
    expect(credit(later, { known })).toBe(0);
    expect(
      credit(answer({ wordId: 'same', at: T0 + 86_400_000 }), { known, now: T0 + 90_000_000 }),
    ).toBe(10);
  });

  test('no more than forty answers a minute pay', () => {
    const burst = Array.from({ length: 50 }, () => answer({ at: T0 }));
    const credits = creditXp(burst, ctx);
    const paid = burst.filter((e) => (credits.get(e.id) ?? 0) > 0);
    expect(paid).toHaveLength(40);
  });

  test('a flood of answers fades, so a day cannot earn without end', () => {
    const known = Array.from({ length: 1000 }, (_, i) => ({ wordId: `old${i}`, at: T0 - 1000 }));
    expect(credit(answer({ xp: 10 }), { known })).toBe(0);
  });
});
