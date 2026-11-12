// Example sentences of the built-in words, collected once by scripts/fetch-examples.ts and shipped
// as one static file per deck (/examples/<deck>.json), loaded when a review needs them. The app
// asks no third party for these words.
import { exampleSchema, type Example, type Word } from '@vocabx/core';
import { builtinCatalog } from '@vocabx/content';
import { z } from 'zod';

const fileSchema = z.object({
  v: z.literal(1),
  words: z.record(z.string(), z.array(exampleSchema)),
});

/** The first deck that holds each built-in word: its examples are in that deck's file. */
let deckOfWord: Map<string, string> | undefined;
export function deckFileOf(wordId: string): string | undefined {
  if (!deckOfWord) {
    deckOfWord = new Map();
    for (const d of builtinCatalog().decks)
      for (const id of d.wordIds)
        if (!deckOfWord.has(id)) deckOfWord.set(id, d.id.replace(/^builtin:/, ''));
  }
  return deckOfWord.get(wordId);
}

const files = new Map<string, Promise<Record<string, Example[]> | null>>();

async function loadFile(slug: string, signal?: AbortSignal) {
  try {
    const res = await fetch(`/examples/${slug}.json`, signal ? { signal } : {});
    if (!res.ok) return null;
    const parsed = fileSchema.safeParse(await res.json());
    return parsed.success ? (parsed.data.words as Record<string, Example[]>) : null;
  } catch {
    return null;
  }
}

/** The sentences found for a built-in word; none when it has none or the file cannot be read. */
export async function builtinExamplesOf(
  word: Pick<Word, 'id' | 'source'>,
  signal?: AbortSignal,
): Promise<Example[]> {
  if (word.source !== 'builtin') return [];
  const slug = deckFileOf(word.id);
  if (!slug) return [];
  const file = files.get(slug) ?? loadFile(slug, signal);
  files.set(slug, file);
  const words = await file;
  // A failed or aborted read is tried again next time, not remembered.
  if (!words) files.delete(slug);
  return words?.[word.id] ?? [];
}
