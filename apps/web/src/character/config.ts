// The character: every avatar and wearable item, with the exact place it is drawn at.
//
// Coordinates are pixels on an 800 × 800 canvas, measured from its top-left corner (x to the
// right, y down) to the top-left corner of the picture. `width` and `height` are the size the
// picture is drawn at on that canvas (by default its own size in pixels). On screen the canvas
// scales to fit, so these numbers never change with the screen size.
//
// Pictures live in /public at the project root (e.g. /public/male/uppers/tshirt_green.png is
// `src: '/male/uppers/tshirt_green.png'`). New items also need a name in
// messages/<locale>/character.json under `items`.
//
// `unlock` says how an item becomes available: 'free', 'level:N', 'achievement:<id>' or
// 'purchase:<sku>'. Items granted to the learner (gamification inventory) are open regardless.
// Only the avatar of DEFAULT_LOOK and the base clothes (BASE_CLOTHES) are free; every item
// opens at a level.
import type { Unlock } from '@/themes/types';

export const CANVAS_SIZE = 800;

/** A picture placed on the canvas. */
export interface Sprite {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An area on the canvas without a picture (e.g. the shadow ellipse). */
export type Area = Omit<Sprite, 'src'>;

/** Moods the head can show; the plain `head` is the calm one. */
export type Mood = 'joy' | 'sad';

export interface AvatarConfig {
  id: string;
  unlock: Unlock;
  body: Sprite;
  head: Sprite;
  /** Other faces; each picture has its own size, so its own position. */
  moods: Partial<Record<Mood, Sprite>>;
  /** Soft shadow on the ground: the ellipse it fills. */
  shadow: Area;
}

/** Wardrobe categories, in the order the wardrobe lists them. */
export const WEAR_SLOTS = ['upper', 'bottom', 'shoes', 'accessory'] as const;
export type WearSlot = (typeof WEAR_SLOTS)[number];

/** Several accessories can be worn at once; other slots hold one item. */
export const MULTI_SLOTS: ReadonlySet<WearSlot> = new Set(['accessory']);

export interface ItemConfig extends Sprite {
  id: string;
  slot: WearSlot;
  unlock: Unlock;
  /**
   * Position for a specific avatar, when its body differs from the default one (dog).
   * Keys are avatar ids; any of x, y, width, height can be overridden.
   */
  on?: Record<string, Partial<Area>>;
  /** 'head': moves and scales with the head (glasses, hats); otherwise stays with the body. */
  attach?: 'head';
  /** Optional CSS filter, e.g. a colour variant of the same picture: 'hue-rotate(150deg)'. */
  filter?: string;
}

/** Drawing order, back to front. */
export const LAYERS = ['body', 'bottom', 'shoes', 'upper', 'head', 'accessory'] as const;

export const AVATARS: readonly AvatarConfig[] = [
  {
    id: 'dog',
    unlock: 'free',
    body: { src: '/male/_dog/dog_body.png', x: 164, y: 279, width: 425, height: 491 },
    head: { src: '/male/_dog/dog_head.png', x: 270, y: 76, width: 300, height: 314 },
    moods: {
      joy: { src: '/male/_dog/dog_head_joy.png', x: 269, y: 73, width: 302, height: 316 },
      sad: { src: '/male/_dog/dog_head_sad.png', x: 269, y: 73, width: 300, height: 311 },
    },
    shadow: { x: 230, y: 735, width: 380, height: 56 },
  },
  {
    id: 'wolf',
    unlock: 'level:3',
    body: { src: '/male/_wolf/wolf_body.png', x: 150, y: 281, width: 439, height: 488 },
    head: { src: '/male/_wolf/wolf_head.png', x: 273, y: 28, width: 284, height: 351 },
    moods: {
      joy: { src: '/male/_wolf/wolf_head_joy.png', x: 269, y: 28, width: 286, height: 369 },
      sad: { src: '/male/_wolf/wolf_head_sad.png', x: 258, y: 44, width: 310, height: 335 },
    },
    shadow: { x: 220, y: 735, width: 390, height: 56 },
  },
];

export const ITEMS: readonly ItemConfig[] = [
  // Upper clothes
  {
    id: 'tshirt_green',
    slot: 'upper',
    unlock: 'level:2',
    src: '/male/uppers/tshirt_green.png',
    x: 248,
    y: 279,
    width: 312,
    height: 291,
  },
  {
    id: 'tshirt_blue',
    slot: 'upper',
    unlock: 'level:6',
    src: '/male/uppers/tshirt_green.png',
    filter: 'hue-rotate(95deg)',
    x: 248,
    y: 279,
    width: 312,
    height: 291,
  },

  // Lower clothes
  {
    id: 'jeans',
    slot: 'bottom',
    unlock: 'level:2',
    src: '/male/bottoms/jeans.png',
    x: 312,
    y: 540,
    width: 209,
    height: 177,
  },
  {
    id: 'jeans_black',
    slot: 'bottom',
    unlock: 'level:7',
    src: '/male/bottoms/jeans.png',
    filter: 'grayscale(1) brightness(0.55)',
    x: 312,
    y: 540,
    width: 209,
    height: 177,
  },

  // Shoes
  {
    id: 'boots_red',
    slot: 'shoes',
    unlock: 'level:5',
    src: '/male/boots/boots_red.png',
    x: 255,
    y: 659,
    width: 322,
    height: 110,
  },
  {
    id: 'boots_blue',
    slot: 'shoes',
    unlock: 'level:6',
    src: '/male/boots/boots_red.png',
    filter: 'hue-rotate(210deg)',
    x: 255,
    y: 659,
    width: 322,
    height: 110,
  },

  // Accessories
  {
    id: 'clock',
    slot: 'accessory',
    unlock: 'level:7',
    src: '/male/accessories/clock.png',
    x: 285,
    y: 479,
    width: 61,
    height: 60,
  },
  {
    id: 'glasses_black',
    slot: 'accessory',
    unlock: 'level:5',
    src: '/male/accessories/glasses_black.png',
    attach: 'head',
    x: 278,
    y: 139,
    width: 278,
    height: 85,
  },
];

/**
 * The base clothes: what the avatar's own picture already wears (a white T-shirt, shorts and
 * sneakers). Wearing "nothing" in a slot shows them, so they are always available. `src` is the
 * wardrobe preview; until there is a picture, the wardrobe shows an icon.
 */
export const BASE_CLOTHES: Record<'upper' | 'bottom' | 'shoes', { src: string | null }> = {
  upper: { src: null },
  bottom: { src: null },
  shoes: { src: null },
};

/** What a new learner wears: the base clothes (null) and no accessories. */
export const DEFAULT_LOOK: {
  avatar: string;
  upper: string | null;
  bottom: string | null;
  shoes: string | null;
  accessories: string[];
} = {
  avatar: 'dog',
  upper: null,
  bottom: null,
  shoes: null,
  accessories: [],
};
