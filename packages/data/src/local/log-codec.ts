// Review events are the bulk of stored data, so they are kept as positional tuples:
// roughly 3× smaller than objects with repeated property names.
import { REVIEW_FORMATS, TEST_FORMATS, isGrade, type ReviewEvent } from '@vocabix/core';

const FORMATS = [...REVIEW_FORMATS, ...TEST_FORMATS] as const;

export type PackedEvent = [
  id: string,
  wordId: string,
  at: number,
  grade: number,
  format: number,
  responseMs: number,
  retention: number,
  xp: number,
  wasNew: 0 | 1,
];

export function packEvent(e: ReviewEvent): PackedEvent {
  return [
    e.id,
    e.wordId,
    e.at,
    e.grade,
    FORMATS.indexOf(e.format),
    e.responseMs,
    e.retention,
    e.xp,
    e.wasNew ? 1 : 0,
  ];
}

export function unpackEvent(p: PackedEvent): ReviewEvent {
  const [id, wordId, at, grade, format, responseMs, retention, xp, wasNew] = p;
  const fmt = FORMATS[format];
  if (!isGrade(grade) || !fmt) throw new Error(`Corrupted review event ${id}`);
  return { id, wordId, at, grade, format: fmt, responseMs, retention, xp, wasNew: wasNew === 1 };
}
