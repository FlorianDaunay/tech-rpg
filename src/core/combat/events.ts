import type { Vec2 } from "../math/vec";
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
      x: number;
      y: number;
      dir: Vec2;
    }
  /** Perfect parry: the attacker is staggered (slow-mo counter window). */
  | { type: "parry"; attacker: string; target: string; x: number; y: number }
  | { type: "guard-break"; id: string }
  | { type: "stagger"; id: string }
  | { type: "dodge"; id: string }
  | { type: "death"; id: string; killer: string | null; xp: number }
  | { type: "respawn"; id: string }
  /** The actor was removed from the sim (corpse faded). */
  | { type: "despawn"; id: string }
  | { type: "projectile"; id: string; owner: string; x: number; y: number }
  | { type: "projectile-end"; id: string; x: number; y: number };
