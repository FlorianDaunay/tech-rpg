import { describe, expect, it } from "vitest";
import { dailySeed, DEFAULT_SHAPE, floorDistances, generateRift } from "./riftgen";

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);

describe("rift generator", () => {
  it("is deterministic per (seed, floor) and floors differ", () => {
    expect(generateRift(42, 1)).toEqual(generateRift(42, 1));
    expect(generateRift(42, 1).rows).not.toEqual(generateRift(42, 2).rows);
    expect(generateRift(42, 1).rows).not.toEqual(generateRift(43, 1).rows);
  });

  it("every floor cell is reachable from the start, the border is solid", () => {
    for (const seed of SEEDS) {
      const f = generateRift(seed, 1 + (seed % 5));
      expect(f.rows).toHaveLength(f.height);
      for (const r of f.rows) expect(r).toHaveLength(f.width);
      const dist = floorDistances(f.rows, f.start);
      f.rows.forEach((row, y) =>
        Array.from(row).forEach((c, x) => {
          if (c === ".") expect(dist[y]![x], `seed ${seed} cell ${x},${y}`).toBeGreaterThanOrEqual(0);
          if (x === 0 || y === 0 || x === f.width - 1 || y === f.height - 1) expect(c).toBe("#");
        })
      );
      expect(f.rooms.length).toBeGreaterThanOrEqual(DEFAULT_SHAPE.rooms[0] - 2);
    }
  });

  it("the exit is a far walk from the start; enemies and chests stand on floor, none in the start room", () => {
    for (const seed of SEEDS) {
      const f = generateRift(seed, 3);
      const dist = floorDistances(f.rows, f.start);
      expect(dist[f.exit.y]![f.exit.x]).toBeGreaterThan(15);
      const start = f.rooms[0]!;
      for (const e of [...f.enemies, ...f.chests]) {
        expect(f.rows[e.y]![e.x]).toBe(".");
        expect(e.x >= start.x && e.x < start.x + start.w && e.y >= start.y && e.y < start.y + start.h).toBe(false);
      }
      expect(f.enemies.filter((e) => e.elite)).toHaveLength(1);
    }
  });

  it("deeper floors hold more enemies on average", () => {
    const avg = (floor: number) => SEEDS.reduce((s, seed) => s + generateRift(seed, floor).enemies.length, 0) / SEEDS.length;
    expect(avg(5)).toBeGreaterThan(avg(1) * 1.2);
  });

  it("the daily seed changes with the UTC day only", () => {
    const day = Date.UTC(2026, 9, 11, 3);
    expect(dailySeed(day)).toBe(dailySeed(day + 10 * 3600_000));
    expect(dailySeed(day)).not.toBe(dailySeed(day + 24 * 3600_000));
  });
});
