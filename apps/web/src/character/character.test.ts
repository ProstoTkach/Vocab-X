import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { AVATARS, CANVAS_SIZE, ITEMS, type Sprite } from './config';
import {
  freshUnlocks,
  isWorn,
  itemById,
  layersOf,
  resolveLook,
  toEquipped,
  wear,
  type UnlockState,
} from './look';

const PUBLIC_DIR = fileURLToPath(new URL('../../../../public', import.meta.url));
const messages = (locale: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../messages/${locale}/character.json`, import.meta.url)),
      'utf8',
    ),
  ) as { items: Record<string, string> };

const ctx = (level = 1, inventory: string[] = []): UnlockState => ({
  level,
  achievements: new Set(),
  purchases: new Set(),
  inventory: new Set(inventory),
});

const sprites: [string, Sprite][] = [
  ...AVATARS.flatMap((a) => [
    [`${a.id}.body`, a.body] as [string, Sprite],
    [`${a.id}.head`, a.head] as [string, Sprite],
    ...Object.entries(a.moods).map(([m, s]) => [`${a.id}.${m}`, s] as [string, Sprite]),
  ]),
  ...ITEMS.map((i) => [i.id, i] as [string, Sprite]),
];

describe('character config', () => {
  test('ids are unique', () => {
    const ids = [...AVATARS, ...ITEMS].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(sprites)('%s: the picture exists and fits the canvas', (_name, s) => {
    expect(existsSync(PUBLIC_DIR + s.src)).toBe(true);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.x + s.width).toBeLessThanOrEqual(CANVAS_SIZE);
    expect(s.y + s.height).toBeLessThanOrEqual(CANVAS_SIZE);
  });

  test('per-avatar positions refer to existing avatars', () => {
    const avatars = new Set(AVATARS.map((a) => a.id));
    for (const item of ITEMS)
      for (const id of Object.keys(item.on ?? {})) expect(avatars).toContain(id);
  });

  test.each(['uk', 'en'])('every avatar and item has a name in %s', (locale) => {
    const names = messages(locale).items;
    for (const x of [...AVATARS, ...ITEMS]) expect(names[x.id], x.id).toBeTruthy();
  });
});

describe('look', () => {
  test('a new learner gets the default look', () => {
    const look = resolveLook({}, ctx());
    expect(look.avatar.id).toBe('dog');
    // The base clothes: nothing on top of the avatar's own picture.
    expect(look.worn.upper).toBeUndefined();
    expect(look.accessories).toEqual([]);
  });

  // Any item behind a level, whatever the config says today.
  const locked = ITEMS.find((i) => i.unlock.startsWith('level:') && i.slot !== 'accessory');
  const lockedLevel = Number(locked?.unlock.slice('level:'.length));

  test.runIf(locked)('locked and unknown items are dropped', () => {
    const look = resolveLook({ [locked!.slot]: locked!.id, shoes: 'nope' }, ctx());
    expect(look.worn[locked!.slot]).toBeUndefined();
    if (locked!.slot !== 'shoes') expect(look.worn.shoes).toBeUndefined();
  });

  test.runIf(locked)('a level or a granted item opens locked ones', () => {
    const slot = locked!.slot as 'upper';
    expect(resolveLook({ [slot]: locked!.id }, ctx(lockedLevel)).worn[slot]?.id).toBe(locked!.id);
    expect(resolveLook({ [slot]: locked!.id }, ctx(1, [locked!.id])).worn[slot]?.id).toBe(
      locked!.id,
    );
  });

  test('an emptied slot stays empty after a round trip', () => {
    const look = wear(resolveLook({}, ctx()), 'upper', null);
    expect(resolveLook(toEquipped(look), ctx()).worn.upper).toBeUndefined();
  });

  test('accessories toggle and several can be worn', () => {
    const clock = itemById('clock')!;
    const glasses = itemById('glasses_black')!;
    let look = wear(resolveLook({}, ctx(10)), 'accessory', clock);
    look = wear(look, 'accessory', glasses);
    expect(resolveLook(toEquipped(look), ctx(10)).accessories.map((a) => a.id)).toEqual([
      'clock',
      'glasses_black',
    ]);
    look = wear(look, 'accessory', clock);
    expect(isWorn(look, clock)).toBe(false);
    expect(isWorn(look, glasses)).toBe(true);
  });

  test('layers go back to front and use per-avatar positions', () => {
    const look = resolveLook({ avatar: 'wolf', upper: 'tshirt_green' }, ctx(10));
    const layers = layersOf(look);
    expect(layers.body.map((l) => l.key)).toEqual(['body:wolf', 'upper:tshirt_green']);
    expect(layers.head.map((l) => l.key)).toEqual(['head:wolf']);
    const upper = itemById('tshirt_green')!;
    expect(layers.body[1]!.x).toBe(upper.on?.wolf?.x ?? upper.x);
  });

  test('head accessories move with the head, others stay with the body', () => {
    const look = resolveLook(
      { avatar: 'dog', 'accessory:clock': 'clock', 'accessory:glasses_black': 'glasses_black' },
      ctx(10),
    );
    const layers = layersOf(look);
    expect(layers.head.map((l) => l.key)).toEqual(['head:dog', 'accessory:glasses_black']);
    expect(layers.front.map((l) => l.key)).toEqual(['accessory:clock']);
  });

  test('a mood swaps the head picture', () => {
    const look = resolveLook({}, ctx());
    expect(layersOf(look, 'joy').head[0]?.src).toBe(look.avatar.moods.joy?.src);
  });

  test.runIf(locked)('newly opened items are fresh until seen', () => {
    expect(freshUnlocks(ctx(1), new Set())).not.toContain(locked!.id);
    expect(freshUnlocks(ctx(lockedLevel), new Set())).toContain(locked!.id);
    expect(freshUnlocks(ctx(lockedLevel), new Set([locked!.id]))).not.toContain(locked!.id);
    // Free items were never locked.
    expect(freshUnlocks(ctx(99), new Set())).not.toContain(
      AVATARS.find((a) => a.unlock === 'free')!.id,
    );
  });
});
