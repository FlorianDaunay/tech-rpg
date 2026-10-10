import type { Facing, Vec2 } from "../math/vec";
import type { Body } from "../sim/movement";
import { STAMINA } from "./moves";
import type { SkillSlot } from "./defs";

import { emptyProgress, type Progress } from "../narrative/progress";

export type Team = "players" | "enemies" | "neutral";

/** What an actor is doing. One state at a time; timers count up in seconds. */
export type ActionState =
  | { kind: "free" }
  | { kind: "charge"; t: number }
  | {
      kind: "attack";
      move: string;
      t: number;
      dir: Vec2;
      /** Ids already hit by this swing (each target is hit once per swing). */
      hit: string[];
      /** Attack pressed during this move: chain into `move.next`. */
      queued: boolean;
      /** 0..1 heavy charge level. */
      charge: number;
      /** The "active" event was emitted (lunge applied). */
      started: boolean;
    }
  | { kind: "dodge"; t: number; dir: Vec2 }
  | { kind: "hurt"; t: number; duration: number }
  | { kind: "stagger"; t: number; duration: number }
  | { kind: "dead"; t: number };

export interface CombatStats {
  maxHp: number;
  /** Base damage of a 1× move. */
  power: number;
  /** Damage reduction: taken = dmg × 100 / (100 + defense). */
  defense: number;
  critChance: number;
  critMultiplier: number;
  /** Hits below this poise damage don't interrupt (hyper-armour for brutes, bosses). */
  maxPoise: number;
  /** Movement speed px/s. */
  speed: number;
}

/** Enemy brain memory (null for players). */
export interface AiState {
  target: string | null;
  /** Seconds until the next attack is allowed. */
  cooldown: number;
  /** +1 / -1: which way it circles the target while waiting. */
  strafe: number;
  /** Seconds until it re-picks its strafe direction. */
  think: number;
  /** Fractional hp healed while walking home (hp stays an integer). */
  regen: number;
}

/** A status effect running on an actor. */
export interface StatusInstance {
  id: string;
  /** Seconds elapsed (restarts when re-applied). */
  t: number;
  stacks: number;
  /** Seconds accumulated towards the next damage tick. */
  tick: number;
  /** Applier's power when applied (damage-over-time scales with it). */
  power: number;
  source: string | null;
}

export interface Actor extends Body {
  id: string;
  team: Team;
  kind: "player" | "enemy" | "npc";
  /** Enemy definition id (enemies) or class id (players). */
  type: string;
  /** Character sheet asset key. */
  look: string;
  facing: Facing;
  aim: Vec2;
  moving: boolean;
  /** Stats without equipment; `stats` = base + gear (see equipment.ts). */
  baseStats: CombatStats;
  stats: CombatStats;
  weapon: string | null;
  shield: string | null;
  statuses: StatusInstance[];
  /** Picked-up items by id ("gold" included). Players only for now. */
  bag: Record<string, number>;
  hp: number;
  stamina: number;
  /** Seconds before stamina regenerates again. */
  staminaDelay: number;
  poise: number;
  action: ActionState;
  /** Sim time when block was raised, or null when not blocking. */
  blockSince: number | null;
  /** Seconds of invulnerability left. */
  iframes: number;
  cooldowns: Record<string, number>;
  /** Spawn point (respawn for players, leash for enemies). */
  home: Vec2;
  /** Seconds since the last hit taken (poise regenerates after a pause). */
  sinceHit: number;
  /** Last action pressed while busy, replayed as soon as the actor can act (input buffering). */
  buffered: { action: BufferedAction; ttl: number } | null;
  ai: AiState | null;
  /** Story state (players only). */
  progress: Progress | null;
  /** Character level (players; enemies stay 1) and XP inside it (see core/progression). */
  level: number;
  xp: number;
  /** Skill per slot (players). */
  loadout: Record<SkillSlot, string | null>;
  /** Ember gauge: damage dealt since the last ultimate. */
  ultCharge: number;
}

/** Actions remembered while busy (input buffering). */
export type BufferedAction = "attack" | "heavy" | "dodge" | SkillSlot;

export function createActor(init: {
  id: string;
  team: Team;
  kind: Actor["kind"];
  type: string;
  look: string;
  x: number;
  y: number;
  stats: CombatStats;
  radius?: number;
}): Actor {
  return {
    id: init.id,
    team: init.team,
    kind: init.kind,
    type: init.type,
    look: init.look,
    x: init.x,
    y: init.y,
    vx: 0,
    vy: 0,
    radius: init.radius ?? 6,
    facing: "down",
    aim: { x: 0, y: 1 },
    moving: false,
    baseStats: init.stats,
    stats: init.stats,
    weapon: null,
    shield: null,
    statuses: [],
    bag: {},
    hp: init.stats.maxHp,
    stamina: STAMINA.max,
    staminaDelay: 0,
    poise: init.stats.maxPoise,
    action: { kind: "free" },
    blockSince: null,
    iframes: 0,
    cooldowns: {},
    home: { x: init.x, y: init.y },
    sinceHit: 99,
    buffered: null,
    ai: init.kind === "player" ? null : { target: null, cooldown: 0.5, strafe: 1, think: 0, regen: 0 },
    progress: init.kind === "player" ? emptyProgress() : null,
    level: 1,
    xp: 0,
    loadout: { skill1: null, skill2: null, ultimate: null },
    ultCharge: 0,
  };
}

export const isAlive = (a: Actor) => a.action.kind !== "dead";

export const PLAYER_STATS: CombatStats = {
  maxHp: 100,
  power: 12,
  defense: 10,
  critChance: 0.08,
  critMultiplier: 1.75,
  maxPoise: 40,
  speed: 92,
};
