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
  /** A player killed an enemy (quests, bestiary). */
  | { type: "kill-credit"; id: string; enemy: string }
  /** A player started talking to an NPC: the UI opens the dialogue. */
  | { type: "talk"; id: string; npc: string; actor: string; dialogue: string }
  | { type: "quest"; id: string; quest: string; change: "started" | "progress" | "ready" | "done" }
  /** A player stands in a portal: the host moves the party to `to` (arriving at spawn `arrive`). */
  | { type: "portal"; id: string; portal: string; to: string; arrive: string }
  /** The actor was removed from the sim (corpse faded). */
  | { type: "despawn"; id: string }
  | { type: "projectile"; id: string; owner: string; x: number; y: number }
  | { type: "projectile-end"; id: string; x: number; y: number };
