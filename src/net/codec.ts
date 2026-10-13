import type { ActionState, Actor } from "@/core/combat/actor";
import type { Projectile } from "@/core/combat/step";
import type { Facing } from "@/core/math/vec";
import type { SimState } from "@/core/sim/state";
import type { ActorTuple, PickupTuple, ProjectileTuple, Snapshot } from "./protocol";

/**
 * Snapshots carry only what moves every frame (positions, actions, hp); everything else comes with
 * the 1 Hz full sync. Positions are quantized to 0.1 px, speeds and hp to integers, aim to a byte.
 */

const FACINGS: Facing[] = ["down", "left", "right", "up"];
const ACTIONS: ActionState["kind"][] = ["free", "charge", "attack", "dodge", "hurt", "stagger", "dead"];
const q10 = (v: number) => Math.round(v * 10);
/** A direction as a byte (1.4° steps). */
const toByte = (v: { x: number; y: number }) => Math.round(((Math.atan2(v.y, v.x) + Math.PI) / (Math.PI * 2)) * 255) & 255;
const q100 = (v: number) => Math.round(v * 100);

const enum Flag {
  Moving = 1,
  Blocking = 2,
  Iframes = 4,
  Started = 8,
}

function encodeActor(a: Actor): ActorTuple {
  const act = a.action;
  const aimByte = toByte(a.aim);
  const dir = act.kind === "attack" || act.kind === "dodge" ? act.dir : a.aim;
  const extra = act.kind === "hurt" || act.kind === "stagger" ? q100(act.duration) : act.kind === "attack" ? q100(act.charge) : 0;
  const flags = (a.moving ? Flag.Moving : 0) | (a.blockSince !== null ? Flag.Blocking : 0) | (a.iframes > 0 ? Flag.Iframes : 0) | (act.kind === "attack" && act.started ? Flag.Started : 0);
  const tuple: ActorTuple = [a.id, q10(a.x), q10(a.y), Math.round(a.vx), Math.round(a.vy), FACINGS.indexOf(a.facing), aimByte, ACTIONS.indexOf(act.kind), "t" in act ? q100(act.t) : 0, extra, Math.round(a.hp), flags, act.kind === "attack" ? act.move : "", toByte(dir), Math.round(a.stamina * 10) / 10, q100(a.cooldowns.dodge ?? 0)];
  if (a.statuses.length) tuple.push(a.statuses.map((s) => `${s.id}:${s.stacks}:${Math.round(s.t * 10)}`).join(";"));
  return tuple;
}

export function encodeSnapshot(s: SimState, acks: Record<string, number>): Snapshot {
  return {
    tick: s.tick,
    time: Math.round(s.time * 1000) / 1000,
    acks,
    a: Object.values(s.actors).map(encodeActor),
    p: s.projectiles.map((p): ProjectileTuple => [p.id, q10(p.x), q10(p.y), Math.round(p.vx), Math.round(p.vy), p.move, p.team, p.owner]),
    k: s.pickups.map((k): PickupTuple => [k.id, q10(k.x), q10(k.y), k.item, k.count, q100(k.t)]),
  };
}

function decodeAction(t: ActorTuple): ActionState {
  const kind = ACTIONS[t[7]] ?? "free";
  const time = t[8] / 100;
  const dir = aimOf(t[13]);
  switch (kind) {
    case "free":
      return { kind };
    case "charge":
    case "dead":
      return { kind, t: time };
    case "dodge":
      return { kind, t: time, dir };
    case "hurt":
    case "stagger":
      return { kind, t: time, duration: t[9] / 100 };
    case "attack":
      return { kind, move: t[12], t: time, dir, hit: [], queued: false, charge: t[9] / 100, started: (t[11] & Flag.Started) !== 0 };
  }
}

const aimOf = (byte: number) => {
  const angle = (byte / 255) * Math.PI * 2 - Math.PI;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

/** Writes one actor's snapshot values into a mirrored actor. */
export function applyActorTuple(a: Actor, t: ActorTuple): void {
  a.x = t[1] / 10;
  a.y = t[2] / 10;
  a.vx = t[3];
  a.vy = t[4];
  a.facing = FACINGS[t[5]] ?? a.facing;
  a.aim = aimOf(t[6]);
  a.action = decodeAction(t);
  a.hp = t[10];
  a.moving = (t[11] & Flag.Moving) !== 0;
  a.blockSince = (t[11] & Flag.Blocking) !== 0 ? (a.blockSince ?? 0) : null;
  a.iframes = (t[11] & Flag.Iframes) !== 0 ? Math.max(a.iframes, 0.05) : 0;
  a.stamina = t[14];
  a.cooldowns.dodge = t[15] / 100;
  applyStatuses(a, t);
}

/** Statuses from a tuple (presentation only: ticks and power stay the host's business). */
function applyStatuses(a: Actor, t: ActorTuple): void {
  const prev = new Map(a.statuses.map((s) => [s.id, s]));
  a.statuses = (t[16] ? t[16].split(";") : []).map((part) => {
    const [id = "", stacks = "1", time = "0"] = part.split(":");
    return { ...(prev.get(id) ?? { tick: 0, power: 0, source: null }), id, stacks: Number(stacks), t: Number(time) / 10 };
  });
}

/**
 * Patches a client's mirror with a snapshot: known actors move, actors missing from the snapshot are
 * gone, unknown ones wait for the next full sync. Projectiles and pickups are replaced. `skip` = the
 * actor the client predicts itself (reconciled separately).
 */
export function applySnapshot(mirror: SimState, snap: Snapshot, skip?: string): void {
  mirror.tick = snap.tick;
  mirror.time = snap.time;
  const seen = new Set<string>();
  for (const t of snap.a) {
    seen.add(t[0]);
    const a = mirror.actors[t[0]];
    if (a && t[0] !== skip) applyActorTuple(a, t);
    else if (a) applyStatuses(a, t);
  }
  for (const id of Object.keys(mirror.actors)) if (!seen.has(id)) delete mirror.actors[id];
  const prevProjectiles = new Map(mirror.projectiles.map((p) => [p.id, p]));
  mirror.projectiles = snap.p.map(([id, x, y, vx, vy, move, team, owner]): Projectile => {
    const prev = prevProjectiles.get(id);
    return { ...(prev ?? { radius: 4, travelled: 0, range: 0, stats: { maxHp: 1, power: 0, defense: 0, critChance: 0, critMultiplier: 1, maxPoise: 0, speed: 0 } }), id, owner, team: team as Projectile["team"], move, x: x / 10, y: y / 10, vx, vy };
  });
  mirror.pickups = snap.k.map(([id, x, y, item, count, t]) => ({ id, item, count, x: x / 10, y: y / 10, vx: 0, vy: 0, t: t / 100 }));
}

/** The authoritative tuple of one actor in a snapshot. */
export const actorTuple = (snap: Snapshot, id: string) => snap.a.find((t) => t[0] === id);
