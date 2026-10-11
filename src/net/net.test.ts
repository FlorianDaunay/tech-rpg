import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import { emptyIntent, type Intent } from "@/core/sim/intent";
import { createSim, spawnEnemy, spawnPlayer, stepSim, type SimState } from "@/core/sim/state";
import type { GameMap } from "@/core/world/map";
import { actorTuple, applySnapshot, encodeSnapshot } from "./codec";
import { InputQueue, PendingInputs, REDUNDANCY } from "./inputs";
import { INTERP_DELAY_MS, InterpBuffer } from "./interp";
import { reconcile } from "./predict";

beforeAll(registerContent);

function room(): GameMap {
  const n = 40;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns: [], portals: [], lights: [] };
}

const walk = (x: number, y: number, pressed: Intent["pressed"] = []): Intent => ({ ...emptyIntent(), move: { x, y }, pressed });
const clone = (s: SimState): SimState => structuredClone(s);

describe("snapshot codec", () => {
  it("round-trips positions (0.1 px), actions, hp, projectiles and pickups; despawns vanish", () => {
    const map = room();
    const host = createSim("room", 1);
    spawnPlayer(host, "p1", "x", 300, 300, { weapon: "initiate-blade" });
    const e = spawnEnemy(host, "hollow-shade", 330, 300);
    for (let i = 0; i < 20; i++) stepSim(host, map, { p1: walk(1, 0.3, i === 5 ? ["attack"] : []) });
    const mirror = clone(host);
    for (let i = 0; i < 10; i++) stepSim(host, map, { p1: walk(-0.5, 1) });
    host.pickups.push({ id: "pk1", item: "gold", count: 3, x: 10.04, y: 20.06, vx: 0, vy: 0, t: 1.234 });
    delete host.actors[e.id];
    const snap = JSON.parse(JSON.stringify(encodeSnapshot(host, { p2: 7 })));
    applySnapshot(mirror, snap);
    const a = mirror.actors.p1!;
    const h = host.actors.p1!;
    expect(Math.abs(a.x - h.x)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(a.y - h.y)).toBeLessThanOrEqual(0.05);
    expect(a.action.kind).toBe(h.action.kind);
    expect(a.hp).toBe(h.hp);
    expect(a.facing).toBe(h.facing);
    expect(mirror.actors[e.id]).toBeUndefined();
    expect(mirror.pickups[0]).toMatchObject({ id: "pk1", item: "gold", count: 3, x: 10, y: 20.1 });
    expect(mirror.tick).toBe(host.tick);
  });

  it("is small: well under 2 KB for a busy map", () => {
    const host = createSim("room", 1);
    for (let i = 0; i < 4; i++) spawnPlayer(host, `p${i + 1}`, "x", 100 + i * 20, 100);
    for (let i = 0; i < 20; i++) spawnEnemy(host, "hollow-shade", 200 + i * 10, 300);
    expect(JSON.stringify(encodeSnapshot(host, {})).length).toBeLessThan(2000);
  });
});

describe("inputs", () => {
  it("the host applies inputs in order once, keeps moving but never repeats a press when starved", () => {
    const q = new InputQueue();
    q.receive([{ seq: 2, intent: walk(1, 0, ["attack"]) }, { seq: 1, intent: walk(1, 0) }]);
    q.receive([{ seq: 1, intent: walk(1, 0) }, { seq: 2, intent: walk(1, 0, ["attack"]) }, { seq: 3, intent: walk(0, 1) }]);
    expect(q.next().pressed).toEqual([]);
    expect(q.next().pressed).toEqual(["attack"]);
    expect(q.next().move).toEqual({ x: 0, y: 1 });
    expect(q.acked).toBe(3);
    const starved = q.next();
    expect(starved.move).toEqual({ x: 0, y: 1 });
    expect(starved.pressed).toEqual([]);
    q.receive([{ seq: 2, intent: walk(1, 0, ["attack"]) }]);
    expect(q.next().pressed).toEqual([]);
  });

  it("the client resends the newest few and replays only what the host hasn't applied", () => {
    const p = new PendingInputs();
    for (let i = 0; i < 6; i++) p.add(walk(1, 0));
    expect(p.packet().map((i) => i.seq)).toEqual([4, 5, 6].slice(-REDUNDANCY));
    expect(p.ack(4).map((i) => i.seq)).toEqual([5, 6]);
  });
});

describe("prediction", () => {
  it("replaying unacknowledged inputs on the host's state lands where the host will be", () => {
    const map = room();
    const host = createSim("room", 1);
    spawnPlayer(host, "p1", "x", 300, 300);
    const client = clone(host);
    const pending = new PendingInputs();
    const inputs = Array.from({ length: 30 }, (_, i) => walk(Math.cos(i / 5), Math.sin(i / 5), i === 12 ? ["dodge"] : []));
    // The client predicts all 30; the host has only applied the first 20 when it snapshots.
    for (const intent of inputs) pending.add(intent);
    for (let i = 0; i < 20; i++) stepSim(host, map, { p1: inputs[i]! });
    const snap = encodeSnapshot(host, { p1: 20 });
    const me = client.actors.p1!;
    reconcile(client, map, me, actorTuple(snap, "p1")!, pending.ack(20));
    for (let i = 20; i < 30; i++) stepSim(host, map, { p1: inputs[i]! });
    expect(Math.hypot(me.x - host.actors.p1!.x, me.y - host.actors.p1!.y)).toBeLessThan(1.5);
  });
});

describe("interpolation", () => {
  it("shows remote actors a little in the past, between two samples, never beyond the newest", () => {
    const b = new InterpBuffer();
    b.push("e", 1000, 0, 0);
    b.push("e", 1050, 10, 0);
    b.push("e", 1100, 20, 0);
    expect(b.at("e", 1075 + INTERP_DELAY_MS)).toEqual({ x: 15, y: 0 });
    expect(b.at("e", 5000)).toEqual({ x: 20, y: 0 });
    expect(b.at("e", 900)).toEqual({ x: 0, y: 0 });
    b.push("e", 1150, 500, 500); // teleport: no smear across the map
    expect(b.at("e", 1150 + INTERP_DELAY_MS)).toEqual({ x: 500, y: 500 });
    b.retain(new Set());
    expect(b.at("e", 2000)).toBeNull();
  });
});

