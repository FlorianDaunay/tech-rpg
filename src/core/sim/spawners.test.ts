import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import type { SimEvent } from "../combat/events";
import type { GameMap, MapSpawn } from "../world/map";
import { emptyIntent } from "./intent";
import { createSim, populateMap, RESPAWN_CLEARANCE, SIM_DT, spawnPlayer, stepSim, type SimState } from "./state";

beforeAll(registerContent);

/** A big empty room (32 px cells) with the given spawns. */
function room(spawns: MapSpawn[]): GameMap {
  const n = 40;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns, portals: [], lights: [] };
}

function run(sim: SimState, map: GameMap, seconds: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    stepSim(sim, map, { p1: emptyIntent() });
    events.push(...sim.events);
  }
  return events;
}

const enemyAt = (sim: SimState) => Object.values(sim.actors).filter((a) => a.kind === "enemy" && a.action.kind !== "dead");
/** Removes an enemy as if it died long ago (corpse gone). */
const slay = (sim: SimState, id: string) => delete sim.actors[id];

describe("enemy respawn", () => {
  const far = { x: 1000, y: 1000 };

  it("a slain enemy comes back after its delay, at its spawn point", () => {
    const map = room([{ id: "s1", kind: "enemy", ref: "hollow-shade", x: 200, y: 200, respawn: 10 }]);
    const sim = createSim("room", 1);
    spawnPlayer(sim, "p1", "x", far.x, far.y);
    populateMap(sim, map);
    slay(sim, enemyAt(sim)[0]!.id);
    run(sim, map, 9);
    expect(enemyAt(sim)).toHaveLength(0);
    const events = run(sim, map, 1.1);
    expect(enemyAt(sim)).toHaveLength(1);
    expect(events.some((e) => e.type === "spawn")).toBe(true);
  });

  it("waits while a player stands near the spawn point", () => {
    const map = room([{ id: "s1", kind: "enemy", ref: "hollow-shade", x: 200, y: 200, respawn: 1 }]);
    const sim = createSim("room", 1);
    const p = spawnPlayer(sim, "p1", "x", 200 + RESPAWN_CLEARANCE / 2, 200);
    populateMap(sim, map);
    slay(sim, enemyAt(sim)[0]!.id);
    run(sim, map, 3);
    expect(enemyAt(sim)).toHaveLength(0);
    Object.assign(p, far);
    run(sim, map, 0.1);
    expect(enemyAt(sim)).toHaveLength(1);
  });

  it("one-time spawns stay dead, are recorded in progress and skipped on the next visit", () => {
    const map = room([
      { id: "boss", kind: "enemy", ref: "hollowed-warden", x: 200, y: 200, respawn: "never" },
      { id: "s1", kind: "enemy", ref: "hollow-shade", x: 400, y: 400 },
    ]);
    const sim = createSim("room", 1);
    const p = spawnPlayer(sim, "p1", "x", far.x, far.y);
    populateMap(sim, map);
    const boss = enemyAt(sim).find((a) => a.type === "hollowed-warden")!;
    slay(sim, boss.id);
    run(sim, map, 600);
    expect(enemyAt(sim).some((a) => a.type === "hollowed-warden")).toBe(false);
    expect(p.progress!.cleared).toEqual(["room:boss"]);

    const again = createSim("room", 2);
    spawnPlayer(again, "p1", "x", far.x, far.y);
    populateMap(again, map, new Set(p.progress!.cleared));
    expect(enemyAt(again).map((a) => a.type)).toEqual(["hollow-shade"]);
  });

  it("spawns without a delay use the zone default", () => {
    const map = room([{ id: "s1", kind: "enemy", ref: "hollow-shade", x: 200, y: 200 }]);
    const sim = createSim("room", 1);
    spawnPlayer(sim, "p1", "x", far.x, far.y);
    populateMap(sim, map, new Set(), 30);
    expect(sim.spawners[0]!.every).toBe(30);
  });
});
