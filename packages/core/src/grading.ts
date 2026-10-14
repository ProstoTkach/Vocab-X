// Automatic grading of a typed answer (recall formats).
import type { GradingParams } from './config/params';
import type { LanguageAdapter } from './language';
import { conf } from './text/similarity';
import type { Grade } from './types';

export type AnswerVerdict = 'exact' | 'near' | 'wrong';

export interface TypedAnswerResult {
  grade: Grade;
  verdict: AnswerVerdict;
  /** Best similarity in [0, 1] across accepted answers. */
  similarity: number;
  /** The accepted answer closest to the input, for feedback. */
  closest: string | null;
}

export interface TypedAnswerInput {
  input: string;
  /** All forms that count as correct (word and its accepted variants). */
  accepted: readonly string[];
  responseMs: number;
  adapter: LanguageAdapter;
  params: GradingParams;
}

/** τ_fast grows with word length: typing a long word takes longer. */
export function fastThresholdMs(answer: string, p: GradingParams): number {
  return p.tauFastBaseMs + p.tauFastPerCharMs * Array.from(answer).length;
}

/**
 * exact match → 4 if faster than τ_fast, else 3;
 * near match (only diacritics differ, or similarity ≥ s_h) → 2;
 * otherwise → 1.
 */
export function gradeTypedAnswer({
  input,
  accepted,
  responseMs,
  adapter,
  params,
}: TypedAnswerInput): TypedAnswerResult {
  const strictInput = adapter.normalize(input);
  if (!strictInput || accepted.length === 0) {
    return { grade: 1, verdict: 'wrong', similarity: 0, closest: accepted[0] ?? null };
  }
  const foldedInput = adapter.fold(input);

  let best = { similarity: -1, closest: accepted[0]!, exact: false };
  for (const answer of accepted) {
    const exact = adapter.normalize(answer) === strictInput;
    // Similarity is measured on folded text: a missing accent is a typo, not a wrong word.
    const similarity = exact ? 1 : conf(foldedInput, adapter.fold(answer));
    if (exact || similarity > best.similarity) best = { similarity, closest: answer, exact };
    if (exact) break;
  }

  if (best.exact) {
    const fast = responseMs < fastThresholdMs(best.closest, params);
    return { grade: fast ? 4 : 3, verdict: 'exact', similarity: 1, closest: best.closest };
  }
  // A folded similarity of 1 means only diacritics/variants differ: always "near".
  if (best.similarity >= params.similarityHard) {
    return { grade: 2, verdict: 'near', similarity: best.similarity, closest: best.closest };
  }
  return { grade: 1, verdict: 'wrong', similarity: best.similarity, closest: best.closest };
}
