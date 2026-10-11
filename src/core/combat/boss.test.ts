import { beforeAll, describe, expect, it } from "vitest";
import { combatData } from "@/content/combat";
import { registerContent } from "@/content/boot";
import type { GameMap } from "../world/map";
import { emptyIntent, type Intent } from "../sim/intent";
import { arenaLocked, createSim, SIM_DT, spawnEnemy, spawnPlayer, stepSim, type SimState } from "../sim/state";
import { bossPhaseAt } from "./ai";
import { registerCombatData, type BossDef } from "./defs";
import type { SimEvent } from "./events";
import { questState, trackProgress } from "../narrative/progress";

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

  it("shades elsewhere on the map don't use up the summon cap", () => {
    const map = room();
    const sim = createSim("room", 1);
    spawnPlayer(sim, "p1", "x", 300, 300);
    spawnEnemy(sim, "hollow-shade", 1100, 1100);
    spawnEnemy(sim, "hollow-shade", 1150, 1100);
    const boss = spawnEnemy(sim, "test-boss", 360, 300);
    run(sim, map, 0.2);
    boss.hp = Math.floor(boss.stats.maxHp * 0.4);
    run(sim, map, 0.1);
    const near = Object.values(sim.actors).filter((a) => a.type === "hollow-shade" && Math.hypot(a.x - boss.home.x, a.y - boss.home.y) <= BOSS.arena);
    expect(near).toHaveLength(2);
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

  it("the wall keeps the fighter in and everyone else out", () => {
    const map = room();
    const sim = createSim("room", 1);
    const p = spawnPlayer(sim, "p1", "x", 300, 300);
    const late = spawnPlayer(sim, "p2", "x", 600, 300);
    const boss = spawnEnemy(sim, "test-boss", 360, 300);
    boss.ai!.cooldown = 99;
    const events = run(sim, map, 0.2);
    expect(events.some((e) => e.type === "arena" && e.sealed)).toBe(true);
    const walk = (dx: number): Intent => ({ ...emptyIntent(), move: { x: dx, y: 0 } });
    // p1 runs away from the boss (west), p2 runs at it (west): neither crosses the wall.
    for (let i = 0; i < 240; i++) stepSim(sim, map, { p1: walk(-1), p2: walk(-1) });
    expect(Math.hypot(p.x - boss.home.x, p.y - boss.home.y)).toBeLessThanOrEqual(BOSS.arena);
    expect(Math.hypot(late.x - boss.home.x, late.y - boss.home.y)).toBeGreaterThanOrEqual(BOSS.arena);
  });

  it("if the fighter falls, the wall opens and the boss heals back to its first phase", () => {
    const map = room();
    const sim = createSim("room", 1);
    const p = spawnPlayer(sim, "p1", "x", 300, 300);
    p.home = { x: 1000, y: 1000 }; // respawn point outside the arena
    const boss = spawnEnemy(sim, "test-boss", 360, 300);
    run(sim, map, 0.2);
    boss.hp = Math.floor(boss.stats.maxHp * 0.4);
    run(sim, map, 0.1);
    expect(boss.ai!.phase).toBe(1);
    const adds = Object.values(sim.actors).filter((a) => a.type === "hollow-shade").map((a) => a.id);
    p.hp = 0;
    p.action = { kind: "dead", t: 0 };
    // At once: the wall falls, the boss is whole and home again, its adds are gone.
    const first = run(sim, map, 0.05);
    expect(first.some((e) => e.type === "arena" && !e.sealed)).toBe(true);
    expect(arenaLocked(sim)).toBe(false);
    expect(boss.hp).toBe(boss.stats.maxHp);
    expect({ x: boss.x, y: boss.y }).toEqual(boss.home);
    for (const id of adds) expect(sim.actors[id]).toBeUndefined();
    run(sim, map, 8);
    expect(boss.ai!.target).toBeNull();
    expect(boss.ai!.phase).toBe(0);
    // Respawned just outside the wall on the way in (towards home), not back at the entrance.
    const fromBoss = Math.hypot(p.x - boss.home.x, p.y - boss.home.y);
    expect(fromBoss).toBeGreaterThan(BOSS.arena);
    expect(fromBoss).toBeLessThan(BOSS.arena + 80);
    expect(p.x > boss.home.x && p.y > boss.home.y).toBe(true);
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

  it("Heralds slain before the quest was taken still count (flag objectives)", () => {
    const sim = createSim("room", 1);
    const p = spawnPlayer(sim, "p1", "x", 0, 0);
    const story = { id: p.id, bag: p.bag, progress: p.progress! };
    p.progress!.flags.push("herald-weaver-defeated", "herald-shroud-defeated", "herald-maw-defeated");
    p.progress!.quests["the-four-heralds"] = { done: false, counts: {} };
    const events: SimEvent[] = [];
    trackProgress(events, story, "room");
    expect(questState(story, "the-four-heralds")).toBe("active");
    expect(events.filter((e) => e.type === "quest")).toHaveLength(1);
    p.progress!.flags.push("herald-vaelgor-defeated");
    const more: SimEvent[] = [];
    trackProgress(more, story, "room");
    expect(questState(story, "the-four-heralds")).toBe("ready");
    expect(more.some((e) => e.type === "quest" && e.change === "ready")).toBe(true);
    const again: SimEvent[] = [];
    trackProgress(again, story, "room");
    expect(again).toEqual([]);
  });
});
