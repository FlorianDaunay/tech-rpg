import { beforeAll, describe, expect, it } from "vitest";
import { combatData } from "@/content/combat";
import { registerContent } from "@/content/boot";
import type { GameMap } from "../world/map";
import { emptyIntent } from "../sim/intent";
import { createSim, SIM_DT, spawnEnemy, spawnPlayer, stepSim, type SimState } from "../sim/state";
import { registerCombatData } from "./defs";
import type { SimEvent } from "./events";
import type { Move } from "./moves";

const base: Move = { id: "", windup: 0.2, active: 0.1, recovery: 0.3, hitbox: { kind: "circle", radius: 10, offset: 0 }, damage: 1, staminaCost: 0, knockback: 0, lunge: 0, weight: "medium", poise: 0 };

beforeAll(() => {
  registerContent();
  const data = combatData();
  const add = (m: Move) => (data.moves[m.id] = m);
  add({ ...base, id: "t-fan", projectile: { speed: 200, radius: 3, range: 300, count: 5, spread: 60 } });
  add({ ...base, id: "t-ring", projectile: { speed: 200, radius: 3, range: 300, count: 8, spread: 360 } });
  add({ ...base, id: "t-homing", projectile: { speed: 150, radius: 3, range: 600, homing: 4 } });
  add({ ...base, id: "t-blast", hazard: { radius: 30, delay: 0.8, at: "target", distance: 60, count: 1, scatter: 0 } });
  add({ ...base, id: "t-combo-1", next: "t-combo-2" });
  add({ ...base, id: "t-combo-2" });
  const mob = data.enemies["hollowed-warden"]!;
  for (const id of ["t-fan", "t-ring", "t-homing", "t-blast", "t-combo-1"])
    data.enemies[`mob-${id}`] = { ...mob, id: `mob-${id}`, moves: undefined, attack: id, attackRange: 200, aggroRange: 400, attackCooldown: 5 };
  data.enemies["mob-set"] = { ...mob, id: "mob-set", attack: "t-fan", moves: [{ move: "t-ring", weight: 1, range: 200 }, { move: "t-blast", weight: 1, range: 200 }], attackRange: 200, aggroRange: 400, attackCooldown: 0.6 };
  registerCombatData(data);
});

function room(): GameMap {
  const n = 40;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns: [], portals: [], lights: [] };
}

function setup(enemy: string, gap = 120) {
  const map = room();
  const sim = createSim("room", 9);
  const p = spawnPlayer(sim, "p1", "x", 600, 600);
  const e = spawnEnemy(sim, enemy, 600 + gap, 600);
  e.ai!.cooldown = 0;
  return { map, sim, p, e };
}

function run(sim: SimState, map: GameMap, seconds: number, each?: () => void): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    each?.();
    stepSim(sim, map, { p1: emptyIntent() });
    out.push(...sim.events);
  }
  return out;
}

const angles = (sim: SimState) => sim.projectiles.map((p) => (Math.atan2(p.vy, p.vx) * 180) / Math.PI).sort((a, b) => a - b);

describe("attack patterns", () => {
  it("a fan spreads its projectiles evenly around the aim", () => {
    const { map, sim } = setup("mob-t-fan");
    run(sim, map, 0.3);
    const a = angles(sim);
    expect(a).toHaveLength(5);
    // Aimed left (player is to the west): -150..150 wrapped → check the spacing instead.
    const sorted = sim.projectiles.map((p) => Math.atan2(p.vy, -p.vx)).sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo(Math.PI / 12, 2);
  });

  it("a ring fires all around", () => {
    const { map, sim } = setup("mob-t-ring");
    run(sim, map, 0.3);
    const a = angles(sim);
    expect(a).toHaveLength(8);
    for (let i = 1; i < a.length; i++) expect(a[i]! - a[i - 1]!).toBeCloseTo(45, 0);
  });

  it("a homing bolt curves onto a target that steps aside", () => {
    const { map, sim, p } = setup("mob-t-homing", 200);
    p.iframes = 0;
    const hp = p.hp;
    // The player sidesteps after the cast: a straight bolt would miss by 60 px.
    let cast = false;
    run(sim, map, 2.5, () => {
      if (!cast && sim.projectiles.length) {
        cast = true;
        p.y += 60;
      }
    });
    expect(cast).toBe(true);
    expect(p.hp).toBeLessThan(hp);
  });

  it("a ground blast is telegraphed, then hits whoever is still inside", () => {
    const { map, sim, p } = setup("mob-t-blast");
    const events = run(sim, map, 0.35);
    const tele = events.find((e) => e.type === "hazard");
    expect(tele).toMatchObject({ radius: 30, delay: 0.8 });
    const hp = p.hp;
    run(sim, map, 0.6);
    expect(p.hp).toBe(hp); // not yet
    const later = run(sim, map, 0.4);
    expect(later.some((e) => e.type === "hazard-blast")).toBe(true);
    expect(p.hp).toBeLessThan(hp);
  });

  it("stepping out of the telegraph avoids the blast", () => {
    const { map, sim, p } = setup("mob-t-blast");
    run(sim, map, 0.35);
    p.x -= 80;
    const hp = p.hp;
    run(sim, map, 1.2, () => (p.x = 520));
    expect(p.hp).toBe(hp);
  });

  it("mobs with a moveset mix their attacks; combo strings chain", () => {
    const set = setup("mob-set");
    const events = run(set.sim, set.map, 12);
    const used = new Set(events.flatMap((e) => (e.type === "attack" && e.id === set.e.id ? [e.move] : [])));
    expect(used).toEqual(new Set(["t-ring", "t-blast"]));

    const combo = setup("mob-t-combo-1", 14);
    const ev = run(combo.sim, combo.map, 1.5);
    const moves = ev.flatMap((e) => (e.type === "attack" && e.id === combo.e.id ? [e.move] : []));
    expect(moves.slice(0, 2)).toEqual(["t-combo-1", "t-combo-2"]);
  });
});
