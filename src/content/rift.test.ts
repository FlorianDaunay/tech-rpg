import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "./boot";
import { createSim, populateMap, spawnPlayer, stepSim } from "@/core/sim/state";
import type { SimEvent } from "@/core/combat/events";
import { isSolidCell } from "@/core/world/map";
import { parseRiftMapId, riftMapId } from "@/core/world/riftgen";
import { toGameMap } from "./maps";
import { content } from "./registry";
import { findMapContent, riftFloorContent } from "./rift";

const SEEDS = [1, 77, 2026, 99991, 4242424];

beforeAll(registerContent);

describe("rift floors", () => {
  it("ids round-trip", () => {
    expect(parseRiftMapId(riftMapId("endless-night", 3000000000, 4))).toEqual({ rift: "endless-night", seed: 3000000000, floor: 4 });
    expect(parseRiftMapId("whispering-wilds")).toBeNull();
  });

  it("every floor of every Rift is a valid, walkable map chained to the next floor, the last one leads home", () => {
    for (const rift of content.rifts.all())
      for (const seed of SEEDS)
        for (let floor = 1; floor <= rift.floors; floor++) {
          const m = riftFloorContent(rift, seed, floor);
          expect(findMapContent(m.id)).toEqual(m);
          const map = toGameMap(m);
          const cell = (px: number) => Math.floor(px / map.tileSize);
          for (const s of map.spawns) expect(isSolidCell(map, cell(s.x), cell(s.y)), `${m.id} spawn ${s.id}`).toBe(false);
          for (const s of map.spawns) if (s.kind === "enemy") expect(content.enemies.find(s.ref!), s.ref).toBeDefined();
          const exit = map.portals[0]!;
          if (floor < rift.floors) expect(exit).toMatchObject({ to: riftMapId(rift.id, seed, floor + 1), arrive: "start" });
          else {
            expect(exit).toMatchObject({ to: rift.exitTo, arrive: rift.exitArrive });
            expect(map.objects.some((o) => o.chest?.key.endsWith(":final"))).toBe(true);
          }
          expect(map.spawns.filter((s) => s.kind === "enemy").length).toBeGreaterThan(3);
        }
  });

  it("the exit is sealed by the guardian + wardens (or every enemy), all real enemy spawns", () => {
    for (const rift of content.rifts.all())
      for (const seed of SEEDS) {
        const m = riftFloorContent(rift, seed, 1);
        const enemies = m.spawns.filter((s) => s.kind === "enemy").map((s) => s.id);
        const req = m.portals[0]!.requires;
        expect(new Set(req).size).toBe(req.length);
        for (const id of req) expect(enemies).toContain(id);
        if (rift.seal === "all") expect(req.length).toBe(enemies.length);
        else expect(req.length).toBeLessThanOrEqual(rift.seal + 1);
        expect(req.length).toBeGreaterThan(0);
      }
  });

  it("in the sim: standing in a sealed exit does nothing; it opens once its wardens fall", () => {
    const rift = content.rifts.all()[0]!;
    const map = toGameMap(riftFloorContent(rift, 2026, 1));
    const sim = createSim(map.id, 1);
    const exit = map.portals[0]!;
    const p = spawnPlayer(sim, "p1", "x", exit.x + exit.w / 2, exit.y + exit.h / 2);
    p.iframes = 9999;
    populateMap(sim, map, new Set(), Infinity);
    for (const a of Object.values(sim.actors)) if (a.kind === "enemy") a.ai = null;
    const events: SimEvent[] = [];
    const step = () => {
      p.x = exit.x + exit.w / 2;
      p.y = exit.y + exit.h / 2;
      stepSim(sim, map, {});
      events.push(...sim.events);
    };
    step();
    expect(sim.sealed).toEqual([exit.id]);
    expect(events.some((e) => e.type === "portal")).toBe(false);
    // Kill the required ones (and only those).
    for (const sp of sim.spawners) if (exit.requires.some((id) => sp.key.endsWith(`:${id}`))) sim.actors[sp.actor!]!.hp = 0, (sim.actors[sp.actor!]!.action = { kind: "dead", t: 0 });
    step();
    step();
    expect(sim.sealed).toEqual([]);
    expect(events.filter((e) => e.type === "portal-open")).toHaveLength(1);
    expect(events.some((e) => e.type === "portal")).toBe(true);
  });
});
