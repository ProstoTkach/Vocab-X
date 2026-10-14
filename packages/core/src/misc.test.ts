import { describe, expect, test } from 'vitest';
import { manualClock, offsetClock } from './clock';
import { DEFAULT_UNLOAD_PARAMS as up } from './config/params';
import { mulberry32, rngForEvent, seededRng } from './rng';
import { DAY_MS, localDateKey } from './time';
import { effectiveRetention } from './unload';

describe('effectiveRetention (r_eff)', () => {
  test('без завалу r_eff = r_d', () =>
    expect(effectiveRetention(0.9, up.overdueThreshold, up)).toBe(0.9));
  test('знижується поступово', () => {
    const mid = effectiveRetention(0.9, up.overdueThreshold * 1.5, up);
    expect(mid).toBeLessThan(0.9);
    expect(mid).toBeGreaterThan(0.9 - up.maxDrop);
  });
  test('не нижче maxDrop і floor', () => {
    expect(effectiveRetention(0.9, 1e6, up)).toBeCloseTo(0.9 - up.maxDrop, 12);
    expect(effectiveRetention(0.82, 1e6, up)).toBe(up.floor);
  });
  test('ніколи не підвищує r_d', () => expect(effectiveRetention(0.79, 1e6, up)).toBe(0.79));
});

describe('Rng', () => {
  test('значення в [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 10_000; i++) {
      const x = r();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });
  test('один і той самий seed — та сама послідовність', () => {
    const a = seededRng('x');
    const b = seededRng('x');
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  test('rng події залежить лише від її id', () => {
    expect(rngForEvent('e1')()).toBe(rngForEvent('e1')());
    expect(rngForEvent('e1')()).not.toBe(rngForEvent('e2')());
  });
});

describe('Clock', () => {
  test('manualClock і offsetClock для «зсуву часу»', () => {
    const base = manualClock(1000);
    let offset = 0;
    const clock = offsetClock(base, () => offset);
    expect(clock.now()).toBe(1000);
    offset = DAY_MS;
    base.advance(5);
    expect(clock.now()).toBe(1005 + DAY_MS);
  });
});

describe('localDateKey', () => {
  test('дата в заданому часовому поясі', () => {
    const t = Date.UTC(2026, 0, 1, 23, 30);
    expect(localDateKey(t, 'UTC')).toBe('2026-01-01');
    expect(localDateKey(t, 'Europe/Kyiv')).toBe('2026-01-02');
  });
});
