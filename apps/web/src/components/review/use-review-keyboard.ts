'use client';

import type { Grade } from '@vocabx/core';
import { useEffect } from 'react';
import type { TypedAnswer } from './formats/types';
import { isTextInput, toTwoGrades, type QuizResult } from './session-model';
import { ARROW_DIRS, gradeForDirection, type PhysicalDir, type SwipeOptions } from './swipe';

interface ReviewKeyboard {
  /** A window (a tip, the first-visit instructions, feedback) is open: the keys are left alone. */
  blocked: boolean;
  /** The test or the sentences are on, not flash cards. */
  quiz: boolean;
  quizResult: QuizResult | null;
  optionCount: number;
  typed: TypedAnswer | null;
  swipe: SwipeOptions;
  grades: readonly Grade[];
  onUndo: () => void;
  onPick: (index: number) => void;
  onNext: () => void;
  onFlip: () => void;
  onGrade: (g: Grade, dir: PhysicalDir | undefined) => void;
}

/**
 * Keyboard: Space/Enter flip (any number of times), 1–4 and arrows grade, Z undoes. The handler
 * is set again on every render, so it always sees the latest state.
 */
export function useReviewKeyboard(k: ReviewKeyboard) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || k.blocked) return;
      if (isTextInput(e.target)) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        k.onUndo();
        return;
      }
      // The test: 1–4 pick an option, Enter or Space goes on once it is answered.
      if (k.quiz) {
        // A focused button ("Next", an option) handles its own Enter and Space.
        const onButton =
          e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
        if (!k.quizResult && k.optionCount >= 2 && /^[1-4]$/.test(e.key)) {
          e.preventDefault();
          k.onPick(Number(e.key) - 1);
        } else if (k.quizResult && !onButton && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          k.onNext();
        }
        return;
      }
      if (e.key === ' ' || (e.key === 'Enter' && !k.typed)) {
        // Focused buttons and links handle their own activation.
        if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
        e.preventDefault();
        k.onFlip();
        return;
      }
      const dir = ARROW_DIRS[e.key];
      let g: Grade | null = dir ? gradeForDirection(dir, k.swipe) : null;
      if (/^[1-4]$/.test(e.key)) g = Number(e.key) as Grade;
      if (e.key === 'Enter' && k.typed) {
        g = k.swipe.twoGrades ? toTwoGrades(k.typed.result.grade) : k.typed.result.grade;
      }
      if (g && k.grades.includes(g)) {
        e.preventDefault();
        k.onGrade(g, dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}
