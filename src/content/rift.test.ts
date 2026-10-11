import { describe, expect, it } from "vitest";
import { isSolidCell } from "@/core/world/map";
import { parseRiftMapId, riftMapId } from "@/core/world/riftgen";
import { toGameMap } from "./maps";
import { content } from "./registry";
import { findMapContent, riftFloorContent } from "./rift";

const SEEDS = [1, 77, 2026, 99991, 4242424];

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
});
