// Format renderers by exercise format. The session shell looks renderers up here and never
// branches on the format itself; test formats (CLZ, MCQ, MAT, LIS) are added here in A6.
import {
  formatForLevel,
  type ExerciseFormat,
  type ReviewFormat,
  type StudyCard,
} from '@vocabx/core';
import { format1 } from './format1-recognition';
import { format2 } from './format2-recall';
import { format3 } from './format3-partial-audio';
import { format4 } from './format4-audio';
import type { FormatRenderer } from './types';

const RENDERERS = new Map<ExerciseFormat, FormatRenderer>(
  [format1, format2, format3, format4].map((r) => [r.format, r]),
);

export function rendererFor(format: ExerciseFormat): FormatRenderer {
  const r = RENDERERS.get(format);
  if (!r) throw new Error(`No renderer for format ${format}`);
  return r;
}

/** Format of a review card: its current level (new cards start at recognition). */
export function formatOf(card: StudyCard): ReviewFormat {
  return formatForLevel(card.progress?.card.level ?? 1);
}
