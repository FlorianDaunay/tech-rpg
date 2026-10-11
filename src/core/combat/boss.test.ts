import { beforeAll, describe, expect, it } from "vitest";
import { combatData } from "@/content/combat";
import { registerContent } from "@/content/boot";
import type { GameMap } from "../world/map";
import { emptyIntent, type Intent } from "../sim/intent";
import { arenaLocked, createSim, SIM_DT, spawnEnemy, spawnPlayer, stepSim, type SimState } from "../sim/state";
import { bossPhaseAt } from "./ai";
import { registerCombatData, type BossDef } from "./defs";
import type { SimEvent } from "./events";

const BOSS: BossDef = {
  arena: 150,
  flag: "test-boss-defeated",
  phases: [
    { below: 1, attacks: [{ move: "slam", weight: 1, range: 34 }], attackCooldown: 1.5, speed: 1 },
    { below: 0.5, attacks: [{ move: "slam", weight: 1, range: 34 }, { move: "claw", weight: 1, range: 30 }], attackCooldown: 1, speed: 1.3, summon: { enemy: "hollow-shade", count: 2 } },
  ],
};

beforeAll(() => {
  registerContent();
  const data = combatData();
  data.enemies["test-boss"] = { ...data.enemies["hollowed-warden"]!, id: "test-boss", boss: BOSS };
  registerCombatData(data);
});

function room(portal = false): GameMap {
  const n = 40;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  const portals = portal ? [{ id: "out", x: 280, y: 380, w: 40, h: 40, to: "elsewhere", arrive: "in" }] : [];
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns: [], portals, lights: [] };
}

function run(sim: SimState, map: GameMap, seconds: number, intent: () => Intent = emptyIntent): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    stepSim(sim, map, { p1: intent() });
    events.push(...sim.events);
  }
  return events;
}

describe("bosses", () => {
  it("phase follows the hp thresholds", () => {
    expect(bossPhaseAt(BOSS, 1)).toBe(0);
    expect(bossPhaseAt(BOSS, 0.51)).toBe(0);
    expect(bossPhaseAt(BOSS, 0.5)).toBe(1);
    expect(bossPhaseAt(BOSS, 0.1)).toBe(1);
  });

  it("crossing a threshold while engaged: roar (phase event, i-frames), faster, adds summoned", () => {
    const map = room();
    const sim = createSim("room", 1);
    spawnPlayer(sim, "p1", "x", 300, 300);
    const boss = spawnEnemy(sim, "test-boss", 360, 300);
    run(sim, map, 0.2);
    expect(boss.ai!.target).toBe("p1");
    boss.hp = Math.floor(boss.stats.maxHp * 0.4);
    const events = run(sim, map, 0.1);
    expect(events.some((e) => e.type === "boss-phase" && e.phase === 1)).toBe(true);
    expect(boss.stats.speed).toBeCloseTo(boss.baseStats.speed * 1.3);
    expect(Object.values(sim.actors).filter((a) => a.type === "hollow-shade")).toHaveLength(2);
  });

  it("the arena seals while the boss fights, and opens again once it falls", () => {
    const map = room(true);
    const sim = createSim("room", 1);
    spawnPlayer(sim, "p1", "x", 300, 400);
    const boss = spawnEnemy(sim, "test-boss", 330, 330);
    let events = run(sim, map, 0.3);
    expect(arenaLocked(sim)).toBe(true);
    expect(events.some((e) => e.type === "portal")).toBe(false);
    boss.hp = 0;
    boss.action = { kind: "dead", t: 0 };
    events = run(sim, map, 0.1);
    expect(arenaLocked(sim)).toBe(false);
    expect(events.some((e) => e.type === "portal")).toBe(true);
  });

  it("forgets a player who leaves the arena, heals back and resets to the first phase", () => {
    const map = room();
    const sim = createSim("room", 1);
    const p = spawnPlayer(sim, "p1", "x", 300, 300);
    const boss = spawnEnemy(sim, "test-boss", 360, 300);
    run(sim, map, 0.2);
    boss.hp = Math.floor(boss.stats.maxHp * 0.4);
    run(sim, map, 0.1);
    expect(boss.ai!.phase).toBe(1);
    Object.assign(p, { x: 1000, y: 1000 });
    run(sim, map, 6);
    expect(boss.ai!.target).toBeNull();
    expect(boss.hp).toBe(boss.stats.maxHp);
    expect(boss.ai!.phase).toBe(0);
    expect(Math.hypot(boss.x - boss.home.x, boss.y - boss.home.y)).toBeLessThan(BOSS.arena);
  });

  it("its fall gives every player the story flag", () => {
    const map = room();
    const sim = createSim("room", 1);
    const p = spawnPlayer(sim, "p1", "x", 300, 300);
    const boss = spawnEnemy(sim, "test-boss", 318, 300);
    // Already in its last phase (entering one grants a second of invulnerability).
    Object.assign(boss.ai!, { phase: 1, cooldown: 99 });
    boss.hp = 1;
    run(sim, map, 1, () => ({ ...emptyIntent(), aim: { x: 1, y: 0 }, pressed: ["attack"] }));
    expect(boss.action.kind).toBe("dead");
    expect(p.progress!.flags).toContain("test-boss-defeated");
  });
});
