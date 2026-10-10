import { createActor, PLAYER_STATS, type Actor } from "../combat/actor";
import { thinkEnemy } from "../combat/ai";
import { applyCommand } from "../combat/commands";
import { getEnemy } from "../combat/defs";
import { equip } from "../combat/equipment";
import { resolveMelee, separate, stepActor, stepLifecycle, stepPickups, stepProjectiles, type CombatWorld } from "../combat/step";
import { createRng } from "../math/rng";
import type { GameMap } from "../world/map";
import { emptyIntent, type Intent } from "./intent";

/** Simulation runs at a fixed rate everywhere (solo, host, client prediction, replays). */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export interface SimState extends CombatWorld {
  tick: number;
  mapId: string;
  /** Seeded RNG state: every random roll comes from here, so a sim is reproducible. */
  rngState: number;
}

export function createSim(mapId: string, seed: number): SimState {
  return { tick: 0, time: 0, mapId, rngState: seed >>> 0, actors: {}, projectiles: [], pickups: [], events: [], nextId: 1 };
}

export function spawnPlayer(state: SimState, id: string, look: string, x: number, y: number, gear: { weapon?: string | null; shield?: string | null } = {}): Actor {
  const a = createActor({ id, team: "players", kind: "player", type: "embersworn", look, x, y, stats: PLAYER_STATS });
  equip(a, gear.weapon ?? null, gear.shield ?? null);
  state.actors[id] = a;
  return a;
}

export function spawnEnemy(state: SimState, type: string, x: number, y: number): Actor {
  const def = getEnemy(type);
  const id = `e${state.nextId++}`;
  const a = createActor({ id, team: "enemies", kind: "enemy", type, look: def.look, x, y, stats: def.stats, radius: def.radius });
  state.actors[id] = a;
  return a;
}

export const players = (state: SimState) => Object.values(state.actors).filter((a) => a.kind === "player");

/**
 * Advances the simulation by one fixed step. Mutates `state` in place (the sim owns its state;
 * snapshots for the network/saves are copies taken outside). `state.events` holds what happened
 * during this step only.
 */
export function stepSim(state: SimState, map: GameMap, intents: Record<string, Intent>): void {
  state.tick++;
  state.time += SIM_DT;
  state.events = [];
  const rng = createRng(state.rngState);
  for (const id of Object.keys(state.actors).sort()) {
    const a = state.actors[id]!;
    const intent = a.kind === "player" ? (intents[id] ?? emptyIntent()) : thinkEnemy(state, a, rng, SIM_DT);
    for (const cmd of intent.commands ?? []) applyCommand(state.events, a, cmd);
    stepActor(state, map, rng, a, intent, SIM_DT);
  }
  separate(state, map);
  resolveMelee(state, rng);
  stepProjectiles(state, map, rng, SIM_DT);
  stepPickups(state, map, SIM_DT);
  stepLifecycle(state);
  state.rngState = rng.state;
}
