import { beforeAll, describe, expect, it } from "vitest";
import { combatData } from "@/content/combat";
import type { Action, Intent } from "../sim/intent";
import { createSim, spawnEnemy, spawnPlayer, stepSim, type SimState } from "../sim/state";
import type { GameMap } from "../world/map";
import type { SimEvent } from "./events";
import { createRng } from "../math/rng";
import { getLootTable, getMove, registerCombatData } from "./defs";
import { equip } from "./equipment";
import { rollLoot } from "./loot";
import { BLOCK, DODGE, STAMINA } from "./moves";

// Tests run on the real content JSON, so balance changes that break a rule show up here.
beforeAll(() => registerCombatData(combatData()));

/** 16×16 open room with a solid border. */
function room(): GameMap {
  const n = 16;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns: [], portals: [], lights: [] };
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

  it("hp stays an integer while enemies regenerate", () => {
    const { map, sim, e } = setup("cinder-mote", 200);
    e.hp = 5;
    run(sim, map, 50);
    expect(Number.isInteger(e.hp)).toBe(true);
    expect(e.hp).toBeGreaterThan(5);
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

  it("elemental hits apply statuses; damage over time ticks", () => {
    const { map, sim, p, e } = setup("grave-brute");
    equip(p, "cinder-edge", null);
    let applied = false;
    for (let i = 0; i < 12 && !applied; i++) {
      const ev = run(sim, map, 40, (k) => intent({ pressed: k === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
      applied = ev.some((x) => x.type === "status" && x.status === "burning");
    }
    expect(applied).toBe(true);
    const ticks = run(sim, map, 220).filter((x) => x.type === "status-tick");
    expect(ticks.length).toBeGreaterThan(0);
    expect(e.statuses.find((s) => s.id === "burning")).toBeUndefined(); // expired
  });

  it("a second element triggers a reaction and consumes the first status", () => {
    const { map, sim, p, e } = setup("grave-brute");
    e.stats = { ...e.stats, maxHp: 9999 };
    e.hp = 9999;
    e.statuses.push({ id: "burning", t: 0, stacks: 1, tick: 0, power: 10, source: null });
    equip(p, "gale-needle", null); // storm
    const ev = run(sim, map, 30, (k) => intent({ pressed: k === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
    expect(ev.some((x) => x.type === "reaction" && x.reaction === "overload")).toBe(true);
    expect(e.statuses.some((s) => s.id === "burning")).toBe(false);
  });

  it("resistances scale damage", () => {
    const hitOnce = (weapon: string) => {
      const { map, sim, p, e } = setup("hollow-shade");
      equip(p, weapon, null);
      e.stats = { ...e.stats, maxHp: 9999 };
      e.hp = 9999;
      p.stats = { ...p.stats, critChance: 0 };
      run(sim, map, 30, (k) => intent({ pressed: k === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
      return 9999 - e.hp;
    };
    // Shades take 150% ember damage; cinder-edge has +2 power, so compare per power point.
    const plain = hitOnce("initiate-blade") / 12;
    const ember = hitOnce("cinder-edge") / 14;
    expect(ember).toBeGreaterThan(plain * 1.3);
  });

  it("killed enemies drop loot that the player picks up", () => {
    const { map, sim, p, e } = setup("grave-brute");
    e.hp = 1;
    const ev = run(sim, map, 180, (k) => intent({ pressed: k === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
    expect(ev.some((x) => x.type === "drop")).toBe(true);
    expect(ev.some((x) => x.type === "pickup")).toBe(true);
    expect(p.bag.gold ?? 0).toBeGreaterThan(0);
  });

  it("a lethal reaction kills (and drops loot) only once", () => {
    const { map, sim, p, e } = setup("grave-brute");
    equip(p, "gale-needle", null);
    p.stats = { ...p.stats, critChance: 0 };
    // Enough hp to survive the rapier hit (~7) but not the overload burst that follows (~10).
    e.hp = 12;
    e.statuses.push({ id: "burning", t: 0, stacks: 1, tick: 0, power: 10, source: null });
    const ev = run(sim, map, 30, (k) => intent({ pressed: k === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
    expect(ev.filter((x) => x.type === "death" && x.id === e.id)).toHaveLength(1);
    const gold = ev.filter((x) => x.type === "drop" && x.item === "gold");
    expect(gold).toHaveLength(1);
  });

  it("loot rolls are deterministic and respect counts", () => {
    const table = getLootTable("brute-loot");
    const a = rollLoot(table, createRng(5));
    expect(rollLoot(table, createRng(5))).toEqual(a);
    const gold = a.find((d) => d.item === "gold")!;
    expect(gold.count).toBeGreaterThanOrEqual(table.gold.min);
    expect(gold.count).toBeLessThanOrEqual(table.gold.max);
  });

  it("weapons change the moveset and shields the parry window", () => {
    const { map, sim, p } = setup();
    equip(p, "duelist-rapier", "ember-aegis");
    const ev = run(sim, map, 10, (k) => intent({ pressed: k === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
    expect(ev.some((x) => x.type === "attack" && x.move === "rapier-light-1")).toBe(true);
    expect(p.stats.defense).toBe(p.baseStats.defense + 5);
  });

  it("equip commands swap gear through the bag and refuse what you don't own", () => {
    const { map, sim, p } = setup();
    equip(p, "initiate-blade", null);
    p.bag["cinder-edge"] = 1;
    const cmd = (c: NonNullable<Intent["commands"]>[number]) => run(sim, map, 1, () => ({ ...intent(), commands: [c] }));
    cmd({ type: "equip", slot: "weapon", item: "dawnshard" }); // not owned
    expect(p.weapon).toBe("initiate-blade");
    cmd({ type: "equip", slot: "shield", item: "cinder-edge" }); // wrong slot
    expect(p.shield).toBeNull();
    const ev = cmd({ type: "equip", slot: "weapon", item: "cinder-edge" });
    expect(ev.some((e) => e.type === "equip")).toBe(true);
    expect(p.weapon).toBe("cinder-edge");
    expect(p.bag).toEqual({ "initiate-blade": 1 });
    expect(p.stats.power).toBe(p.baseStats.power + 2);
    cmd({ type: "equip", slot: "weapon", item: null });
    expect(p.weapon).toBeNull();
    expect(p.bag).toEqual({ "initiate-blade": 1, "cinder-edge": 1 });
  });

  it("consumables heal, are consumed, and need to be owned", () => {
    const { map, sim, p } = setup();
    p.hp = 30;
    p.bag["healing-draught"] = 1;
    const use = () => run(sim, map, 1, () => ({ ...intent(), commands: [{ type: "use", item: "healing-draught" }] }));
    const ev = use();
    expect(p.hp).toBe(70);
    expect(ev.find((e) => e.type === "use")).toMatchObject({ heal: 40 });
    expect(p.bag["healing-draught"]).toBeUndefined();
    use();
    expect(p.hp).toBe(70);
    p.bag["hollow-dust"] = 3;
    run(sim, map, 1, () => ({ ...intent(), commands: [{ type: "use", item: "hollow-dust" }] })); // not a consumable
    expect(p.bag["hollow-dust"]).toBe(3);
  });

  it("players standing in a portal emit a portal event; enemies don't", () => {
    const { map, sim, p, e } = setup();
    map.portals = [{ id: "east", x: 300, y: 180, w: 32, h: 40, to: "elsewhere", arrive: "west", requires: [] }];
    e.ai!.cooldown = 99;
    expect(run(sim, map, 1).some((ev) => ev.type === "portal")).toBe(false);
    p.x = 310;
    p.y = 200;
    e.x = 315;
    e.y = 190;
    const evs = run(sim, map, 1).filter((ev) => ev.type === "portal");
    expect(evs).toEqual([{ type: "portal", id: "p1", portal: "east", to: "elsewhere", arrive: "west" }]);
  });
});
