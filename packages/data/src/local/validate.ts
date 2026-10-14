// Validates a whole data snapshot (an imported file) key by key against the storage layout.
import {
  cardProgressSchema,
  dailyStatsSchema,
  deckSchema,
  gamificationSchema,
  ImportError,
  profileSchema,
  settingsPatchSchema,
  wordSchema,
} from '@vocabx/core';
import { z } from 'zod';
import { KEYS, type RawData } from './schema';

const packedEventSchema = z.tuple(
  [
    z.string().min(1),
    z.string().min(1),
    z.number().nonnegative(),
    z.number().int().min(1).max(4),
    z.number().int().min(0).max(7),
    z.number().nonnegative(),
    z.number().min(0).max(1),
    z.number().int(),
    z.union([z.literal(0), z.literal(1)]),
  ],
  z.literal(1),
);

const FIXED: Record<string, z.ZodType> = {
  [KEYS.profile]: profileSchema,
  [KEYS.settings]: settingsPatchSchema,
  [KEYS.decks]: z.record(z.string(), deckSchema),
  [KEYS.words]: z.record(z.string(), wordSchema),
  [KEYS.log]: z.array(packedEventSchema),
  [KEYS.stats]: z.record(z.string(), dailyStatsSchema),
  [KEYS.gamification]: gamificationSchema.partial(),
};
const PROGRESS = /^progress:[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function schemaFor(key: string): z.ZodType | undefined {
  if (key in FIXED) return FIXED[key];
  if (PROGRESS.test(key)) return z.record(z.string(), cardProgressSchema);
  return undefined;
}

/** Returns parsed data (unknown fields stripped) or throws ImportError('invalid_data'). */
export function validateData(data: RawData): RawData {
  const out: RawData = {};
  for (const [key, value] of Object.entries(data)) {
    const schema = schemaFor(key);
    if (!schema) throw new ImportError('invalid_data', `Unknown section "${key}"`);
    const result = schema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = [key, ...(issue?.path ?? [])].join('.');
      throw new ImportError('invalid_data', `Invalid ${path}: ${issue?.message ?? 'bad value'}`);
    }
    out[key] = result.data;
  }
  return out;
}
