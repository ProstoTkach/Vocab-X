import { describe, expect, test } from 'vitest';
import { DEFAULT_EVENT_VALIDATION_PARAMS as vp, DEFAULT_SCHEDULER_PARAMS } from './config/params';
import { retrievability } from './scheduler';
import { REVIEW_FORMATS, TEST_FORMATS, type Grade } from './types';
import { phiR, psiD, validateEvent, xpFor, type RawEvent, type ValidationContext } from './xp';

describe('xp', () => {
  test('φ_R: 1 при R ≤ r_d, 0 при R = 1', () => {
    expect(phiR(0.9)).toBe(1);
    expect(phiR(0.5)).toBe(1);
    expect(phiR(1)).toBe(0);
  });
  test('φ_R для повторення через годину (S=1) ≈ 0,06', () => {
    const r = retrievability(1 / 24, 1, DEFAULT_SCHEDULER_PARAMS.w);
    expect(Math.abs(phiR(r) - 0.062)).toBeLessThan(0.002);
  });
  test('ψ_d: 1 до N0 та спадає далі', () => {
    expect(psiD(100)).toBe(1);
    expect(psiD(300)).toBeLessThan(psiD(200));
    expect(psiD(300)).toBeGreaterThan(0);
  });
  test('XP: рівень 2, «Добре», у термін = 15', () => expect(xpFor(3, 'PROD', 0.9, 10)).toBe(15));
  test('XP: достроково (R=0,99) = 1', () => expect(xpFor(3, 'REC', 0.99, 10)).toBe(1));
  test('XP ≤ x_max = 20', () => {
    for (const g of [1, 2, 3, 4] as Grade[])
      for (const f of [...REVIEW_FORMATS, ...TEST_FORMATS])
        expect(xpFor(g, f, 0.5, 1)).toBeLessThanOrEqual(20);
  });
});

describe('validateEvent', () => {
  const ctx: ValidationContext = { now: 1e12, seen: (id) => id === 'dup', eventsLastMinute: 0 };
  const reason = (e: Partial<RawEvent>, c: Partial<ValidationContext> = {}) => {
    const ev: RawEvent = { id: 'a', reviewedAt: 1e12 - 1, format: 'REC', responseMs: 900, ...e };
    const r = validateEvent(ev, { ...ctx, ...c }, vp);
    return r.ok ? 'ok' : r.reason;
  };
  test('коректна подія', () => expect(reason({})).toBe('ok'));
  test('дублікат', () => expect(reason({ id: 'dup' })).toBe('duplicate'));
  test('час у майбутньому', () => expect(reason({ reviewedAt: 1e12 + 1e6 })).toBe('future_time'));
  test('порушення порядку часу', () =>
    expect(reason({ reviewedAt: 100 }, { lastEventAt: 200 })).toBe('time_order'));
  test('занадто швидко', () => expect(reason({ responseMs: 100 })).toBe('too_fast'));
  test('обмеження частоти', () => expect(reason({}, { eventsLastMinute: 40 })).toBe('rate_limit'));
});
