import { describe, expect, it } from "vitest";
import type { Action, Intent } from "../sim/intent";
import { createSim, spawnEnemy, spawnPlayer, stepSim, type SimState } from "../sim/state";
import type { GameMap } from "../world/map";
import type { SimEvent } from "./events";
import { BLOCK, DODGE, getMove, STAMINA } from "./moves";

/** 16×16 open room with a solid border. */
function room(): GameMap {
  const n = 16;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns: [] };
}

const intent = (opts: { held?: Action[]; pressed?: Action[]; aim?: { x: number; y: number }; move?: { x: number; y: number } } = {}): Intent => ({
  move: opts.move ?? { x: 0, y: 0 },
  aim: opts.aim ?? null,
  held: opts.held ?? [],
  pressed: opts.pressed ?? [],
});

function run(sim: SimState, map: GameMap, steps: number, input: (i: number) => Intent = () => intent()): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    stepSim(sim, map, { p1: input(i) });
    events.push(...sim.events);
  }
  return events;
}

function setup(enemy = "hollow-shade", gap = 22) {
  const map = room();
  const sim = createSim("room", 1234);
  const p = spawnPlayer(sim, "p1", "x", 200, 200);
  const e = spawnEnemy(sim, enemy, 200 + gap, 200);
  e.ai!.cooldown = 99; // passive unless a test wants it to attack
  return { map, sim, p, e };
}

describe("combat", () => {
  it("a light attack hits once per swing and spends stamina", () => {
    const { map, sim, p, e } = setup();
    const events = run(sim, map, 30, (i) => intent({ pressed: i === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
    const hits = events.filter((ev) => ev.type === "hit");
    expect(hits).toHaveLength(1);
    expect(e.hp).toBeLessThan(e.stats.maxHp);
    expect(p.stamina).toBeLessThan(STAMINA.max);
  });

  it("chains the three-hit combo when attack is mashed", () => {
    const { map, sim, e } = setup("grave-brute");
    e.stats = { ...e.stats, maxHp: 9999 };
    e.hp = 9999;
    const events = run(sim, map, 90, (i) => intent({ pressed: i % 6 === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
    const moves = events.filter((ev) => ev.type === "swing" && ev.id === "p1").map((ev) => (ev as { move: string }).move);
    expect(moves.slice(0, 3)).toEqual(["sword-light-1", "sword-light-2", "sword-light-3"]);
  });

  it("is deterministic for the same seed and inputs", () => {
    const play = () => {
      const { map, sim } = setup();
      run(sim, map, 120, (i) => intent({ pressed: i % 20 === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
      return JSON.stringify(sim);
    };
    expect(play()).toBe(play());
  });

  it("dodge i-frames avoid an enemy hit", () => {
    const { map, sim, p, e } = setup();
    e.ai!.cooldown = 0;
    const windup = getMove("claw").windup;
    // Roll away just before the claw lands.
    const dodgeAt = Math.round((windup - 0.05) * 60);
    run(sim, map, 60, (i) => intent({ pressed: i === dodgeAt ? ["dodge"] : [], move: i === dodgeAt ? { x: -1, y: 0 } : { x: 0, y: 0 } }));
    expect(p.hp).toBe(p.stats.maxHp);
    expect(DODGE.iframes).toBeGreaterThan(0);
  });

  it("blocking reduces damage and a perfect parry staggers the attacker", () => {
    const blockedRun = (raiseAtStep: number) => {
      const { map, sim, p, e } = setup();
      e.ai!.cooldown = 0;
      const events = run(sim, map, 50, (i) => intent({ held: i >= raiseAtStep ? ["block"] : [], aim: { x: 1, y: 0 } }));
      return { p, e, events };
    };
    // Raised long before the hit: a plain block.
    const block = blockedRun(0);
    const hit = block.events.find((ev) => ev.type === "hit");
    expect(hit && hit.type === "hit" && hit.blocked).toBe(true);
    expect(block.p.hp).toBeGreaterThan(block.p.stats.maxHp - 6);
    // Raised just before the claw becomes active: perfect parry.
    const activeStep = Math.ceil(getMove("claw").windup * 60);
    const parry = blockedRun(activeStep - Math.floor(BLOCK.parryWindow * 60) + 2);
    expect(parry.events.some((ev) => ev.type === "parry")).toBe(true);
    expect(parry.p.hp).toBe(parry.p.stats.maxHp);
    expect(parry.e.action.kind).toBe("stagger");
  });

  it("enemies chase, attack the player, then die and despawn", () => {
    const { map, sim, p, e } = setup("hollow-shade", 90);
    e.ai!.cooldown = 0;
    const events = run(sim, map, 180);
    expect(events.some((ev) => ev.type === "attack" && ev.id === e.id)).toBe(true);
    expect(p.hp).toBeLessThan(p.stats.maxHp);
    // Now kill it.
    e.hp = 1;
    e.ai!.cooldown = 99;
    e.action = { kind: "free" };
    p.action = { kind: "free" };
    p.x = e.x - 18;
    p.y = e.y;
    const after = run(sim, map, 240, (i) => intent({ pressed: i === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
    expect(after.some((ev) => ev.type === "death" && ev.id === e.id && ev.xp > 0)).toBe(true);
    expect(after.some((ev) => ev.type === "despawn")).toBe(true);
    expect(sim.actors[e.id]).toBeUndefined();
  });

  it("ranged enemies fire projectiles that hit", () => {
    const { map, sim, p, e } = setup("wisp-caster", 110);
    e.ai!.cooldown = 0;
    const events = run(sim, map, 120);
    expect(events.some((ev) => ev.type === "projectile")).toBe(true);
    expect(p.hp).toBeLessThan(p.stats.maxHp);
  });

  it("a charged heavy hits harder than an uncharged one", () => {
    const heavy = (holdSteps: number) => {
      const { map, sim, e } = setup("grave-brute");
      e.stats = { ...e.stats, critChance: 0 };
      run(sim, map, holdSteps + 60, (i) => intent({ pressed: i === 0 ? ["heavy"] : [], held: i < holdSteps ? ["heavy"] : [], aim: { x: 1, y: 0 } }));
      return e.stats.maxHp - e.hp;
    };
    expect(heavy(70)).toBeGreaterThan(heavy(2) * 1.6);
  });

  it("dead players respawn at home", () => {
    const { map, sim, p, e } = setup();
    e.ai!.cooldown = 99;
    p.hp = 1;
    p.x = 120;
    sim.actors[e.id]!.x = 140;
    sim.actors[e.id]!.ai!.cooldown = 0;
    const events = run(sim, map, 60 * 6);
    expect(events.some((ev) => ev.type === "death" && ev.id === "p1")).toBe(true);
    expect(events.some((ev) => ev.type === "respawn" && ev.id === "p1")).toBe(true);
  });
});
