// What the character wears, stored in GamificationState.equipped:
//   { avatar: 'dog', upper: 'tshirt_green', 'accessory:clock': 'clock', … }
// Single slots are keyed by slot, accessories by `accessory:<id>` so several can be worn.
import { isUnlocked, type UnlockContext } from '@/themes/unlock';
import {
  AVATARS,
  DEFAULT_LOOK,
  ITEMS,
  LAYERS,
  MULTI_SLOTS,
  type AvatarConfig,
  type ItemConfig,
  type Mood,
  type Sprite,
  type WearSlot,
} from './config';

export type Equipped = Partial<Record<string, string>>;

export interface Look {
  avatar: AvatarConfig;
  /** Worn items per single slot. */
  worn: Partial<Record<WearSlot, ItemConfig>>;
  accessories: ItemConfig[];
}

export interface UnlockState extends UnlockContext {
  /** Items granted to the learner, open whatever their rule says. */
  inventory: ReadonlySet<string>;
}

export const avatarById = (id: string) => AVATARS.find((a) => a.id === id);
export const itemById = (id: string) => ITEMS.find((i) => i.id === id);
export const itemsIn = (slot: WearSlot) => ITEMS.filter((i) => i.slot === slot);

export function isOpen(item: AvatarConfig | ItemConfig, ctx: UnlockState): boolean {
  return ctx.inventory.has(item.id) || isUnlocked(item, ctx);
}

const accessoryKey = (id: string) => `accessory:${id}`;

/** The stored choice with defaults filled in; unknown or locked items are dropped. */
export function resolveLook(equipped: Equipped, ctx: UnlockState): Look {
  const touched = Object.keys(equipped).length > 0;
  const pick = <T extends AvatarConfig | ItemConfig>(item: T | undefined) =>
    item && isOpen(item, ctx) ? item : undefined;

  const avatar =
    pick(avatarById(equipped.avatar ?? '')) ?? pick(avatarById(DEFAULT_LOOK.avatar)) ?? AVATARS[0]!;

  const worn: Look['worn'] = {};
  for (const slot of ['upper', 'bottom', 'shoes'] as const) {
    // Empty means the base clothes ("nothing" on top of the avatar's own picture); only an
    // untouched look gets the defaults.
    const id = touched ? equipped[slot] : DEFAULT_LOOK[slot];
    const item = pick(id ? itemById(id) : undefined);
    if (item?.slot === slot) worn[slot] = item;
  }
  const ids = touched
    ? Object.entries(equipped)
        .filter(([k]) => k.startsWith('accessory:'))
        .map(([, v]) => v ?? '')
    : DEFAULT_LOOK.accessories;
  const accessories = ids
    .map((id) => pick(itemById(id)))
    .filter((i): i is ItemConfig => i?.slot === 'accessory');

  return { avatar, worn, accessories };
}

/** Back to a stored map, so a look can be changed one item at a time. */
export function toEquipped(look: Look): Equipped {
  const out: Record<string, string> = { avatar: look.avatar.id };
  for (const slot of ['upper', 'bottom', 'shoes'] as const) out[slot] = look.worn[slot]?.id ?? '';
  for (const a of look.accessories) out[accessoryKey(a.id)] = a.id;
  return out;
}

export function isWorn(look: Look, item: ItemConfig): boolean {
  return MULTI_SLOTS.has(item.slot)
    ? look.accessories.some((a) => a.id === item.id)
    : look.worn[item.slot]?.id === item.id;
}

/** Puts an item on (or toggles an accessory); `null` empties a single slot. */
export function wear(look: Look, slot: WearSlot, item: ItemConfig | null): Look {
  if (MULTI_SLOTS.has(slot)) {
    if (!item) return { ...look, accessories: [] };
    const on = look.accessories.some((a) => a.id === item.id);
    return {
      ...look,
      accessories: on
        ? look.accessories.filter((a) => a.id !== item.id)
        : [...look.accessories, item],
    };
  }
  const { [slot]: _removed, ...rest } = look.worn;
  return { ...look, worn: item ? { ...rest, [slot]: item } : rest };
}

export interface Layer extends Sprite {
  /** Stable across re-renders; changes when the picture does (for enter animations). */
  key: string;
  filter?: string;
}

/** Item position for the current avatar. */
function placeItem(item: ItemConfig, avatarId: string): Layer {
  const o = item.on?.[avatarId] ?? {};
  return {
    key: `${item.slot}:${item.id}`,
    src: item.src,
    x: o.x ?? item.x,
    y: o.y ?? item.y,
    width: o.width ?? item.width,
    height: o.height ?? item.height,
    ...(item.filter ? { filter: item.filter } : {}),
  };
}

export interface Layers {
  shadow: AvatarConfig['shadow'];
  /** Body and clothes, back to front; they never scale. */
  body: Layer[];
  /** The head and what is attached to it: moves and scales as one. */
  head: Layer[];
  /** Point the head scales around: the middle of its bottom edge (canvas pixels). */
  headPivot: { x: number; y: number };
  /** Accessories in front of everything that stay with the body (a watch). */
  front: Layer[];
}

/** Every picture of the look in drawing order, split into body and head groups. */
export function layersOf(look: Look, mood: Mood | null = null): Layers {
  const { avatar } = look;
  const head = (mood && avatar.moods[mood]) || avatar.head;
  const out: Layers = {
    shadow: avatar.shadow,
    body: [],
    head: [],
    headPivot: { x: head.x + head.width / 2, y: head.y + head.height },
    front: [],
  };
  for (const layer of LAYERS) {
    if (layer === 'body') out.body.push({ key: `body:${avatar.id}`, ...avatar.body });
    else if (layer === 'head') out.head.push({ key: `head:${avatar.id}`, ...head });
    else if (layer === 'accessory')
      for (const a of look.accessories)
        (a.attach === 'head' ? out.head : out.front).push(placeItem(a, avatar.id));
    else {
      const item = look.worn[layer];
      if (item) out.body.push(placeItem(item, avatar.id));
    }
  }
  return out;
}

/**
 * Cosmetics opened since the learner last looked into the wardrobe. Free ones never count: they
 * were there from the start.
 */
export function freshUnlocks(ctx: UnlockState, seen: ReadonlySet<string>): string[] {
  return [...AVATARS, ...ITEMS]
    .filter((x) => x.unlock !== 'free' && !seen.has(x.id) && isOpen(x, ctx))
    .map((x) => x.id);
}
