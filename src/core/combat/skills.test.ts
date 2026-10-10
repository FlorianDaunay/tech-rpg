import { beforeAll, describe, expect, it } from "vitest";
import { combatData } from "@/content/combat";
import { playerProgression } from "@/content/narrative";
import { grantXp, registerProgression, setLevel, xpToNext } from "../progression/level";
import type { Action, Intent } from "../sim/intent";
import { createSim, spawnEnemy, spawnPlayer, stepSim, type SimState } from "../sim/state";
import type { GameMap } from "../world/map";
import { allSkills, getSkill, registerCombatData } from "./defs";
import type { SimEvent } from "./events";
import { skillBlocker, skillCooldown, ultimateFill } from "./skills";

beforeAll(() => {
  registerCombatData(combatData());
  registerProgression(playerProgression());
});

function room(): GameMap {
  const n = 16;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns: [], portals: [], lights: [] };
}

const press = (...pressed: Action[]): Intent => ({ move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, held: [], pressed });

function run(sim: SimState, map: GameMap, steps: number, first: Intent): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    stepSim(sim, map, { p1: i === 0 ? first : press() });
    events.push(...sim.events);
  }
  return events;
}

function setup() {
  const map = room();
  const sim = createSim("room", 7);
  const p = spawnPlayer(sim, "p1", "x", 200, 200);
  const e = spawnEnemy(sim, "grave-brute", 240, 200);
  e.ai!.cooldown = 99;
  return { map, sim, p, e };
}

describe("skills", () => {
  it("a level 1 player starts with the level 1 skill and no ultimate yet", () => {
    const { p } = setup();
    const lvl1 = allSkills().filter((s) => s.kind === "skill" && s.unlockLevel === 1);
    expect(lvl1.length).toBeGreaterThan(0);
    expect(p.loadout.skill1).toBe(lvl1[0]!.id);
    expect(allSkills().some((s) => s.kind === "ultimate" && s.unlockLevel === 1) || p.loadout.ultimate === null).toBe(true);
  });

  it("casting starts the skill's move, then the cooldown blocks a recast", () => {
    const { map, sim, p } = setup();
    const id = p.loadout.skill1!;
    const events = run(sim, map, 2, press("skill1"));
    expect(events).toContainEqual({ type: "skill", id: "p1", skill: id, slot: "skill1" });
    expect(p.action.kind).toBe("attack");
    expect(skillCooldown(p, id)).toBeGreaterThan(0);
    expect(skillBlocker(p, "skill1")).toBe("cooldown");
    // Wait out the move, recast immediately: refused.
    run(sim, map, 60, press());
    const again = run(sim, map, 2, press("skill1"));
    expect(again.some((e) => e.type === "skill")).toBe(false);
  });

  it("levelling up unlocks skills into empty slots and announces them", () => {
    const { p } = setup();
    const events: SimEvent[] = [];
    let total = 0;
    for (let l = 1; l < 6; l++) total += xpToNext(l);
    grantXp(events, p, total);
    expect(p.level).toBe(6);
    const unlocked = events.filter((e) => e.type === "skill-unlocked").map((e) => (e as { skill: string }).skill);
    expect(unlocked.length).toBeGreaterThan(0);
    for (const id of unlocked) expect(getSkill(id).unlockLevel).toBeGreaterThan(1);
    expect(p.loadout.skill2).not.toBeNull();
    expect(p.loadout.ultimate).not.toBeNull();
  });

  it("the ultimate needs a full Ember gauge, filled by dealing damage, and empties it", () => {
    const { map, sim, p, e } = setup();
    setLevel(p, 6);
    const ult = getSkill(p.loadout.ultimate!);
    expect(skillBlocker(p, "ultimate")).toBe("charge");
    expect(run(sim, map, 2, press("ultimate")).some((ev) => ev.type === "skill")).toBe(false);

    // Hit the brute with the light attack until the gauge is full.
    e.stats = { ...e.stats, maxHp: 100000 };
    e.hp = 100000;
    for (let i = 0; i < 400 && ultimateFill(p) < 1; i++) {
      p.stamina = 100;
      run(sim, map, 30, press("attack"));
    }
    expect(p.ultCharge).toBe(ult.charge);
    expect(skillBlocker(p, "ultimate")).toBeNull();
    run(sim, map, 90, press()); // let any stagger (the brute may parry a swing) wear off
    Object.assign(e, { x: p.x + 30, y: p.y, vx: 0, vy: 0 }); // knocked away by the combo: bring it back
    const events = run(sim, map, 40, press("ultimate"));
    expect(events.some((ev) => ev.type === "skill" && ev.slot === "ultimate")).toBe(true);
    expect(events.some((ev) => ev.type === "hit" && ev.attacker === "p1")).toBe(true);
    expect(p.ultCharge).toBe(0);
  });
});
