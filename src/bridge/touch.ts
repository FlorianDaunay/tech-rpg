import type { Action } from "@/core/sim/intent";

/**
 * Shared state written by the React TouchControls and read by the InputRouter every step.
 * A plain mutable object (not events) because it changes at pointer-move rate.
 */
export const touchInput = {
  active: false,
  move: { x: 0, y: 0 },
  /** Aim from dragging an action button, or null for auto-aim. */
  aim: null as { x: number; y: number } | null,
  held: new Set<Action>(),
  /** Presses not yet consumed by the game, so a quick tap is never lost between frames. */
  pressedQueue: [] as Action[],
};

export function touchPress(action: Action) {
  touchInput.held.add(action);
  touchInput.pressedQueue.push(action);
}

export function touchRelease(action: Action) {
  touchInput.held.delete(action);
}
