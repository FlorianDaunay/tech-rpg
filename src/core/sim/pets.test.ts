import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import { content } from "@/content/registry";
import { applyCommand } from "../combat/commands";
import type { SimEvent } from "../combat/events";
import { findPet } from "../combat/defs";
import { captureSave, migrateSave, restorePlayer } from "../save/save";
import { setLevel } from "../progression/level";
import type { GameMap } from "../world/map";
import { emptyIntent, type Intent } from "./intent";
import { createSim, populateMap, SIM_DT, spawnEnemy, spawnNpc, spawnPlayer, stepSim, type SimState } from "./state";

beforeAll(registerContent);

function room(): GameMap {
  const n = 40;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  const spawns = [{ id: "cinder", kind: "npc" as const, ref: "cinder", x: 900, y: 900 }];
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns, portals: [], lights: [] };
}

function run(sim: SimState, map: GameMap, seconds: number, intent: () => Intent = emptyIntent): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    stepSim(sim, map, { p1: intent() });
    events.push(...sim.events);
  }
  return events;
}

const petOf = (sim: SimState) => Object.values(sim.actors).find((a) => a.kind === "pet");

function adopt(id = "cinder") {
  const map = room();
  const sim = createSim("room", 1);
  const p = spawnPlayer(sim, "p1", "x", 300, 300);
  const node = id === "cinder" ? "woof" : "mrrp";
  const dialogue = content.dialogues.get(id);
  const choice = dialogue.nodes[node]!.choices.findIndex((c) => c.do.some((e) => "adoptPet" in e));
  const events: SimEvent[] = [];
  applyCommand(events, p, { type: "dialogue", dialogue: id, node, choice });
  return { map, sim, p, events };
}

describe("pets", () => {
  it("adopting through dialogue: the pet appears at its owner's side and follows", () => {
    const { map, sim, p, events } = adopt();
    expect(p.pet).toBe("cinder");
    expect(events.some((e) => e.type === "pet-adopted")).toBe(true);
    spawnNpc(sim, "cinder", 500, 500); // still in the hub when adopted
    run(sim, map, 0.1);
    expect(Object.values(sim.actors).some((a) => a.kind === "npc" && a.type === "cinder")).toBe(false);
    const pet = petOf(sim)!;
    expect(pet.owner).toBe("p1");
    expect(Math.hypot(pet.x - p.x, pet.y - p.y)).toBeLessThan(30);
    run(sim, map, 2, () => ({ ...emptyIntent(), move: { x: 1, y: 0 } }));
    run(sim, map, 1.5);
    expect(Math.hypot(pet.x - p.x, pet.y - p.y)).toBeLessThan(50);
  });

  it("fights enemies near its owner; the kill gives the owner XP but doesn't train their sword", () => {
    const { map, sim, p } = adopt();
    run(sim, map, 0.1);
    const pet = petOf(sim)!;
    const e = spawnEnemy(sim, "hollow-shade", 300, 360);
    e.hp = 1;
    e.ai!.cooldown = 99;
    e.ai!.think = 99;
    p.weapon = "initiate-blade";
    // Keep the shade from fleeing or attacking: it stands still while the pet closes in.
    const events: SimEvent[] = [];
    for (let i = 0; i < 300 && e.action.kind !== "dead"; i++) {
      Object.assign(e, { x: 300, y: 360, vx: 0, vy: 0 });
      stepSim(sim, map, { p1: emptyIntent() });
      events.push(...sim.events);
    }
    const death = events.find((x) => x.type === "death" && x.id === e.id);
    expect(death).toMatchObject({ killer: "p1", via: pet.id });
    expect(p.xp).toBeGreaterThan(0);
    expect(p.mastery).toEqual({});
    expect(p.progress!.kills["hollow-shade"]).toBe(1);
  });

  it("a downed pet gets back up beside its owner; it grows with its owner's level; strays are brought back", () => {
    const { map, sim, p } = adopt();
    run(sim, map, 0.1);
    const pet = petOf(sim)!;
    const base = pet.stats.maxHp;
    pet.hp = 0;
    pet.action = { kind: "dead", t: 0 };
    const events = run(sim, map, findPet("cinder")!.revive + 0.2);
    expect(events.some((e) => e.type === "pet-revive")).toBe(true);
    expect(pet.action.kind).not.toBe("dead");
    expect(pet.hp).toBe(Math.ceil(pet.stats.maxHp / 2));
    setLevel(p, 5);
    run(sim, map, 0.05);
    expect(pet.stats.maxHp).toBe(base + 4 * (findPet("cinder")!.perLevel.maxHp ?? 0));
    Object.assign(pet, { x: 1200, y: 1200 });
    run(sim, map, 0.05);
    expect(Math.hypot(pet.x - p.x, pet.y - p.y)).toBeLessThan(40);
  });

  it("switching pets replaces the companion; the adopted one leaves the hub; saves keep it", () => {
    const { map, sim, p } = adopt();
    run(sim, map, 0.1);
    applyCommand([], p, { type: "dialogue", dialogue: "moth", node: "mrrp", choice: 1 });
    run(sim, map, 0.1);
    expect(Object.values(sim.actors).filter((a) => a.kind === "pet").map((a) => a.type)).toEqual(["moth"]);

    const next = createSim("room", 2);
    const q = spawnPlayer(next, "p1", "x", 300, 300);
    restorePlayer(q, migrateSave(JSON.parse(JSON.stringify(captureSave(p, "room", 0, 0, 0))), () => true)!.player);
    expect(q.pet).toBe("moth");
    q.pet = "cinder";
    populateMap(next, room());
    expect(Object.values(next.actors).some((a) => a.kind === "npc" && a.type === "cinder")).toBe(false);
  });
});
