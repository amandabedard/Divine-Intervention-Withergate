// Keyboard and gamepad navigation for menus. One place turns physical input into
// abstract actions; menu components react to those actions through useMenuNav/onNav.
// WorldScene reads the keyboard and gamepad directly for movement while ui.mode === 'world'.
import { useEffect, useRef, useState } from 'react';

export type NavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'menu';
export const NAV_EVENT = 'wg-nav';

export function dispatchNav(action: NavAction): void {
  window.dispatchEvent(new CustomEvent<NavAction>(NAV_EVENT, { detail: action }));
}

/** Subscribe to navigation actions. Returns the unsubscribe function. */
export function onNav(handler: (action: NavAction) => void): () => void {
  const h = (e: Event) => handler((e as CustomEvent<NavAction>).detail);
  window.addEventListener(NAV_EVENT, h);
  return () => window.removeEventListener(NAV_EVENT, h);
}

/** Map a keyboard event to a navigation action, or null if the key is not a menu key. */
export function keyToNav(e: KeyboardEvent): NavAction | null {
  switch (e.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    case 'Enter':
    case ' ':
    case 'e':
    case 'E':
      return 'confirm';
    case 'Escape':
    case 'q':
    case 'Q':
      return 'cancel';
    default:
      return null;
  }
}

export interface MenuNavOptions<T> {
  items: readonly T[];
  onSelect: (item: T, index: number) => void;
  onCancel?: () => void;
  /** When false the hook ignores input (e.g. while a typewriter line is still printing). */
  enabled?: boolean;
  isDisabled?: (item: T, index: number) => boolean;
  /** Changing this resets the cursor to the first enabled item. */
  resetKey?: unknown;
  /** Navigate with left/right instead of up/down. */
  horizontal?: boolean;
}

export interface MenuNav {
  index: number;
  setIndex: (i: number) => void;
  /** Spread onto each item's button: highlights the focused item and follows the mouse. */
  itemProps: (i: number) => { className: string; onMouseEnter: () => void };
}

/**
 * Cursor navigation over a list of items. Up/down (or left/right) move the cursor,
 * confirm selects, cancel calls onCancel. Mouse hover moves the cursor too so the two
 * input methods never fight.
 */
export function useMenuNav<T>(opts: MenuNavOptions<T>): MenuNav {
  const [index, setIndex] = useState(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const indexRef = useRef(0);
  indexRef.current = index;

  const enabledIndex = (from: number, dir: 1 | -1): number => {
    const { items, isDisabled } = optsRef.current;
    const n = items.length;
    if (!n) return 0;
    let i = ((from % n) + n) % n;
    for (let k = 0; k < n; k += 1) {
      if (!isDisabled?.(items[i]!, i)) return i;
      i = (i + dir + n) % n;
    }
    return ((from % n) + n) % n;
  };

  useEffect(() => {
    setIndex(enabledIndex(0, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.resetKey, opts.items.length]);

  useEffect(
    () =>
      onNav((a) => {
        const o = optsRef.current;
        if (o.enabled === false || !o.items.length) return;
        const back = o.horizontal ? 'left' : 'up';
        const fwd = o.horizontal ? 'right' : 'down';
        if (a === back) setIndex(enabledIndex(indexRef.current - 1, -1));
        else if (a === fwd) setIndex(enabledIndex(indexRef.current + 1, 1));
        else if (a === 'confirm') {
          const i = indexRef.current;
          const item = o.items[i];
          if (item !== undefined && !o.isDisabled?.(item, i)) o.onSelect(item, i);
        } else if (a === 'cancel') o.onCancel?.();
      }),
    [],
  );

  return {
    index,
    setIndex,
    itemProps: (i) => ({ className: i === index ? 'focused' : '', onMouseEnter: () => setIndex(i) }),
  };
}

// --- gamepad ------------------------------------------------------------------

const BUTTON_NAV: Record<number, NavAction> = {
  0: 'confirm', // A / Cross
  1: 'cancel', // B / Circle
  9: 'menu', // Start
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

let polling = false;

/**
 * Poll the first gamepad and translate it into navigation actions while a menu is
 * active. Sticks repeat like held keys. Safe to call more than once.
 */
export function startGamepadPolling(isMenuActive: () => boolean): void {
  if (polling || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
  polling = true;
  const prevButtons: boolean[] = [];
  let held: NavAction | null = null;
  let nextRepeat = 0;
  const loop = (t: number) => {
    const pad = navigator.getGamepads()[0];
    if (pad) {
      const active = isMenuActive();
      pad.buttons.forEach((b, i) => {
        const was = prevButtons[i] ?? false;
        const nav = BUTTON_NAV[i];
        if (b.pressed && !was && active && nav) dispatchNav(nav);
        prevButtons[i] = b.pressed;
      });
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const dir: NavAction | null = y < -0.6 ? 'up' : y > 0.6 ? 'down' : x < -0.6 ? 'left' : x > 0.6 ? 'right' : null;
      if (dir !== held) {
        held = dir;
        if (dir && active) dispatchNav(dir);
        nextRepeat = t + 350;
      } else if (dir && t >= nextRepeat) {
        if (active) dispatchNav(dir);
        nextRepeat = t + 130;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
