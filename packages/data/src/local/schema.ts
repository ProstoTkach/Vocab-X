// Storage layout and migrations. The same migration chain upgrades data already in
// localStorage on startup and data coming from an imported export file.

export const SCHEMA_VERSION = 2;

/** Key names (without prefix). Progress is split per language to keep each write small. */
export const KEYS = {
  meta: 'meta',
  profile: 'profile',
  settings: 'settings',
  decks: 'decks',
  words: 'words',
  progress: (lang: string) => `progress:${lang}`,
  log: 'log',
  stats: 'stats',
  gamification: 'gamification',
} as const;

export interface Meta {
  schemaVersion: number;
}

/** All own keys and their parsed values, as stored and as exported. */
export type RawData = Record<string, unknown>;

export interface Migration {
  /** Version this migration produces; it runs on data at version `to − 1`. */
  to: number;
  migrate(data: RawData): RawData;
}

/**
 * v2: three format levels instead of four, and listening now comes before recall. Old level 2
 * (recall) becomes 3, old 3 (audio + letters) becomes 2, old 4 (audio only) becomes 3.
 */
const LEVEL_V1_TO_V2: Record<number, number> = { 1: 1, 2: 3, 3: 2, 4: 3 };

function remapLevels(progress: unknown): unknown {
  if (typeof progress !== 'object' || progress === null) return progress;
  return Object.fromEntries(
    Object.entries(progress).map(([id, p]) => {
      const card = (p as { card?: { level?: number } } | null)?.card;
      if (!card || typeof card.level !== 'number') return [id, p];
      const level = LEVEL_V1_TO_V2[card.level] ?? card.level;
      return [id, { ...(p as object), card: { ...card, level, levelStreak: 0 } }];
    }),
  );
}

/** Append-only. Example: { to: 3, migrate: (d) => ({ ...d, settings: addField(d.settings) }) } */
export const MIGRATIONS: readonly Migration[] = [
  {
    to: 2,
    migrate: (d) =>
      Object.fromEntries(
        Object.entries(d).map(([k, v]) => [k, k.startsWith('progress:') ? remapLevels(v) : v]),
      ),
  },
];

export function migrate(
  data: RawData,
  from: number,
  migrations: readonly Migration[] = MIGRATIONS,
  target = SCHEMA_VERSION,
): RawData {
  let out = data;
  for (let v = from + 1; v <= target; v++) {
    const m = migrations.find((x) => x.to === v);
    if (!m) throw new Error(`Missing migration to schema v${v}`);
    out = m.migrate(out);
  }
  return out;
}
