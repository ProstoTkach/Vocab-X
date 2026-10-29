import type { ReviewEvent } from '@vocabx/core';
import { describe, expect, test } from 'vitest';
import { packEvent, unpackEvent } from './log-codec';

const event: ReviewEvent = {
  id: 'e1',
  wordId: 'w1',
  at: 1000,
  grade: 3,
  format: 'MCQ_TR',
  responseMs: 1500,
  wasNew: false,
  retention: 0.9,
  xp: 10,
};

describe('log codec', () => {
  test('an event comes back as it was, with its kind (placement, the mixed mode) or without', () => {
    for (const e of [
      event,
      { ...event, kind: 'placement' as const },
      { ...event, kind: 'mixed' as const },
    ])
      expect(unpackEvent(packEvent(e))).toEqual(e);
  });
});
