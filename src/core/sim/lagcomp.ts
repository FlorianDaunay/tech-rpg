import type { Vec2 } from "../math/vec";
import type { Actor } from "../combat/actor";
import type { Rewind } from "../combat/step";

/**
 * Lag compensation for PvP melee (host only). The host remembers where each player stood over the
 * last few ticks; when a remote attacker's swing is tested, the target is put back where that
 * attacker saw it (its round trip + the interpolation delay ago, capped). Kept outside the sim
 * state on purpose: it is never synced or saved, and a fresh sim simply starts without history.
 */

/** Never rewind more than this (ms): beyond it, the attacker's lag is their own problem. */
export const MAX_REWIND_MS = 200;
const KEEP_TICKS = 16;

const history = new WeakMap<object, Map<string, { tick: number; x: number; y: number }[]>>();

/** After a step: remember every player's position at this tick. */
export function recordPositions(state: { tick: number; actors: Record<string, Actor> }): void {
  let h = history.get(state);
  if (!h) history.set(state, (h = new Map()));
  for (const a of Object.values(state.actors)) {
    if (a.kind !== "player") continue;
    let list = h.get(a.id);
    if (!list) h.set(a.id, (list = []));
    list.push({ tick: state.tick, x: a.x, y: a.y });
    if (list.length > KEEP_TICKS) list.shift();
  }
}

/** Where `id` stood `ticks` ticks ago (the oldest known if further back), or null without history. */
export function positionAgo(state: { tick: number }, id: string, ticks: number): Vec2 | null {
  const list = history.get(state)?.get(id);
  if (!list?.length || ticks <= 0) return null;
  const want = state.tick - ticks;
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.tick <= want) return { x: list[i]!.x, y: list[i]!.y };
  return { x: list[0]!.x, y: list[0]!.y };
}

/** Delay (ms) → ticks to rewind, capped. */
export const rewindTicks = (ms: number, hz = 60) => Math.round((Math.min(MAX_REWIND_MS, Math.max(0, ms)) * hz) / 1000);

/** A Rewind for resolveMelee from each attacker's lag (ms). Attackers without lag (the host) see "now". */
export function rewinder(state: { tick: number }, lagMs: Record<string, number>): Rewind {
  return (attacker, target) => {
    const ticks = rewindTicks(lagMs[attacker.id] ?? 0);
    return ticks ? positionAgo(state, target.id, ticks) : null;
  };
}
