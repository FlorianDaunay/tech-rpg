import type { Rng } from "../math/rng";
import type { Vec2 } from "../math/vec";
import type { Actor } from "./actor";
import { CHARGE, type Hitbox, type Move } from "./moves";

export interface DamageRoll {
  amount: number;
  crit: boolean;
}

/** Damage of one hit before blocking. ±8% variance so numbers feel alive; always ≥ 1. */
export function rollDamage(attacker: Pick<Actor, "stats">, target: Pick<Actor, "stats">, move: Move, charge: number, rng: Rng): DamageRoll {
  const chargeBonus = 1 + CHARGE.damageBonus * charge;
  const base = attacker.stats.power * move.damage * chargeBonus;
  const mitigated = (base * 100) / (100 + target.stats.defense);
  const crit = rng.chance(attacker.stats.critChance);
  const variance = rng.range(0.92, 1.08);
  return { amount: Math.max(1, Math.round(mitigated * variance * (crit ? attacker.stats.critMultiplier : 1))), crit };
}

/** Does a hitbox swung from `origin` towards `dir` touch a circle of `radius` at `target`? */
export function hitboxTouches(hitbox: Hitbox, origin: Vec2, dir: Vec2, target: Vec2, radius: number): boolean {
  if (hitbox.kind === "circle") {
    const cx = origin.x + dir.x * hitbox.offset;
    const cy = origin.y + dir.y * hitbox.offset;
    return Math.hypot(target.x - cx, target.y - cy) <= hitbox.radius + radius;
  }
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist > hitbox.range + radius) return false;
  if (dist < radius + 4) return true; // overlapping: always a hit
  const cos = (dx * dir.x + dy * dir.y) / dist;
  // Widen the cone by the target's angular size so big targets at the edge still count.
  const half = (hitbox.angle / 2) * (Math.PI / 180) + Math.atan2(radius, dist);
  return cos >= Math.cos(Math.min(Math.PI, half));
}
