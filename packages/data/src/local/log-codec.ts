// Review events are the bulk of stored data, so they are kept as positional tuples:
// roughly 3× smaller than objects with repeated property names.
import { ALL_FORMATS, isGrade, type ReviewEvent } from '@vocabx/core';

const FORMATS = ALL_FORMATS;

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
  /** Optional trailing flag: 1 = placement. Older tuples simply lack it. */
  placement?: 1,
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
    ...(e.kind === 'placement' ? ([1] as const) : []),
  ] as PackedEvent;
}

export function unpackEvent(p: PackedEvent): ReviewEvent {
  const [id, wordId, at, grade, format, responseMs, retention, xp, wasNew, placement] = p;
  const fmt = FORMATS[format];
  if (!isGrade(grade) || !fmt) throw new Error(`Corrupted review event ${id}`);
  return {
    id,
    wordId,
    at,
    grade,
    format: fmt,
    responseMs,
    retention,
    xp,
    wasNew: wasNew === 1,
    ...(placement === 1 ? { kind: 'placement' as const } : {}),
  };
}
