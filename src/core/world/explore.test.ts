import { describe, expect, it } from "vitest";
import { content } from "@/content/registry";
import { decodeFog, encodeFog, exploredShare, fogGrid, FOG_CELL, revealAround, tileRevealed } from "./explore";
import { worldLayout } from "./worldmap";

describe("fog of war", () => {
  it("encodes and decodes any bit pattern", () => {
    const g = fogGrid(35, 21);
    const bits = new Uint8Array(g.w * g.h).map((_, i) => ((i * 7) % 3 === 0 ? 1 : 0));
    expect([...decodeFog(encodeFog(bits), g)]).toEqual([...bits]);
    expect([...decodeFog(undefined, g)].every((b) => b === 0)).toBe(true);
  });

  it("reveals a disc around the player, once", () => {
    const map = { id: "m", width: 40, height: 30 };
    const explored: Record<string, string> = {};
    expect(revealAround(explored, map, 20, 15)).toBe(true);
    expect(revealAround(explored, map, 20, 15)).toBe(false);
    const g = fogGrid(40, 30);
    const bits = decodeFog(explored.m, g);
    expect(tileRevealed(bits, g, 20, 15)).toBe(true);
    expect(tileRevealed(bits, g, 24, 15)).toBe(true);
    expect(tileRevealed(bits, g, 0, 0)).toBe(false);
    expect(tileRevealed(bits, g, 39, 29)).toBe(false);
    const share = exploredShare(explored.m, 40, 30);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.3);
  });

  it("clamps at the map edges", () => {
    const explored: Record<string, string> = {};
    revealAround(explored, { id: "m", width: 10, height: 10 }, 0, 0);
    expect(decodeFog(explored.m, fogGrid(10, 10)).length).toBe((10 / FOG_CELL) ** 2);
  });
});

describe("world layout", () => {
  const maps = content.maps.all().map((m) => ({ id: m.id, width: m.width, height: m.height, portals: m.portals, spawns: m.spawns }));
  const layout = worldLayout(maps, "cinderhold");
  const at = (id: string) => layout.maps.find((m) => m.id === id)!;

  it("places every authored map reachable from the hub, without overlaps", () => {
    expect(layout.maps.map((m) => m.id).sort()).toEqual(maps.map((m) => m.id).sort());
    for (const a of layout.maps)
      for (const b of layout.maps)
        if (a !== b) expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, `${a.id} overlaps ${b.id}`).toBe(false);
  });

  it("puts neighbours on the side their exit is on", () => {
    expect(at("whispering-wilds").x).toBeGreaterThan(at("cinderhold").x + at("cinderhold").width);
    expect(at("ashen-graveyard").x + at("ashen-graveyard").width).toBeLessThan(at("cinderhold").x);
    expect(at("fallen-citadel").y + at("fallen-citadel").height).toBeLessThan(at("cinderhold").y);
    // The mines sit right under the hub's south gate (the arena door makes room, not the other way round).
    const hub = at("cinderhold");
    const mines = at("deep-mines");
    expect(mines.y).toBeGreaterThan(hub.y + hub.height);
    expect(mines.x).toBeLessThan(hub.x + hub.width);
    expect(mines.x + mines.width).toBeGreaterThan(hub.x);
    expect(at("frostfell-reach").x).toBeGreaterThan(at("whispering-wilds").x + at("whispering-wilds").width);
    expect(at("goblin-warren").x + at("goblin-warren").width).toBeLessThan(at("deep-mines").x);
  });
});
