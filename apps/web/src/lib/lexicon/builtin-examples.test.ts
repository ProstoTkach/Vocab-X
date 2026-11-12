import { builtinCatalog } from '@vocabx/content';
import { exampleSchema, mergeExamples, MAX_EXAMPLES, type Example } from '@vocabx/core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { deckFileOf } from './builtin-examples';

const DIR = fileURLToPath(new URL('../../../../../public/examples/', import.meta.url));
const fileSchema = z.object({
  v: z.literal(1),
  words: z.record(z.string(), z.array(exampleSchema)),
});

describe('static examples of the built-in words', () => {
  test('every built-in word has a deck file to look in', () => {
    for (const w of builtinCatalog().words) expect(deckFileOf(w.id), w.id).toBeTruthy();
  });

  test.runIf(existsSync(DIR))(
    'the files hold sentences with the word, with a credit, within the limit',
    () => {
      const words = new Map(builtinCatalog().words.map((w) => [w.id, w]));
      const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        const parsed = fileSchema.parse(JSON.parse(readFileSync(DIR + f, 'utf8')));
        for (const [id, list] of Object.entries(parsed.words as Record<string, Example[]>)) {
          const w = words.get(id);
          expect(w, `${f}: ${id}`).toBeDefined();
          // Nothing is dropped when merged: they all hold the word, none repeats, room is left.
          expect(mergeExamples(w!, w!.examples, list), `${f}: ${id}`).toHaveLength(
            w!.examples.length + list.length,
          );
          expect(w!.examples.length + list.length).toBeLessThanOrEqual(MAX_EXAMPLES);
          for (const e of list) {
            expect(e.credit?.by, `${f}: ${e.text}`).toBeTruthy();
            expect(e.credit?.license).toMatch(/^CC/);
          }
        }
      }
    },
  );
});
