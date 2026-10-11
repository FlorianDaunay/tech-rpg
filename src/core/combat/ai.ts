import type { Rng } from "../math/rng";
import { modOf } from "./modifiers";
import { normalize, type Vec2 } from "../math/vec";
import { emptyIntent, type Intent } from "../sim/intent";
import { isAlive, type Actor } from "./actor";
import { getEnemy, getMove, type BossDef, type BossPhase, type PetDef } from "./defs";
import type { CombatWorld } from "./step";

/** Enemies give up and walk home beyond this distance from their spawn. */
const LEASH = 260;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** NPC idle: short strolls around home with pauses; stops and faces a player who comes close. */
export function thinkNpc(w: CombatWorld, a: Actor, rng: Rng, dt: number, wander: number): Intent {
  const intent = emptyIntent();
  const ai = a.ai!;
  ai.think -= dt;
  const near = Object.values(w.actors).find((p) => p.kind === "player" && isAlive(p) && dist(a, p) < 40);
  if (near) {
    intent.aim = normalize({ x: near.x - a.x, y: near.y - a.y });
    ai.think = Math.max(ai.think, 1);
    return intent;
  }
  if (wander <= 0) return intent;
  if (ai.think <= 0) {
    // Pick: rest (2/3) or walk a little; past half the leash, the walk heads back towards home.
    ai.think = rng.range(1.5, 4);
    ai.strafe = rng.chance(0.35) ? 1 : 0;
    const homeward = Math.atan2(a.home.y - a.y, a.home.x - a.x);
    const ang = dist(a, a.home) > wander * 0.5 ? homeward + rng.range(-0.6, 0.6) : rng.range(0, Math.PI * 2);
    ai.target = `${Math.cos(ang)},${Math.sin(ang)}`;
  }
  if (ai.strafe && ai.target) {
    // At the edge of the leash: turn for home and keep that heading (re-deciding every frame made
    // NPCs flip back and forth on the boundary).
    if (dist(a, a.home) > wander) {
      const h = normalize({ x: a.home.x - a.x, y: a.home.y - a.y });
      ai.target = `${h.x},${h.y}`;
    }
    const [x, y] = ai.target.split(",").map(Number) as [number, number];
    intent.move = { x: x * 0.45, y: y * 0.45 };
  }
  return intent;
}

/** Phase for an hp ratio: the last one whose threshold has been crossed. */
export function bossPhaseAt(boss: BossDef, hpRatio: number): number {
  let phase = 0;
  boss.phases.forEach((p, i) => {
    if (hpRatio <= p.below) phase = i;
  });
  return phase;
}

/** Enters a phase: brief invulnerable roar, speed change, summons. */
function enterPhase(w: CombatWorld, a: Actor, phase: number, p: BossPhase): void {
  const ai = a.ai!;
  ai.phase = phase;
  ai.move = null;
  ai.cooldown = Math.max(ai.cooldown, 1.2);
  a.iframes = Math.max(a.iframes, 1);
  a.poise = a.stats.maxPoise;
  a.stats.speed = a.baseStats.speed * p.speed;
  if (phase > 0) w.events.push({ type: "boss-phase", id: a.id, phase });
  if (p.summon) {
    ai.summon = p.summon.every ?? Infinity;
    w.events.push({ type: "summon", id: a.id, enemy: p.summon.enemy, count: p.summon.count });
  }
}

/** Boss brain on top of the common one: phases, weighted attack choice, periodic summons. */
function thinkBoss(w: CombatWorld, a: Actor, boss: BossDef, rng: Rng, dt: number, engaged: boolean): BossPhase {
  const ai = a.ai!;
  const want = engaged ? bossPhaseAt(boss, a.hp / a.stats.maxHp) : 0;
  if (want > ai.phase) for (let i = ai.phase + 1; i <= want; i++) enterPhase(w, a, i, boss.phases[i]!);
  else if (!engaged && a.hp >= a.stats.maxHp && ai.phase !== 0) {
    // Reset after the party wiped or fled: back to the first phase.
    ai.phase = 0;
    a.stats.speed = a.baseStats.speed * boss.phases[0]!.speed;
  }
  const phase = boss.phases[ai.phase]!;
  if (engaged && phase.summon?.every) {
    ai.summon -= dt;
    if (ai.summon <= 0) {
      ai.summon = phase.summon.every;
      w.events.push({ type: "summon", id: a.id, enemy: phase.summon.enemy, count: phase.summon.count });
    }
  }
  if (!ai.move && phase.attacks.length) ai.move = rng.weighted(phase.attacks.map((x) => [x.move, x.weight] as const));
  return phase;
}

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
  const leash = def.boss?.arena ?? LEASH;
  let target = ai.target ? w.actors[ai.target] : undefined;
  // Bosses forget whoever leaves the arena; others give up when pulled too far or the target outruns them.
  const lost = (t: Actor) => !isAlive(t) || (def.boss ? dist(t, a.home) > leash : dist(a, t) > def.aggroRange * 1.6 || homeDist > LEASH);
  if (target && lost(target)) target = undefined;
  if (!target && homeDist < leash) {
    let best = def.aggroRange;
    for (const id of Object.keys(w.actors).sort()) {
      const p = w.actors[id]!;
      if (p.kind !== "player" || !isAlive(p) || (def.boss && dist(p, a.home) > leash)) continue;
      const d = dist(a, p);
      if (d < best) {
        best = d;
        target = p;
      }
    }
  }
  ai.target = target?.id ?? null;
  const phase = def.boss ? thinkBoss(w, a, def.boss, rng, dt, !!target) : null;
  // Mobs with a moveset choose their next attack ahead (bosses choose per phase).
  if (!phase && def.moves?.length && !ai.move) ai.move = rng.weighted(def.moves.map((x) => [x.move, x.weight] as const));

  if (!target) {
    // Walk home and heal up (no cheesing by pulling enemies away and back).
    if (homeDist > 6) intent.move = normalize({ x: a.home.x - a.x, y: a.home.y - a.y });
    ai.regen += a.stats.maxHp * 0.3 * dt;
    const whole = Math.floor(ai.regen);
    ai.regen -= whole;
    a.hp = Math.min(a.stats.maxHp, a.hp + whole);
    return intent;
  }

  const to = { x: target.x - a.x, y: target.y - a.y };
  const d = Math.hypot(to.x, to.y);
  const dir = normalize(to);
  const side = { x: -dir.y * ai.strafe, y: dir.x * ai.strafe };
  intent.aim = dir;
  const canAttack = ai.cooldown <= 0 && a.action.kind === "free";
  // Bosses close to the range of the attack they chose; others use their single attack's range.
  const range = (phase?.attacks ?? def.moves)?.find((x) => x.move === ai.move)?.range ?? def.attackRange;
  const cooldown = phase ? phase.attackCooldown : def.attackCooldown;

  if (def.ai === "ranged") {
    if (d > range * 0.9) intent.move = dir;
    else if (d < 70) intent.move = { x: -dir.x, y: -dir.y };
    else intent.move = { x: side.x * 0.6, y: side.y * 0.6 };
  } else if (d > range * 0.85) {
    intent.move = dir;
  } else {
    // In range, waiting for the cooldown: circle the target, back off a little if hugging it.
    const back = d < range * 0.5 ? -0.5 : 0;
    intent.move = { x: side.x * 0.5 + dir.x * back, y: side.y * 0.5 + dir.y * back };
  }
  // A boss never steps out of its arena.
  if (def.boss && dist({ x: a.x + intent.move.x * 8, y: a.y + intent.move.y * 8 }, a.home) > leash) intent.move = normalize({ x: a.home.x - a.x, y: a.home.y - a.y });

  // Combo strings: keep pressing while the current move chains into a next one.
  if (a.action.kind === "attack" && getMove(a.action.move).next) intent.pressed.push("attack");
  if (canAttack && d <= range) {
    intent.pressed.push("attack");
    ai.cooldown = (cooldown * rng.range(0.8, 1.25)) / modOf(w, "enemyAttackRate");
  }
  return intent;
}

/** Beyond this distance from its owner a pet stops fighting and runs back (and teleports if very far). */
const PET_LEASH = 170;
export const PET_TELEPORT = 320;

/**
 * Pet brain: stay at heel, bite whatever is near the owner, come back when it strays. Like enemies,
 * it only produces an Intent; the shared action rules do the rest.
 */
export function thinkPet(w: CombatWorld, a: Actor, def: PetDef, rng: Rng, dt: number): Intent {
  const intent = emptyIntent();
  const ai = a.ai;
  const owner = a.owner ? w.actors[a.owner] : undefined;
  if (!ai || !isAlive(a) || !owner) return intent;
  ai.cooldown -= dt;
  const fromOwner = dist(a, owner);
  let target = ai.target ? w.actors[ai.target] : undefined;
  if (target && (!isAlive(target) || dist(target, owner) > def.aggroRange * 1.4 || fromOwner > PET_LEASH)) target = undefined;
  if (!target && fromOwner < PET_LEASH) {
    let best = def.aggroRange;
    for (const id of Object.keys(w.actors).sort()) {
      const e = w.actors[id]!;
      if (e.kind !== "enemy" || !isAlive(e)) continue;
      const d = dist(e, owner);
      if (d < best) {
        best = d;
        target = e;
      }
    }
  }
  ai.target = target?.id ?? null;
  if (!target) {
    // Heel: trot to a spot just behind the owner, idle when there.
    if (fromOwner > 34) intent.move = normalize({ x: owner.x - a.x, y: owner.y - a.y });
    else if (fromOwner > 22) intent.move = scaleTo(normalize({ x: owner.x - a.x, y: owner.y - a.y }), 0.5);
    return intent;
  }
  const to = { x: target.x - a.x, y: target.y - a.y };
  const d = Math.hypot(to.x, to.y);
  const dir = normalize(to);
  intent.aim = dir;
  if (d > def.attackRange * 0.85) intent.move = dir;
  else if (d < def.attackRange * 0.4) intent.move = { x: -dir.x * 0.5, y: -dir.y * 0.5 };
  if (ai.cooldown <= 0 && a.action.kind === "free" && d <= def.attackRange) {
    intent.pressed.push("attack");
    ai.cooldown = def.attackCooldown * rng.range(0.85, 1.2);
  }
  return intent;
}

const scaleTo = (v: Vec2, k: number) => ({ x: v.x * k, y: v.y * k });
