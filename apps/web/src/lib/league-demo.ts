// Ten made-up learners for the developer panel: how the league looks with a full group, on this
// device only. Nothing here goes to the server. The fourth place is the learner's own character.
import type { AvatarFrame, LeagueMemberView, LeagueStanding, PublishedLook } from '@vocabx/core';

const look = (avatar: string, worn: string[] = [], accessories: string[] = []): PublishedLook => ({
  avatar,
  worn,
  accessories,
});

const OTHERS: readonly Omit<LeagueMemberView, 'rank' | 'me' | 'key' | 'tag'>[] = [
  {
    name: 'Олена',
    xp: 512,
    look: look('dog', ['tshirt_green', 'jeans', 'boots_red'], ['glasses_black']),
    frame: { bg: 'sunset', ring: 'league-diamond', mood: 'joy' },
  },
  {
    name: 'Андрій',
    xp: 468,
    look: look('wolf', ['tshirt_blue', 'jeans_black', 'boots_blue']),
    frame: { bg: 'ocean', ring: 'league-gold', mood: 'joy' },
  },
  {
    name: 'Марія',
    xp: 431,
    look: look('dog', ['tshirt_blue', 'jeans'], ['clock']),
    frame: { bg: 'rose', ring: 'iris', mood: 'calm' },
  },
  {
    name: 'Тарас',
    xp: 287,
    look: look('wolf'),
    frame: { bg: 'dusk', ring: 'dog', mood: 'calm' },
  },
  {
    name: 'Ірина',
    xp: 254,
    look: look('dog', [], ['glasses_black']),
    frame: { bg: 'beige', ring: 'league-emerald', mood: 'joy' },
  },
  {
    name: 'Богдан',
    xp: 193,
    look: look('wolf', ['tshirt_green']),
    frame: { bg: 'lagoon', ring: 'league-silver', mood: 'joy' },
  },
  {
    name: 'Дуже довге імʼя учасника цього рейтингу',
    xp: 121,
    look: look('dog'),
    frame: { bg: 'mint', ring: 'leaf', mood: 'sad' },
  },
  {
    name: '',
    xp: 64,
    look: look('wolf'),
    frame: { bg: 'ember', ring: 'league-copper', mood: 'sad' },
  },
  {
    name: 'Назар',
    xp: 0,
    look: look('dog'),
    frame: { bg: 'dawn', ring: 'azure', mood: 'calm' },
  },
];

const DAY_MS = 86_400_000;

export function demoStanding(
  me: { name: string; look: PublishedLook; frame: AvatarFrame },
  now: number,
): LeagueStanding {
  const week = '2026-01-05';
  const members = [...OTHERS.slice(0, 3), { ...me, xp: 340 }, ...OTHERS.slice(3)];
  return {
    tier: 2,
    week,
    endsAt: now + 3 * DAY_MS,
    result: null,
    members: members.map((m, i) => ({
      ...m,
      key: `demo${i}`,
      tag: 'demo',
      rank: i + 1,
      me: i === 3,
    })),
  };
}
