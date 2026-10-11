import type { Rng } from "../math/rng";
import { clampLength, facingOf, normalize, type Vec2 } from "../math/vec";
import type { Intent } from "../sim/intent";
import { moveAndCollide, steer, type MoveTuning } from "../sim/movement";
import { isSolidCell, type GameMap } from "../world/map";
import { isAlive, type Actor, type BufferedAction, type CombatStats, type Team } from "./actor";
import { hitboxTouches, rollDamage } from "./damage";
import { findReaction, getEnemy, getLootTable, getMove, SKILL_SLOTS, type Element } from "./defs";
import { blockOf, hitTraits, kitOf } from "./equipment";
import type { SimEvent } from "./events";
import { rollLoot } from "./loot";
import { modOf, type Modifiers } from "./modifiers";
import { castSkill, chargeUltimate } from "./skills";
import { BLOCK, CHARGE, DODGE, HURT_TIME, PARRY_STAGGER_TIME, STAGGER_TIME, STAMINA, type Move } from "./moves";
import { applyStatus, damageTakenMultOf, elementalStatus, speedMultOf, stepStatuses } from "./status";

export interface Projectile {
  id: string;
  owner: string;
  team: Team;
  move: string;
  /** Attacker stats at fire time (the owner may die before it lands). */
  stats: CombatStats;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  travelled: number;
  range: number;
}

/** The part of the sim state combat reads and writes. */
export interface CombatWorld {
  /** Sim seconds. */
  time: number;
  actors: Record<string, Actor>;
  projectiles: Projectile[];
  events: SimEvent[];
  pickups: Pickup[];
  nextId: number;
  /** Difficulty / Omens / NG+ multipliers (absent = neutral). */
  mods?: Modifiers;
}

/** Loot lying on the ground. */
export interface Pickup {
  id: string;
  item: string;
  count: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds on the ground. */
  t: number;
}

/** Invulnerability after taking an unblocked hit (players only: no stun-locks). */
const PLAYER_HIT_IFRAMES = 0.35;
const RESPAWN_IFRAMES = 1.5;
const PLAYER_RESPAWN_TIME = 3;
const CORPSE_TIME = 2.5;
/** Seconds without being hit before poise refills (at half its max per second). */
const POISE_REGEN_DELAY = 1.5;
/** Fraction of the recovery after which a queued combo input chains. */
const COMBO_CANCEL = 0.35;
/** How long a press made while busy is remembered. */
const INPUT_BUFFER = 0.15;
const ACCEL = 900;
const DECEL = 1400;
/** Slower decel while attacking/hurt so lunges and knockback slide. */
const SLIDE_DECEL = 650;
/** Extra personal space between actors: feet hitboxes are small, sprites are 32 px wide. */
const SEPARATION_PAD = 4;

const sortedIds = (w: CombatWorld) => Object.keys(w.actors).sort();
const actionMove = (a: Actor): Move | null => (a.action.kind === "attack" ? getMove(a.action.move) : null);

function spendStamina(a: Actor, cost: number): boolean {
  if (cost <= 0) return true;
  if (a.stamina < 1) return false;
  a.stamina = Math.max(0, a.stamina - cost);
  a.staminaDelay = STAMINA.regenDelay;
  return true;
}

function startAttack(w: CombatWorld, a: Actor, moveId: string, charge = 0): boolean {
  const move = getMove(moveId);
  if (!spendStamina(a, move.staminaCost)) return false;
  const dir = normalize(a.aim.x || a.aim.y ? a.aim : { x: 0, y: 1 });
  a.action = { kind: "attack", move: moveId, t: 0, dir, hit: [], queued: false, charge, started: false };
  a.blockSince = null;
  a.facing = facingOf(dir, a.facing);
  w.events.push({ type: "attack", id: a.id, move: moveId, windup: move.windup });
  return true;
}

function tryDodge(w: CombatWorld, a: Actor, move: Vec2): boolean {
  if ((a.cooldowns.dodge ?? 0) > 0 || !spendStamina(a, DODGE.staminaCost)) return false;
  const dir = normalize(move.x || move.y ? move : a.aim);
  a.action = { kind: "dodge", t: 0, dir };
  a.iframes = Math.max(a.iframes, DODGE.iframes);
  a.blockSince = null;
  w.events.push({ type: "dodge", id: a.id });
  return true;
}

const BUFFERED = ["attack", "heavy", "dodge", ...SKILL_SLOTS] as const;

/** A buffered skill press: cast it if the slot is ready (players only). */
const useSkill = (w: CombatWorld, a: Actor, pressed: (k: BufferedAction) => boolean) =>
  a.kind === "player" && SKILL_SLOTS.some((s) => pressed(s) && castSkill(w.events, a, s, (m) => startAttack(w, a, m)));

const primaryMove = (a: Actor) => (a.kind === "player" ? kitOf(a).light : getEnemy(a.type).attack);

/** Advances one actor's action state machine and moves it. Hits are resolved afterwards for everyone. */
export function stepActor(w: CombatWorld, map: GameMap, rng: Rng, a: Actor, intent: Intent, dt: number): void {
  const held = (k: Intent["held"][number]) => intent.held.includes(k);
  const move = clampLength(intent.move, 1);
  for (const k of BUFFERED) if (intent.pressed.includes(k)) a.buffered = { action: k, ttl: INPUT_BUFFER };
  if (a.buffered && (a.buffered.ttl -= dt) < 0) a.buffered = null;
  /** True when `k` was pressed recently and not yet consumed; consumes it. */
  const pressed = (k: BufferedAction) => {
    if (a.buffered?.action !== k) return false;
    a.buffered = null;
    return true;
  };

  a.iframes = Math.max(0, a.iframes - dt);
  a.sinceHit += dt;
  for (const k of Object.keys(a.cooldowns)) a.cooldowns[k] = Math.max(0, a.cooldowns[k]! - dt);
  if (isAlive(a)) {
    const lethal = stepStatuses(w.events, a, dt);
    if (lethal) kill(w, a, lethal.killer, rng);
  }
  if (a.sinceHit > POISE_REGEN_DELAY) a.poise = Math.min(a.stats.maxPoise, a.poise + a.stats.maxPoise * 0.5 * dt);

  if (isAlive(a)) {
    if (intent.aim) a.aim = normalize(intent.aim);
    else if (move.x || move.y) a.aim = normalize(move);
  }

  let wish: Vec2 = { x: 0, y: 0 };
  let speedFactor = 1;
  let decel = SLIDE_DECEL;
  const act = a.action;

  switch (act.kind) {
    case "dead":
      act.t += dt;
      break;
    case "hurt":
    case "stagger":
      act.t += dt;
      if (act.t >= act.duration) a.action = { kind: "free" };
      break;
    case "dodge": {
      act.t += dt;
      // Fast start, eased end: the roll reads as a burst.
      const k = 1 - (act.t / DODGE.duration) ** 2;
      a.vx = act.dir.x * DODGE.speed * Math.max(0.25, k);
      a.vy = act.dir.y * DODGE.speed * Math.max(0.25, k);
      if (act.t >= DODGE.duration) {
        a.action = { kind: "free" };
        a.cooldowns.dodge = DODGE.cooldown;
      }
      break;
    }
    case "charge":
      act.t += dt;
      wish = move;
      speedFactor = 0.4;
      decel = DECEL;
      if (pressed("dodge") && tryDodge(w, a, move)) break;
      if (!held("heavy")) {
        const level = Math.min(1, Math.max(0, (act.t - CHARGE.min) / (CHARGE.full - CHARGE.min)));
        if (!startAttack(w, a, kitOf(a).heavy, level)) a.action = { kind: "free" };
      }
      break;
    case "attack": {
      const m = getMove(act.move);
      act.t += dt;
      if (m.next && pressed("attack")) act.queued = true;
      if (!act.started && act.t >= m.windup) {
        act.started = true;
        a.vx = act.dir.x * m.lunge;
        a.vy = act.dir.y * m.lunge;
        w.events.push({ type: "swing", id: a.id, move: m.id, weight: m.weight, x: a.x, y: a.y, dir: act.dir });
        if (m.projectile) fireProjectile(w, a, m, act.dir);
      }
      const activeEnd = m.windup + m.active;
      if (act.t >= activeEnd + m.recovery * COMBO_CANCEL) {
        if (act.queued && m.next && startAttack(w, a, m.next)) break;
        if (pressed("dodge") && tryDodge(w, a, move)) break;
        if (useSkill(w, a, pressed)) break;
      }
      if (act.t >= activeEnd + m.recovery) a.action = { kind: "free" };
      break;
    }
    case "free": {
      decel = DECEL;
      wish = move;
      if (pressed("dodge") && tryDodge(w, a, move)) break;
      if (useSkill(w, a, pressed)) break;
      if (pressed("attack") && startAttack(w, a, primaryMove(a))) break;
      if (pressed("heavy") && a.kind === "player") {
        a.action = { kind: "charge", t: 0 };
        a.blockSince = null;
        w.events.push({ type: "charge", id: a.id });
        break;
      }
      a.blockSince = held("block") ? (a.blockSince ?? w.time) : null;
      if (a.blockSince !== null) speedFactor = BLOCK.moveSpeedFactor;
      break;
    }
  }
  if (a.action.kind !== "free") a.blockSince = null;

  // Stamina regenerates while not spending it.
  const resting = (a.action.kind === "free" || a.action.kind === "charge") && a.blockSince === null;
  if (resting) {
    a.staminaDelay -= dt;
    if (a.staminaDelay <= 0) a.stamina = Math.min(STAMINA.max, a.stamina + STAMINA.regenPerSec * dt);
  }

  if (a.action.kind !== "dodge") {
    const tuning: MoveTuning = { maxSpeed: a.stats.speed * speedFactor * speedMultOf(a), accel: ACCEL, decel };
    steer(a, wish, tuning, dt);
  }
  moveAndCollide(a, map, dt);
  a.moving = Math.hypot(a.vx, a.vy) > 8 && (a.action.kind === "free" || a.action.kind === "charge");
  if (a.action.kind === "attack") a.facing = facingOf(a.action.dir, a.facing);
  else if (isAlive(a) && a.action.kind !== "dodge") a.facing = facingOf(intent.aim ?? move, a.facing);
}

function fireProjectile(w: CombatWorld, a: Actor, m: Move, dir: Vec2): void {
  const p = m.projectile!;
  const id = `pr${w.nextId++}`;
  const x = a.x + dir.x * (a.radius + p.radius + 1);
  const y = a.y + dir.y * (a.radius + p.radius + 1) - 6;
  w.projectiles.push({ id, owner: a.id, team: a.team, move: m.id, stats: a.stats, x, y, vx: dir.x * p.speed, vy: dir.y * p.speed, radius: p.radius, travelled: 0, range: p.range });
  w.events.push({ type: "projectile", id, owner: a.id, x, y });
}

/** Live melee hitboxes touch opposing actors (each target once per swing). */
export function resolveMelee(w: CombatWorld, rng: Rng): void {
  const ids = sortedIds(w);
  for (const id of ids) {
    const a = w.actors[id]!;
    const act = a.action;
    const m = actionMove(a);
    if (act.kind !== "attack" || !m || m.projectile || !act.started || act.t > m.windup + m.active) continue;
    for (const tid of ids) {
      const target = w.actors[tid]!;
      if (target.team === a.team || target.kind === "npc" || !isAlive(target) || act.hit.includes(tid)) continue;
      if (!hitboxTouches(m.hitbox, a, act.dir, target, target.radius)) continue;
      act.hit.push(tid);
      applyHit(w, rng, { id: a.id, stats: a.stats, x: a.x, y: a.y }, target, m, act.charge, act.dir);
    }
  }
}

export function stepProjectiles(w: CombatWorld, map: GameMap, rng: Rng, dt: number): void {
  const ids = sortedIds(w);
  w.projectiles = w.projectiles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.travelled += Math.hypot(p.vx, p.vy) * dt;
    // Projectiles fly at chest height: test the wall below them (feet level).
    if (p.travelled > p.range || isSolidCell(map, Math.floor(p.x / map.tileSize), Math.floor((p.y + 6) / map.tileSize))) {
      w.events.push({ type: "projectile-end", id: p.id, x: p.x, y: p.y });
      return false;
    }
    for (const tid of ids) {
      const t = w.actors[tid]!;
      if (t.team === p.team || t.kind === "npc" || !isAlive(t)) continue;
      if (Math.hypot(t.x - p.x, t.y - 6 - p.y) > p.radius + t.radius + 2) continue;
      const dir = normalize({ x: p.vx, y: p.vy });
      applyHit(w, rng, { id: p.owner, stats: p.stats, x: p.x - dir.x * 8, y: p.y + 6 - dir.y * 8 }, t, getMove(p.move), 0, dir);
      w.events.push({ type: "projectile-end", id: p.id, x: p.x, y: p.y });
      return false;
    }
    return true;
  });
}

interface HitSource {
  id: string;
  stats: CombatStats;
  x: number;
  y: number;
}

/** Applies one hit: dodge i-frames, block / perfect parry, damage, poise, knockback, death. */
export function applyHit(w: CombatWorld, rng: Rng, src: HitSource, target: Actor, m: Move, charge: number, swingDir: Vec2): void {
  if (target.iframes > 0) return;
  const away = normalize({ x: target.x - src.x, y: target.y - src.y });
  const kdir = away.x || away.y ? away : swingDir;
  const attacker = w.actors[src.id];
  const facingAttacker = target.aim.x * -kdir.x + target.aim.y * -kdir.y > 0.2;
  const block = blockOf(target);
  const { element, onHit } = hitTraits(m, attacker);

  if (target.blockSince !== null && facingAttacker) {
    if (w.time - target.blockSince <= block.parryWindow) {
      if (attacker && isAlive(attacker) && !m.projectile) {
        attacker.action = { kind: "stagger", t: 0, duration: PARRY_STAGGER_TIME };
        attacker.vx = kdir.x * -140;
        attacker.vy = kdir.y * -140;
      }
      target.iframes = Math.max(target.iframes, 0.2);
      w.events.push({ type: "parry", attacker: src.id, target: target.id, x: (src.x + target.x) / 2, y: (src.y + target.y) / 2 });
      return;
    }
    const roll = rollDamage(src, target, m, charge, rng);
    const amount = Math.max(1, Math.round(roll.amount * (1 - block.reduction)));
    target.hp = Math.max(0, target.hp - amount);
    target.stamina -= roll.amount * block.staminaPerDamage;
    target.staminaDelay = STAMINA.regenDelay;
    target.vx += kdir.x * m.knockback * 0.4;
    target.vy += kdir.y * m.knockback * 0.4;
    w.events.push({ type: "hit", attacker: src.id, target: target.id, amount, crit: false, blocked: true, weight: m.weight, element, x: target.x, y: target.y, dir: kdir });
    if (target.stamina <= 0) {
      target.stamina = 0;
      target.blockSince = null;
      target.action = { kind: "stagger", t: 0, duration: STAGGER_TIME };
      w.events.push({ type: "guard-break", id: target.id });
    }
    if (target.hp <= 0) kill(w, target, src.id, rng);
    return;
  }

  const roll = rollDamage(src, target, m, charge, rng);
  const amount = Math.max(1, Math.round(roll.amount * resistOf(target, element) * damageTakenMultOf(target)));
  target.hp = Math.max(0, target.hp - amount);
  if (attacker?.kind === "player") chargeUltimate(attacker, amount, m.id);
  target.sinceHit = 0;
  target.poise -= m.poise * (1 + charge * 0.5);
  w.events.push({ type: "hit", attacker: src.id, target: target.id, amount, crit: roll.crit, blocked: false, weight: m.weight, element, x: target.x, y: target.y, dir: kdir });
  if (target.hp > 0 && element) elementalEffects(w, rng, src, target, element, onHit, m, charge);

  let kb = m.knockback / (1 + target.stats.maxPoise / 60);
  if (target.hp <= 0) {
    kill(w, target, src.id, rng);
    kb *= 1.4;
  } else if ((target.action as Actor["action"]).kind === "stagger") {
    // Already helpless (stunned by a reaction this very hit): keep that.
  } else if (target.poise <= 0) {
    target.poise = target.stats.maxPoise;
    target.action = { kind: "stagger", t: 0, duration: STAGGER_TIME };
    target.blockSince = null;
    w.events.push({ type: "stagger", id: target.id });
  } else if (target.kind === "player" || target.action.kind !== "attack") {
    // Enemies keep swinging through light hits (they have poise); players always flinch.
    if (target.action.kind !== "stagger") target.action = { kind: "hurt", t: 0, duration: HURT_TIME };
    target.blockSince = null;
  } else kb *= 0.5;
  if (target.kind === "player") target.iframes = Math.max(target.iframes, PLAYER_HIT_IFRAMES);
  target.vx += kdir.x * kb;
  target.vy += kdir.y * kb;
}

const resistOf = (a: Actor, element: Element | undefined) => (element && a.kind === "enemy" ? (getEnemy(a.type).resist[element] ?? 1) : 1);

/**
 * After an elemental hit: if the target carries another element, they react (bonus burst damage
 * around the target, maybe a status); otherwise the hit may apply its own status.
 */
function elementalEffects(w: CombatWorld, rng: Rng, src: HitSource, target: Actor, element: Element, onHit: { status: string; chance: number } | undefined, m: Move, charge: number): void {
  const present = elementalStatus(target);
  const reaction = present && present.element !== element ? findReaction(present.element, element) : undefined;
  if (present && reaction) {
    target.statuses.splice(present.index, 1);
    w.events.push({ type: "reaction", reaction: reaction.id, target: target.id, x: target.x, y: target.y, radius: reaction.radius });
    const power = src.stats.power * m.damage * (1 + CHARGE.damageBonus * charge);
    for (const id of sortedIds(w)) {
      const o = w.actors[id]!;
      if (o.team !== target.team || !isAlive(o)) continue;
      if (o !== target && Math.hypot(o.x - target.x, o.y - target.y) > reaction.radius + o.radius) continue;
      const amount = Math.max(1, Math.round(power * reaction.damage * resistOf(o, element)));
      o.hp = Math.max(0, o.hp - amount);
      o.poise -= reaction.poise;
      w.events.push({ type: "hit", attacker: src.id, target: o.id, amount, crit: false, blocked: false, weight: "medium", element, x: o.x, y: o.y, dir: { x: 0, y: 0 } });
      if (o.hp <= 0) kill(w, o, src.id, rng);
      else if (reaction.applies) applyStatus(w.events, o, reaction.applies, src.id, src.stats.power);
    }
    return;
  }
  if (onHit && rng.chance(onHit.chance)) applyStatus(w.events, target, onHit.status, src.id, src.stats.power);
}

function kill(w: CombatWorld, target: Actor, killer: string | null, rng: Rng): void {
  // A hit and its reaction burst can both be lethal: die (and drop loot) once.
  if (target.action.kind === "dead") return;
  target.hp = 0;
  target.action = { kind: "dead", t: 0 };
  target.blockSince = null;
  target.statuses = [];
  const def = target.kind === "enemy" ? getEnemy(target.type) : null;
  w.events.push({ type: "death", id: target.id, killer, xp: Math.round((def?.xp ?? 0) * modOf(w, "xp")) });
  if (def && killer && w.actors[killer]?.kind === "player") w.events.push({ type: "kill-credit", id: killer, enemy: target.type });
  if (!def?.loot) return;
  for (const drop of rollLoot(getLootTable(def.loot), rng, w.mods)) {
    const angle = rng.range(0, Math.PI * 2);
    const speed = rng.range(40, 90);
    const id = `pk${w.nextId++}`;
    w.pickups.push({ id, item: drop.item, count: drop.count, x: target.x, y: target.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, t: 0 });
    w.events.push({ type: "drop", id, item: drop.item, count: drop.count, x: target.x, y: target.y });
  }
}

/** Seconds before loot can be picked up (lets it scatter), magnet radius, pickup radius, lifetime. */
const PICKUP_DELAY = 0.45;
const PICKUP_MAGNET = 36;
const PICKUP_RADIUS = 10;
const PICKUP_LIFETIME = 90;

/** Loot scatters, then flies to the nearest living player and goes into their bag. */
export function stepPickups(w: CombatWorld, map: GameMap, dt: number): void {
  const players = sortedIds(w)
    .map((id) => w.actors[id]!)
    .filter((a) => a.kind === "player" && isAlive(a));
  w.pickups = w.pickups.filter((p) => {
    p.t += dt;
    if (p.t > PICKUP_LIFETIME) return false;
    const body = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, radius: 3 };
    steer(body, { x: 0, y: 0 }, { maxSpeed: 0, accel: 0, decel: 260 }, dt);
    if (p.t >= PICKUP_DELAY) {
      let best: Actor | null = null;
      let bestD = PICKUP_MAGNET;
      for (const a of players) {
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
      if (best && bestD <= PICKUP_RADIUS) {
        best.bag[p.item] = (best.bag[p.item] ?? 0) + p.count;
        w.events.push({ type: "pickup", id: p.id, actor: best.id, item: p.item, count: p.count, x: p.x, y: p.y });
        return false;
      }
      if (best) {
        body.vx = ((best.x - p.x) / bestD) * 160;
        body.vy = ((best.y - p.y) / bestD) * 160;
      }
    }
    moveAndCollide(body, map, dt);
    Object.assign(p, { x: body.x, y: body.y, vx: body.vx, vy: body.vy });
    return true;
  });
}

/** Keeps alive actors from overlapping (dodging actors pass through). */
export function separate(w: CombatWorld, map: GameMap): void {
  const list = sortedIds(w)
    .map((id) => w.actors[id]!)
    .filter((a) => isAlive(a) && a.action.kind !== "dodge");
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const overlap = a.radius + b.radius + SEPARATION_PAD - d;
      if (overlap <= 0) continue;
      const nx = d > 1e-4 ? dx / d : 1;
      const ny = d > 1e-4 ? dy / d : 0;
      nudge(a, map, -nx * overlap * 0.5, -ny * overlap * 0.5);
      nudge(b, map, nx * overlap * 0.5, ny * overlap * 0.5);
    }
  }
}

function nudge(a: Actor, map: GameMap, dx: number, dy: number): void {
  const ts = map.tileSize;
  const free = (x: number, y: number) =>
    !isSolidCell(map, Math.floor((x - a.radius) / ts), Math.floor((y - a.radius) / ts)) &&
    !isSolidCell(map, Math.floor((x + a.radius - 0.001) / ts), Math.floor((y - a.radius) / ts)) &&
    !isSolidCell(map, Math.floor((x - a.radius) / ts), Math.floor((y + a.radius - 0.001) / ts)) &&
    !isSolidCell(map, Math.floor((x + a.radius - 0.001) / ts), Math.floor((y + a.radius - 0.001) / ts));
  if (free(a.x + dx, a.y)) a.x += dx;
  if (free(a.x, a.y + dy)) a.y += dy;
}

/** Corpses fade, players respawn at home. */
export function stepLifecycle(w: CombatWorld): void {
  for (const id of sortedIds(w)) {
    const a = w.actors[id]!;
    if (a.action.kind !== "dead") continue;
    if (a.kind === "enemy" && a.action.t >= CORPSE_TIME) {
      delete w.actors[id];
      w.events.push({ type: "despawn", id });
    } else if (a.kind === "player" && a.action.t >= PLAYER_RESPAWN_TIME) {
      Object.assign(a, { x: a.home.x, y: a.home.y, vx: 0, vy: 0, hp: a.stats.maxHp, stamina: STAMINA.max, poise: a.stats.maxPoise });
      a.action = { kind: "free" };
      a.iframes = RESPAWN_IFRAMES;
      w.events.push({ type: "respawn", id });
    }
  }
}
