// Weekly leagues: groups of up to ten, the best go up a league, the worst go down. Whatever counts
// here is decided by the server: creditXp does not take a device's word for what an answer earned.
import { DEFAULT_RETENTION } from './config/params';
import {
  DEFAULT_EVENT_VALIDATION_PARAMS,
  DEFAULT_XP_PARAMS,
  type EventValidationParams,
  type XpParams,
} from './config/params';
import type { ReviewEvent } from './model';
import { xpFor } from './xp';

/** Leagues from the first to the top one. */
export const LEAGUE_TIERS = [
  'copper',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'emerald',
  'diamond',
] as const;
export type LeagueTierId = (typeof LEAGUE_TIERS)[number];
export const TOP_TIER = LEAGUE_TIERS.length - 1;

export const LEAGUE_GROUP_SIZE = 10;
/** With fewer people nobody moves: the league waits for rivals. */
export const LEAGUE_MIN_SIZE = 4;
/** The share of a group that goes up, and the same that goes down. */
const ZONE_SHARE = 0.3;

const DAY_MS = 86_400_000;

/** Places that go up and places that go down: 1 and 1 of 4, 3 and 3 of 10. */
export function leagueZones(size: number, tier: number): { up: number; down: number } {
  if (size < LEAGUE_MIN_SIZE) return { up: 0, down: 0 };
  const zone = Math.max(1, Math.floor(size * ZONE_SHARE));
  return { up: tier >= TOP_TIER ? 0 : zone, down: tier <= 0 ? 0 : zone };
}

/** The Monday (UTC) a league week starts on, as a date: the same for everyone in the world. */
export function leagueWeek(t: number): string {
  const day = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - day * DAY_MS).toISOString().slice(0, 10);
}

export const leagueWeekStart = (week: string) => Date.parse(`${week}T00:00:00Z`);
export const leagueWeekEnd = (week: string) => leagueWeekStart(week) + 7 * DAY_MS;
/** A race runs from Monday to Monday: someone who joins waits for the next one to start. */
export const leagueRaceStart = (joinedAt: number) => leagueWeekEnd(leagueWeek(joinedAt));

export interface LeagueRankable {
  xp: number;
  /** When the XP was reached: of two equal scores, the first to get there is ahead. */
  xpAt: number;
  id: string;
}

export function rankLeague<T extends LeagueRankable>(members: readonly T[]): T[] {
  return [...members].sort((a, b) => b.xp - a.xp || a.xpAt - b.xpAt || (a.id < b.id ? -1 : 1));
}

/** The league after a week: no XP, no way up. `rank` counts from 0. */
export function nextLeagueTier(tier: number, rank: number, size: number, xp: number): number {
  const { up, down } = leagueZones(size, tier);
  if (rank < up && xp > 0) return tier + 1;
  if (rank >= size - down) return tier - 1;
  return tier;
}

/** An answer already on the server, for what the new ones are counted against. */
export interface KnownAnswer {
  wordId: string;
  at: number;
}

export interface CreditContext {
  now: number;
  /** Answers before this moment do not count (the week's start, or joining). */
  since: number;
  known: readonly KnownAnswer[];
  rules?: EventValidationParams;
  xp?: XpParams;
}

const dayOf = (t: number) => Math.floor(t / DAY_MS);
const minuteOf = (t: number) => Math.floor(t / 60_000);

/**
 * What each new answer earns in the league, by id. A device can send anything, so an answer gets
 * no more than the most its grade and format can give at that point of the day, and nothing if it
 * is implausible: from the future, too fast, one of too many in a minute or a day, or one more for a word
 * already rewarded that day. The daily decay also makes every day's total finite.
 *
 * Days are UTC here, so around a learner's midnight this can come out a little lower than the XP
 * their device shows; never higher.
 */
export function creditXp(events: readonly ReviewEvent[], c: CreditContext): Map<string, number> {
  const rules = c.rules ?? DEFAULT_EVENT_VALIDATION_PARAMS;
  const params = c.xp ?? DEFAULT_XP_PARAMS;
  const perDay = new Map<number, number>();
  const perMinute = new Map<number, number>();
  const perWord = new Map<string, number>();
  const count = <K>(map: Map<K, number>, key: K) => {
    const n = map.get(key) ?? 0;
    map.set(key, n + 1);
    return n;
  };
  const wordKey = (a: KnownAnswer) => `${dayOf(a.at)}/${a.wordId}`;
  for (const a of c.known) {
    count(perDay, dayOf(a.at));
    count(perMinute, minuteOf(a.at));
    count(perWord, wordKey(a));
  }

  const credits = new Map<string, number>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    // Every answer is counted, whether or not it earns: otherwise skipping some would pay.
    const nDay = count(perDay, dayOf(e.at));
    const nMinute = count(perMinute, minuteOf(e.at));
    const nWord = count(perWord, wordKey(e));
    const plausible =
      e.kind !== 'placement' &&
      e.at >= c.since &&
      e.at <= c.now + rules.skewMs &&
      e.responseMs >= (rules.minResponseMs[e.format] ?? rules.defaultMinResponseMs) &&
      nMinute < rules.maxEventsPerMinute &&
      nDay < rules.maxEventsPerDay &&
      nWord < params.maxAwardsPerCardPerDay;
    const most = plausible ? xpFor(e.grade, e.format, null, nDay, DEFAULT_RETENTION, params) : 0;
    credits.set(e.id, Math.max(0, Math.min(e.xp, most)));
  }
  return credits;
}

/** What a learner's character looks like to the others: ids only, drawn by each device. */
export interface PublishedLook {
  avatar: string;
  worn: string[];
  accessories: string[];
}

/** Light fills, in the order of the spectrum; both sets are always on offer. */
export const FRAME_FILLS_LIGHT = [
  'rose',
  'coral',
  'beige',
  'sun',
  'mint',
  'sky',
  'violet',
] as const;
/** Dark fills, in the same order. */
export const FRAME_FILLS_DARK = ['wine', 'rust', 'moss', 'pine', 'lake', 'dusk', 'plum'] as const;
/** Colours of the ring: strong enough for either theme. */
export const FRAME_RING_COLORS = ['red', 'dog', 'gold', 'leaf', 'aqua', 'azure', 'iris'] as const;
/** Earlier colours, no longer offered: a frame already chosen keeps working. */
const FRAME_OLD_COLORS = ['gray', 'forest', 'slate', 'cream', 'night'] as const;

export const FRAME_COLORS = [
  ...FRAME_FILLS_LIGHT,
  ...FRAME_FILLS_DARK,
  ...FRAME_RING_COLORS,
  ...FRAME_OLD_COLORS,
] as const;
export type FrameColor = (typeof FRAME_COLORS)[number];

/** Fills of the circle that open together with a theme. */
export const FRAME_GRADIENTS = ['dawn', 'mist', 'ocean', 'lagoon', 'sunset', 'ember'] as const;
export type FrameGradient = (typeof FRAME_GRADIENTS)[number];

export const FRAME_FILLS = [...FRAME_COLORS, ...FRAME_GRADIENTS] as const;
export type FrameFill = FrameColor | FrameGradient;

/** Rings earned in the league: one per league, open from that league on. */
export const FRAME_LEAGUE_RINGS = LEAGUE_TIERS.map((tier) => `league-${tier}` as const);
export type FrameLeagueRing = (typeof FRAME_LEAGUE_RINGS)[number];
export type FrameRing = FrameColor | FrameLeagueRing;
export const FRAME_RINGS: readonly FrameRing[] = [...FRAME_COLORS, ...FRAME_LEAGUE_RINGS];

/** The league a ring needs; -1 for one anybody can wear. */
export const ringLeague = (ring: FrameRing) => FRAME_LEAGUE_RINGS.indexOf(ring as FrameLeagueRing);

/** The faces a character can show: the same three for every character. */
export const FRAME_MOODS = ['joy', 'calm', 'sad'] as const;
export type FrameMood = (typeof FRAME_MOODS)[number];

export interface AvatarFrame {
  bg: FrameFill;
  ring: FrameRing;
  /** Unset: the smiling one. */
  mood?: FrameMood | undefined;
}

/** Until the learner chooses: the ring in the colour of the dog, on a light beige. */
export const DEFAULT_FRAME: AvatarFrame = { bg: 'beige', ring: 'dog' };
/** The same in a dark theme, on a fill a little lighter than its surfaces. */
export const DEFAULT_FRAME_DARK: AvatarFrame = { bg: 'dusk', ring: 'dog' };

export interface LeagueMemberView {
  /** The same person all week, and not a way to find out who it is. */
  key: string;
  /** Changes when their name, character or frame does: time to ask for them again. */
  tag: string;
  /** Place, from 1. */
  rank: number;
  name: string;
  look: PublishedLook;
  frame: AvatarFrame;
  xp: number;
  me: boolean;
}

/** A week's places alone: for a group already known, far less than names and characters. */
export interface LeagueScores {
  week: string;
  /** In order of place. */
  list: { key: string; xp: number; tag: string }[];
}

export interface LeagueResult {
  week: string;
  rank: number;
  from: number;
  to: number;
}

export interface LeagueStanding {
  tier: number;
  week: string;
  /** When the week ends, ms. */
  endsAt: number;
  members: LeagueMemberView[];
  /** Last week's outcome, when there was one. */
  result: LeagueResult | null;
}
