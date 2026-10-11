import type { Vec2 } from "../math/vec";
import type { Element } from "./defs";
import type { Move } from "./moves";

/**
 * What happened during one sim step. The sim never plays sounds or spawns particles: it reports
 * events and the presentation layer (game/fx, game/audio) turns them into juice. Over the network,
 * the host forwards these with each snapshot.
 */
export type SimEvent =
  /** An attack started its windup (enemy attacks: telegraph now). */
  | { type: "attack"; id: string; move: string; windup: number }
  /** The hitbox went live (swing whoosh, slash VFX). */
  | { type: "swing"; id: string; move: string; weight: Move["weight"]; x: number; y: number; dir: Vec2 }
  | { type: "charge"; id: string }
  | {
      type: "hit";
      attacker: string;
      target: string;
      amount: number;
      crit: boolean;
      blocked: boolean;
      weight: Move["weight"];
      element?: Element;
      x: number;
      y: number;
      dir: Vec2;
    }
  | { type: "status"; id: string; status: string; stacks: number }
  | { type: "status-tick"; id: string; status: string; amount: number; x: number; y: number }
  /** Two elements met: burst at x/y. */
  | { type: "reaction"; reaction: string; target: string; x: number; y: number; radius: number }
  /** Loot spawned on the ground. */
  | { type: "drop"; id: string; item: string; count: number; x: number; y: number }
  | { type: "equip"; id: string; slot: "weapon" | "shield"; item: string | null }
  | { type: "use"; id: string; item: string; heal: number }
  | { type: "pickup"; id: string; actor: string; item: string; count: number; x: number; y: number }
  /** Perfect parry: the attacker is staggered (slow-mo counter window). */
  | { type: "parry"; attacker: string; target: string; x: number; y: number }
  | { type: "guard-break"; id: string }
  | { type: "stagger"; id: string }
  | { type: "dodge"; id: string }
  | { type: "death"; id: string; killer: string | null; xp: number }
  | { type: "respawn"; id: string }
  /** A player earned XP (kills are shared by the party, quests go to whoever turned in). */
  | { type: "xp"; id: string; amount: number }
  | { type: "level-up"; id: string; level: number }
  | { type: "mastery-up"; id: string; family: string; level: number }
  /** A skill started (its move's attack/swing events follow). */
  | { type: "skill"; id: string; skill: string; slot: "skill1" | "skill2" | "ultimate" }
  | { type: "skill-unlocked"; id: string; skill: string }
  /** A talent rank was learned (talent null = every talent refunded). */
  | { type: "talent"; id: string; talent: string | null; rank: number }
  | { type: "loadout"; id: string; slot: "skill1" | "skill2" | "ultimate"; skill: string }
  /** A player killed an enemy (quests, bestiary). */
  | { type: "kill-credit"; id: string; enemy: string }
  /** A player started talking to an NPC: the UI opens the dialogue. */
  | { type: "talk"; id: string; npc: string; actor: string; dialogue: string }
  /** A player opened a chest (its loot drops follow as `drop` events). */
  | { type: "chest"; id: string; chest: string; x: number; y: number }
  | { type: "quest"; id: string; quest: string; change: "started" | "progress" | "ready" | "done" }
  /** A player stands in a portal: the host moves the party to `to` (arriving at spawn `arrive`). */
  | { type: "portal"; id: string; portal: string; to: string; arrive: string }
  /** The actor was removed from the sim (corpse faded). */
  | { type: "despawn"; id: string }
  /** A boss entered a new phase (phase index ≥ 1). */
  | { type: "boss-phase"; id: string; phase: number }
  /** A boss calls adds; the sim spawns them around it. */
  | { type: "summon"; id: string; enemy: string; count: number }
  /** An enemy came back to its spawn point. */
  | { type: "spawn"; id: string }
  | { type: "projectile"; id: string; owner: string; x: number; y: number }
  | { type: "projectile-end"; id: string; x: number; y: number };
