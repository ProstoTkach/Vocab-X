// Where a tour's card goes and what it points at: shared by the tour of Home and the tours of
// the other pages.

/** Space between the element and its highlight. px */
export const PAD = 6;
/** Length of the line from the card to the element. px */
export const GAP = 28;
/** Distance kept from the edges of the screen. px */
export const EDGE = 12;
/** Scrolled into view this far below the top (clear of the phone's top bar). px */
export const TOP_CLEAR = 80;
/** The tour waits until no other window has been open for this long. ms */
export const QUIET_MS = 1500;
export const CHECK_MS = 250;

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The element of a mark that is on screen (phones and desktops each hide one of a pair). */
export function targetOf(mark: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${mark}"]`))
    if (el.getClientRects().length > 0) return el;
  return null;
}

export const boxOf = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + 2 * PAD,
    height: r.height + 2 * PAD,
  };
};

export const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5);

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

type Side = 'bottom' | 'top' | 'right' | 'left';

interface Placement {
  x: number;
  y: number;
  /** The line from the card to the element, if the card is beside it. */
  line: { x1: number; y1: number; x2: number; y2: number } | null;
}

/**
 * Where the card goes: beside the element, on the first side with room for it (below or above
 * first; to the side first for tall elements such as the desktop menu), with a line between
 * them. With no room anywhere it sits at the far edge of the screen, over the page.
 */
export function place(t: Box | null, w: number, h: number, vw: number, vh: number): Placement {
  if (!t) return { x: (vw - w) / 2, y: (vh - h) / 2, line: null };
  const cx = t.left + t.width / 2;
  const cy = t.top + t.height / 2;
  const sides: Side[] =
    t.height > vh * 0.4 && t.width < vw * 0.4
      ? ['right', 'left', 'bottom', 'top']
      : ['bottom', 'top', 'right', 'left'];
  for (const side of sides) {
    if (side === 'bottom' || side === 'top') {
      const y = side === 'bottom' ? t.top + t.height + GAP : t.top - GAP - h;
      if (y < EDGE || y + h > vh - EDGE) continue;
      const x = clamp(cx - w / 2, EDGE, vw - EDGE - w);
      const lx = clamp(cx, x + 20, x + w - 20);
      const edge = side === 'bottom' ? t.top + t.height : t.top;
      return {
        x,
        y,
        line: { x1: lx, y1: edge, x2: lx, y2: side === 'bottom' ? y : y + h },
      };
    }
    const x = side === 'right' ? t.left + t.width + GAP : t.left - GAP - w;
    if (x < EDGE || x + w > vw - EDGE) continue;
    const y = clamp(cy - h / 2, EDGE, vh - EDGE - h);
    const ly = clamp(cy, y + 20, y + h - 20);
    const edge = side === 'right' ? t.left + t.width : t.left;
    return { x, y, line: { x1: edge, y1: ly, x2: side === 'right' ? x : x + w, y2: ly } };
  }
  const x = (vw - w) / 2;
  return { x, y: cy > vh / 2 ? EDGE : vh - EDGE - h, line: null };
}

/** Brings an element into view: near the top, so the card fits below it; centred if it is tall. */
export function scrollToTarget(el: HTMLElement, smooth: boolean) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const top = r.height > vh * 0.45 ? r.top - (vh - r.height) / 2 : r.top - TOP_CLEAR;
  if (Math.abs(top) < 4) return;
  window.scrollBy({ top, behavior: smooth ? 'smooth' : 'auto' });
}

/** No dialog of the app is open (the consent window, the install offer, a survey). */
export const noDialogs = () => !document.querySelector('[role="dialog"], [role="alertdialog"]');
