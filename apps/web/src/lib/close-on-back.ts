'use client';

import { useEffect, useEffectEvent } from 'react';
import { newId } from './ids';

/**
 * The phone's "Back" closes the window on top instead of leaving the page. While a window is
 * open, an extra history entry with the same URL sits on top; "Back" pops it and closes the
 * window. A window closed any other way takes its entry back off the history — or, when it
 * closes on the way to another page, the new page takes the entry's place.
 */

const KEY = 'vxOverlay';

interface Entry {
  id: string;
  close: () => void;
}

/** Open windows with their own history entry, the top one last. */
const stack: Entry[] = [];
let installed = false;
/** Our own step back is under way: the router must not take it for the user's. */
let backing = false;
/** The app asked the router for another page, which has not been written to the history yet. */
let navigating = false;
/** Entries of windows closed on the way to another page: that page replaces them. */
const left = new Set<unknown>();

const currentId = (): unknown => (window.history.state as Record<string, unknown> | null)?.[KEY];

/** Called by the app's router before it goes to another page (see i18n/navigation). */
export function noteNavigation() {
  navigating = true;
}

let patchedPush: History['pushState'] | null = null;

function install() {
  if (!installed) listen();
  // Patched again if the router put the originals back (it does when it remounts).
  if (window.history.pushState !== patchedPush) patchHistory();
}

function listen() {
  installed = true;
  // Capture runs before the router's own listener, so it never sees our step back.
  window.addEventListener(
    'popstate',
    (e) => {
      if (backing) {
        backing = false;
        e.stopImmediatePropagation();
        return;
      }
      // Back from a nested window lands on its parent's entry: everything above it closes.
      const at = currentId();
      for (let top = stack.at(-1); top && top.id !== at; top = stack.at(-1)) {
        stack.pop();
        top.close();
      }
    },
    true,
  );
}

function patchHistory() {
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  const patched: History['pushState'] = (...args) => {
    if (args[2] !== undefined) navigating = false;
    // The next page goes in place of a window closed on the way there.
    const id = currentId();
    if (left.has(id)) {
      left.delete(id);
      replace(...args);
    } else push(...args);
  };
  window.history.pushState = patched;
  patchedPush = patched;
  window.history.replaceState = (...args) => {
    if (args[2] !== undefined) navigating = false;
    replace(...args);
  };
}

export function useCloseOnBack(open: boolean, close: () => void) {
  const onClose = useEffectEvent(close);
  useEffect(() => {
    if (!open) return;
    install();
    const entry: Entry = { id: newId(), close: () => onClose() };
    let pushed = false;
    // Deferred: a mount undone at once (Strict Mode) leaves the history alone.
    const timer = window.setTimeout(() => {
      const state = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.pushState({ ...state, [KEY]: entry.id }, '');
      stack.push(entry);
      pushed = true;
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (!pushed) return;
      const i = stack.indexOf(entry);
      if (i < 0) return; // closed by "Back": the entry is gone already
      stack.splice(i, 1);
      if (currentId() !== entry.id) return; // already on another page
      // A step back now would cancel the page on its way; that page replaces the entry instead.
      if (navigating) left.add(entry.id);
      else {
        backing = true;
        window.history.back();
      }
    };
  }, [open]);
}
