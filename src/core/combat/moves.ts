import type { Element } from "./defs";

/**
 * Attack definition shape (data lives in content/data/moves). Timings in seconds, distances in world pixels.
 */
export type Hitbox =
  /** A cone in front of the attacker: reach from the centre, total opening angle in degrees. */
  | { kind: "arc"; range: number; angle: number }
  /** A circle at `offset` px along the aim direction (0 = around the attacker). */
  | { kind: "circle"; radius: number; offset: number };

export interface Move {
  id: string;
  /** Before the hit lands (telegraphed for enemies). */
  windup: number;
  /** Hitbox is live. */
  active: number;
  /** After the hit: vulnerable, can't act (unless cancelled into the next combo step). */
  recovery: number;
  hitbox: Hitbox;
  /** Multiplier on the attacker's power. */
  damage: number;
  staminaCost: number;
  /** Knockback impulse (px/s) given to targets. */
  knockback: number;
  /** Forward impulse (px/s) on the attacker when the move becomes active. */
  lunge: number;
  /** Visual + feel weight: drives hit-stop length, shake, VFX size. */
  weight: "light" | "medium" | "heavy";
  /** Next move in the combo if attack is pressed during the recovery window. */
  next?: string;
  /** Poise damage: staggers targets whose poise drops to 0. */
  poise: number;
  /** Ranged: fires a projectile when the move becomes active instead of using the hitbox. */
  projectile?: { speed: number; radius: number; range: number };
  /** Element of the hit (weapon element overrides when the move has none). */
  element?: Element;
  /** Status a hit may apply. */
  onHit?: { status: string; chance: number };
}

/** Shared timings for the defensive actions. */
export const DODGE = { duration: 0.34, iframes: 0.26, speed: 255, staminaCost: 22, cooldown: 0.12 } as const;
/** Block values without a shield (enemies, bare-handed). Shields override them. */
export const BLOCK = {
  /** Damage taken while blocking (fraction). */
  reduction: 0.75,
  /** Pressing block this long before a hit = perfect parry. */
  parryWindow: 0.16,
  /** Stamina lost per blocked damage point. */
  staminaPerDamage: 0.9,
  moveSpeedFactor: 0.45,
} as const;
export const STAMINA = { max: 100, regenPerSec: 38, regenDelay: 0.55 } as const;
/** How long a staggered actor is helpless, and how long a perfect parry staggers the attacker. */
export const STAGGER_TIME = 0.55;
export const PARRY_STAGGER_TIME = 1.1;
export const HURT_TIME = 0.18;
export const CHARGE = { min: 0.25, full: 0.9, damageBonus: 1.2 } as const;
