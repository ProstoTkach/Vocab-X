import { describe, expect, test } from 'vitest';
import {
  directionForGrade,
  directionFromDrag,
  gradeForDirection,
  type SwipeOptions,
} from './swipe';

const ltr: SwipeOptions = { rtl: false, mirrored: false, twoGrades: false };

describe('gradeForDirection', () => {
  test('default LTR: ← Again, ↓ Hard, → Good, ↑ Easy', () => {
    expect(gradeForDirection('left', ltr)).toBe(1);
    expect(gradeForDirection('down', ltr)).toBe(2);
    expect(gradeForDirection('right', ltr)).toBe(3);
    expect(gradeForDirection('up', ltr)).toBe(4);
  });
  test('RTL mirrors left and right only', () => {
    const rtl = { ...ltr, rtl: true };
    expect(gradeForDirection('right', rtl)).toBe(1);
    expect(gradeForDirection('left', rtl)).toBe(3);
    expect(gradeForDirection('up', rtl)).toBe(4);
  });
  test('the mirrored layout flips again (RTL + mirrored = LTR)', () => {
    expect(gradeForDirection('right', { ...ltr, mirrored: true })).toBe(1);
    expect(gradeForDirection('left', { ...ltr, rtl: true, mirrored: true })).toBe(1);
  });
  test('two-grade mode disables up and down', () => {
    const two = { ...ltr, twoGrades: true };
    expect(gradeForDirection('up', two)).toBeNull();
    expect(gradeForDirection('down', two)).toBeNull();
    expect(gradeForDirection('left', two)).toBe(1);
    expect(directionForGrade(4, two)).toBeNull();
  });
  test('directionForGrade is the inverse', () => {
    for (const g of [1, 2, 3, 4] as const) {
      const d = directionForGrade(g, ltr)!;
      expect(gradeForDirection(d, ltr)).toBe(g);
    }
  });
});

describe('directionFromDrag', () => {
  test('short and slow is a tap', () => {
    expect(directionFromDrag({ x: 30, y: 5 }, { x: 100, y: 0 })).toBeNull();
  });
  test('dominant axis decides', () => {
    expect(directionFromDrag({ x: -120, y: 40 }, { x: 0, y: 0 })).toBe('left');
    expect(directionFromDrag({ x: 20, y: -150 }, { x: 0, y: 0 })).toBe('up');
  });
  test('a quick flick counts', () => {
    expect(directionFromDrag({ x: 40, y: 0 }, { x: 900, y: 0 })).toBe('right');
  });
});
