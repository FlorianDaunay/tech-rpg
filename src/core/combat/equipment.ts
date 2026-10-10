import type { Actor } from "./actor";
import { getShield, getWeapon, type ShieldDef } from "./defs";
import { BLOCK, type Move } from "./moves";

export const UNARMED = { light: "sword-light-1", heavy: "sword-heavy" } as const;

/** Equips a weapon/shield (null = none) and recomputes stats from the base stats. Keeps the hp ratio. */
export function equip(a: Actor, weapon: string | null, shield: string | null): void {
  const ratio = a.hp / a.stats.maxHp;
  a.weapon = weapon;
  a.shield = shield;
  const s = { ...a.baseStats };
  if (weapon) {
    const b = getWeapon(weapon).bonus;
    s.power += b.power ?? 0;
    s.critChance += b.critChance ?? 0;
    s.critMultiplier += b.critMultiplier ?? 0;
    s.speed += b.speed ?? 0;
  }
  if (shield) s.defense += getShield(shield).defense;
  a.stats = s;
  a.hp = Math.max(1, Math.round(s.maxHp * ratio));
}

/** Moves the actor's light/heavy buttons start. */
export function kitOf(a: Actor): { light: string; heavy: string } {
  return a.weapon ? getWeapon(a.weapon) : UNARMED;
}

/** Blocking values: the shield's, or the bare defaults. */
export function blockOf(a: Actor): Pick<ShieldDef, "reduction" | "parryWindow" | "staminaPerDamage"> {
  return a.shield ? getShield(a.shield) : BLOCK;
}

/** Element and on-hit status of a hit: the move's own, else the attacker's weapon's. */
export function hitTraits(m: Move, attacker: Actor | undefined) {
  const w = attacker?.weapon ? getWeapon(attacker.weapon) : undefined;
  return { element: m.element ?? w?.element, onHit: m.onHit ?? w?.onHit };
}
