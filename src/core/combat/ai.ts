import type { Rng } from "../math/rng";
import { normalize, type Vec2 } from "../math/vec";
import { emptyIntent, type Intent } from "../sim/intent";
import { isAlive, type Actor } from "./actor";
import { getEnemy } from "./enemies";
import type { CombatWorld } from "./step";

/** Enemies give up and walk home beyond this distance from their spawn. */
const LEASH = 260;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Enemy brain: turns the world into an Intent, exactly like a player's input. The same action
 * state machine then runs for both, so enemies obey the same rules (windups, stagger, knockback).
 */
export function thinkEnemy(w: CombatWorld, a: Actor, rng: Rng, dt: number): Intent {
  const intent = emptyIntent();
  const ai = a.ai;
  if (!ai || !isAlive(a)) return intent;
  const def = getEnemy(a.type);
  ai.cooldown -= dt;
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = rng.range(1, 2.5);
    ai.strafe = rng.chance(0.5) ? 1 : -1;
  }

  const homeDist = dist(a, a.home);
  let target = ai.target ? w.actors[ai.target] : undefined;
  if (target && (!isAlive(target) || dist(a, target) > def.aggroRange * 1.6 || homeDist > LEASH)) target = undefined;
  if (!target && homeDist < LEASH) {
    let best = def.aggroRange;
    for (const id of Object.keys(w.actors).sort()) {
      const p = w.actors[id]!;
      if (p.team === a.team || !isAlive(p)) continue;
      const d = dist(a, p);
      if (d < best) {
        best = d;
        target = p;
      }
    }
  }
  ai.target = target?.id ?? null;

  if (!target) {
    // Walk home and heal up (no cheesing by pulling enemies away and back).
    if (homeDist > 6) intent.move = normalize({ x: a.home.x - a.x, y: a.home.y - a.y });
    a.hp = Math.min(a.stats.maxHp, a.hp + a.stats.maxHp * 0.3 * dt);
    return intent;
  }

  const to = { x: target.x - a.x, y: target.y - a.y };
  const d = Math.hypot(to.x, to.y);
  const dir = normalize(to);
  const side = { x: -dir.y * ai.strafe, y: dir.x * ai.strafe };
  intent.aim = dir;
  const canAttack = ai.cooldown <= 0 && a.action.kind === "free";

  if (def.ai === "ranged") {
    if (d > def.attackRange * 0.9) intent.move = dir;
    else if (d < 70) intent.move = { x: -dir.x, y: -dir.y };
    else intent.move = { x: side.x * 0.6, y: side.y * 0.6 };
  } else if (d > def.attackRange * 0.85) {
    intent.move = dir;
  } else {
    // In range, waiting for the cooldown: circle the target, back off a little if hugging it.
    const back = d < def.attackRange * 0.5 ? -0.5 : 0;
    intent.move = { x: side.x * 0.5 + dir.x * back, y: side.y * 0.5 + dir.y * back };
  }

  if (canAttack && d <= def.attackRange) {
    intent.pressed.push("attack");
    ai.cooldown = def.attackCooldown * rng.range(0.8, 1.25);
  }
  return intent;
}
