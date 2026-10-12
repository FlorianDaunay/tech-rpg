import type { Actor } from "./actor";
import { getStatus, type Element } from "./defs";
import type { SimEvent } from "./events";

/** Applies (or re-stacks) a status. Stunning statuses stagger the target for their duration. */
export function applyStatus(events: SimEvent[], target: Actor, id: string, source: string | null, power: number): void {
  const def = getStatus(id);
  const cur = target.statuses.find((s) => s.id === id);
  if (cur) {
    cur.stacks = Math.min(def.maxStacks, cur.stacks + 1);
    cur.t = 0;
    cur.power = Math.max(cur.power, power);
  } else target.statuses.push({ id, t: 0, stacks: 1, tick: 0, power, source });
  if (def.stun && target.action.kind !== "dead") {
    target.action = { kind: "stagger", t: 0, duration: def.duration };
    target.blockSince = null;
  }
  events.push({ type: "status", id: target.id, status: id, stacks: cur?.stacks ?? 1 });
}

/**
 * Ticks statuses: damage over time and expiry. Returns the source of lethal damage
 * (the caller handles death) or undefined if the actor survived.
 */
export function stepStatuses(events: SimEvent[], a: Actor, dt: number): { killer: string | null } | undefined {
  for (const s of a.statuses) {
    const def = getStatus(s.id);
    s.t += dt;
    if (def.tickDamage <= 0 || a.hp <= 0) continue;
    s.tick += dt;
    while (s.tick >= def.tickInterval) {
      s.tick -= def.tickInterval;
      const amount = Math.max(1, Math.round(s.power * def.tickDamage * s.stacks));
      a.hp = Math.max(0, a.hp - amount);
      events.push({ type: "status-tick", id: a.id, status: s.id, amount, x: a.x, y: a.y });
      if (a.hp <= 0) return { killer: s.source };
    }
  }
  a.statuses = a.statuses.filter((s) => s.t < getStatus(s.id).duration);
  return undefined;
}

export const speedMultOf = (a: Actor) => a.statuses.reduce((m, s) => m * getStatus(s.id).speedMult, 1);
export const damageTakenMultOf = (a: Actor) => a.statuses.reduce((m, s) => m * getStatus(s.id).damageTakenMult, 1);
export const damageDealtMultOf = (a: Actor) => a.statuses.reduce((m, s) => m * (getStatus(s.id).damageDealtMult ?? 1), 1);

/** The first elemental status on the actor (what an incoming element reacts with). */
export function elementalStatus(a: Actor): { index: number; element: Element } | null {
  for (let i = 0; i < a.statuses.length; i++) {
    const el = getStatus(a.statuses[i]!.id).element;
    if (el) return { index: i, element: el };
  }
  return null;
}
