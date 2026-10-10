/**
 * Attack definitions. Timings in seconds, distances in world pixels.
 * Data-shaped on purpose: M5 moves these into content JSON (weapon movesets, enemy attacks).
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
}

/** Shared timings for the defensive actions. */
export const DODGE = { duration: 0.34, iframes: 0.26, speed: 255, staminaCost: 22, cooldown: 0.12 } as const;
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

const m = (move: Move): Move => move;

/** Default sword moveset: three-hit light combo, charged heavy. */
export const MOVES: Record<string, Move> = {
  "sword-light-1": m({ id: "sword-light-1", windup: 0.07, active: 0.08, recovery: 0.2, hitbox: { kind: "arc", range: 30, angle: 140 }, damage: 1, staminaCost: 8, knockback: 90, lunge: 120, weight: "light", next: "sword-light-2", poise: 10 }),
  "sword-light-2": m({ id: "sword-light-2", windup: 0.07, active: 0.08, recovery: 0.2, hitbox: { kind: "arc", range: 30, angle: 140 }, damage: 1.1, staminaCost: 8, knockback: 100, lunge: 130, weight: "light", next: "sword-light-3", poise: 12 }),
  "sword-light-3": m({ id: "sword-light-3", windup: 0.12, active: 0.1, recovery: 0.34, hitbox: { kind: "arc", range: 36, angle: 200 }, damage: 1.6, staminaCost: 12, knockback: 220, lunge: 170, weight: "medium", poise: 30 }),
  "sword-heavy": m({ id: "sword-heavy", windup: 0.1, active: 0.12, recovery: 0.42, hitbox: { kind: "circle", radius: 34, offset: 10 }, damage: 2.2, staminaCost: 24, knockback: 300, lunge: 90, weight: "heavy", poise: 55 }),

  // Enemy attacks (telegraphed: long windups).
  "claw": m({ id: "claw", windup: 0.5, active: 0.1, recovery: 0.5, hitbox: { kind: "arc", range: 26, angle: 110 }, damage: 1, staminaCost: 0, knockback: 160, lunge: 210, weight: "medium", poise: 25 }),
  "slam": m({ id: "slam", windup: 0.85, active: 0.12, recovery: 0.8, hitbox: { kind: "circle", radius: 40, offset: 0 }, damage: 1.8, staminaCost: 0, knockback: 280, lunge: 0, weight: "heavy", poise: 60 }),
  "bolt": m({ id: "bolt", windup: 0.6, active: 0.05, recovery: 0.6, hitbox: { kind: "circle", radius: 5, offset: 0 }, damage: 1, staminaCost: 0, knockback: 120, lunge: 0, weight: "light", poise: 10, projectile: { speed: 150, radius: 4, range: 220 } }),
};

export function getMove(id: string): Move {
  const move = MOVES[id];
  if (!move) throw new Error(`Unknown move "${id}"`);
  return move;
}
