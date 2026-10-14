// Storage layout and migrations. The same migration chain upgrades data already in
// localStorage on startup and data coming from an imported export file.

export const SCHEMA_VERSION = 1;

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

/** Append-only. Example: { to: 2, migrate: (d) => ({ ...d, settings: addField(d.settings) }) } */
export const MIGRATIONS: readonly Migration[] = [];

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
