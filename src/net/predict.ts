import type { Actor } from "@/core/combat/actor";
import { stepActor } from "@/core/combat/step";
import { createRng } from "@/core/math/rng";
import type { Intent } from "@/core/sim/intent";
import { SIM_DT, type SimState } from "@/core/sim/state";
import type { GameMap } from "@/core/world/map";
import { applyActorTuple } from "./codec";
import type { ActorTuple, SeqInput } from "./protocol";

/**
 * Client-side prediction of the local player: the same action state machine and movement as the
 * host (stepActor), on a scratch copy of the world so nothing it emits (events, projectiles) leaks:
 * hits, damage and kills only ever come from the host.
 */
export function predictStep(mirror: SimState, map: GameMap, me: Actor, intent: Intent): void {
  const scratch = { ...mirror, events: [], projectiles: [], pickups: [] };
  stepActor(scratch, map, createRng(mirror.tick), me, { ...intent, commands: [] }, SIM_DT);
}

/**
 * Reconciliation: take the host's authoritative state of the local player, then replay the inputs it
 * hasn't applied yet. Returns how far the prediction was off (px), so the view can smooth small errors.
 */
export function reconcile(mirror: SimState, map: GameMap, me: Actor, authoritative: ActorTuple, unacked: readonly SeqInput[]): number {
  const before = { x: me.x, y: me.y };
  applyActorTuple(me, authoritative);
  for (const i of unacked) predictStep(mirror, map, me, i.intent);
  return Math.hypot(me.x - before.x, me.y - before.y);
}
