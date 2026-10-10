import { facingOf, type Facing } from "../math/vec";
import type { GameMap } from "../world/map";
import type { Intent } from "./intent";
import { moveAndCollide, steer, type Body, type MoveTuning } from "./movement";

/** Simulation runs at a fixed rate everywhere (solo, host, client prediction, replays). */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export const PLAYER_MOVE: MoveTuning = { maxSpeed: 92, accel: 900, decel: 1400 };

export interface PlayerState extends Body {
  id: string;
  /** Visual identity (character sheet key). */
  look: string;
  facing: Facing;
  /** Normalized aim direction used by attacks; follows movement when no explicit aim. */
  aim: { x: number; y: number };
  moving: boolean;
}

export interface SimState {
  tick: number;
  mapId: string;
  players: Record<string, PlayerState>;
}

export function createPlayer(id: string, look: string, x: number, y: number): PlayerState {
  return { id, look, x, y, vx: 0, vy: 0, radius: 6, facing: "down", aim: { x: 0, y: 1 }, moving: false };
}

/**
 * Advances the simulation by one fixed step. Mutates `state` in place (the sim owns its state;
 * snapshots for the network/saves are copies taken outside).
 */
export function stepSim(state: SimState, map: GameMap, intents: Record<string, Intent>): void {
  state.tick++;
  for (const player of Object.values(state.players)) {
    const intent = intents[player.id];
    const move = intent?.move ?? { x: 0, y: 0 };
    steer(player, move, PLAYER_MOVE, SIM_DT);
    moveAndCollide(player, map, SIM_DT);
    player.moving = Math.hypot(player.vx, player.vy) > 8;
    if (intent?.aim) player.aim = intent.aim;
    else if (move.x || move.y) {
      const l = Math.hypot(move.x, move.y);
      player.aim = { x: move.x / l, y: move.y / l };
    }
    // Face the aim when aiming explicitly (mouse/right stick), else the movement direction.
    player.facing = facingOf(intent?.aim ?? move, player.facing);
  }
}
