import { describe, expect, it } from "vitest";
import type { GameMap } from "../world/map";
import { moveAndCollide, steer, type Body } from "./movement";

/** 5×5 map with a solid border and a pillar at (3,2). */
function testMap(): GameMap {
  const width = 5;
  const height = 5;
  const solid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (x === 0 || y === 0 || x === width - 1 || y === height - 1) solid[y * width + x] = 1;
  solid[2 * width + 3] = 1;
  return { id: "t", zone: "test", width, height, tileSize: 32, layers: [], objects: [], solid, spawns: [] };
}

const body = (x: number, y: number): Body => ({ x, y, vx: 0, vy: 0, radius: 6 });
const tuning = { maxSpeed: 100, accel: 1000, decel: 2000 };

describe("movement", () => {
  it("accelerates towards the wish velocity and caps diagonals", () => {
    const b = body(48, 48);
    for (let i = 0; i < 60; i++) steer(b, { x: 1, y: 1 }, tuning, 1 / 60);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(100, 3);
  });

  it("stops against a wall and slides along it", () => {
    const b = body(80, 72);
    b.vx = 600;
    b.vy = 60;
    const hit = moveAndCollide(b, testMap(), 0.1);
    expect(hit.hitX).toBe(true);
    expect(b.x).toBe(96 - 6); // flush with pillar's left edge
    expect(b.y).toBeGreaterThan(72); // still slid vertically
  });

  it("does not tunnel through a 1-tile wall at dash speed", () => {
    const b = body(48, 80);
    b.vy = -5000;
    moveAndCollide(b, testMap(), 1 / 60);
    expect(b.y).toBeGreaterThanOrEqual(32 + 6);
  });
});
