import { useEffect, useRef, type RefObject } from "react";
import { useInputDevice } from "@/store/input";

/**
 * Menu navigation for keyboard and gamepad over plain HTML focus:
 * arrows / D-pad / left stick move focus spatially, Enter / A activates, Escape / B / Start goes back.
 * Only the most recently mounted menu reacts (menus stack: settings over pause).
 *
 * One module-level gamepad poller serves every menu and keeps running once started, so button edge
 * state survives menus mounting/unmounting: the Start press that opened a menu is already "held",
 * and a quick B right after a menu swap is still seen as a new press.
 */
interface Nav {
  ref: RefObject<HTMLElement | null>;
  back?: () => void;
  /** Previous / next tab (Q/E or PageUp/PageDown, LB/RB). */
  tab?: (dir: 1 | -1) => void;
}
const TAB_KEYS: Record<string, 1 | -1> = { q: -1, e: 1, PageUp: -1, PageDown: 1 };
const stack: Nav[] = [];
let suspended = false;
/** Key rebinding captures raw keys: menu navigation must not react meanwhile. */
export const suspendMenuNav = (on: boolean) => (suspended = on);

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
type Dir = "up" | "down" | "left" | "right";
const ARROWS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

function focusables(root: HTMLElement): HTMLElement[] {
  // `data-nav-skip`: pointer-only controls (tab strips have their own keys) stay out of arrow navigation.
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[data-nav-skip]") && (el.offsetParent !== null || el === document.activeElement));
}

/** Moves focus to the nearest focusable in a direction (falls back to the first one). */
export function moveFocus(root: HTMLElement, dir: Dir): void {
  const items = focusables(root);
  const current = document.activeElement as HTMLElement | null;
  if (!current || !root.contains(current)) return void items[0]?.focus();
  const a = current.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const primary = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
    const secondary = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (primary <= 1) continue;
    const score = primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  (best ?? current).focus();
  best?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Steps a focused range input and notifies React (which listens to native input events). */
function stepRange(el: HTMLInputElement, sign: number): void {
  const step = Number(el.step) || 1;
  const next = Math.min(Number(el.max || 100), Math.max(Number(el.min || 0), Number(el.value) + sign * step));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, String(next));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const isRange = (el: Element | null): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === "range";
const isText = (el: Element | null) => el instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(el.type);
const top = () => (suspended ? undefined : stack.at(-1));

function onKey(e: KeyboardEvent): void {
  const nav = top();
  const root = nav?.ref.current;
  if (!nav || !root) return;
  if (e.key === "Escape") {
    if (nav.back) {
      e.preventDefault();
      e.stopPropagation();
      nav.back();
    }
    return;
  }
  const active = document.activeElement;
  const tab = TAB_KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (tab && nav.tab && !isText(active) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    nav.tab(tab);
    return;
  }
  const dir = ARROWS[e.key];
  if (!dir) return;
  if ((isText(active) || isRange(active)) && (dir === "left" || dir === "right")) return; // native caret / slider keys
  if (active instanceof HTMLSelectElement) return;
  e.preventDefault();
  moveFocus(root, dir);
}

let started = false;
let prev = new Set<number>();
let held: Dir | null = null;
let nextRepeat = 0;

function poll(now: number): void {
  requestAnimationFrame(poll);
  const pad = navigator.getGamepads?.().find((p) => p?.connected && p.mapping === "standard");
  if (!pad) return void (prev = new Set());
  const down = new Set<number>();
  pad.buttons.forEach((b, i) => b.pressed && down.add(i));
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  let dir: Dir | null = down.has(12) ? "up" : down.has(13) ? "down" : down.has(14) ? "left" : down.has(15) ? "right" : null;
  if (!dir && Math.hypot(ax, ay) > 0.6) dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? "left" : "right") : ay < 0 ? "up" : "down";
  const before = prev;
  const pressed = (i: number) => down.has(i) && !before.has(i);
  prev = down;
  const repeatDue = dir !== null && (dir !== held || now >= nextRepeat);
  if (repeatDue) nextRepeat = now + (dir === held ? 110 : 380);
  held = dir;

  const nav = top();
  const root = nav?.ref.current;
  if (!nav || !root) return;
  if (down.size || dir) useInputDevice.getState().setDevice("gamepad");
  const active = document.activeElement as HTMLElement | null;
  if (dir && repeatDue) {
    if (isRange(active) && (dir === "left" || dir === "right")) stepRange(active, dir === "left" ? -1 : 1);
    else moveFocus(root, dir);
  }
  if (nav.tab && (pressed(4) || pressed(5))) nav.tab(pressed(4) ? -1 : 1);
  else if (pressed(0) && active && root.contains(active)) active.click();
  else if (pressed(1) || pressed(9)) nav.back?.();
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  window.addEventListener("keydown", onKey, true);
  requestAnimationFrame(poll);
}

export function useMenuNav(ref: RefObject<HTMLElement | null>, opts: { back?: () => void; tab?: (dir: 1 | -1) => void; autoFocus?: boolean } = {}): void {
  const backRef = useRef(opts.back);
  backRef.current = opts.back;
  const tabRef = useRef(opts.tab);
  tabRef.current = opts.tab;

  useEffect(() => {
    ensureStarted();
    const nav: Nav = { ref, back: opts.back ? () => backRef.current?.() : undefined, tab: opts.tab ? (d) => tabRef.current?.(d) : undefined };
    stack.push(nav);
    if (opts.autoFocus !== false) {
      const root = ref.current;
      const first = root?.querySelector<HTMLElement>("[data-autofocus]") ?? (root ? focusables(root)[0] : undefined);
      // Only steal focus for keyboard/gamepad players; touch users don't need a focus ring.
      if (useInputDevice.getState().device !== "touch") first?.focus({ preventScroll: true });
    }
    return () => void stack.splice(stack.indexOf(nav), 1);
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps
}
