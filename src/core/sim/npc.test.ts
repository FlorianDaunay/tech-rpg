import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import { thinkNpc } from "../combat/ai";
import { createRng } from "../math/rng";
import type { GameMap } from "../world/map";
import { createSim, SIM_DT, spawnNpc, stepSim } from "./state";

beforeAll(registerContent);

function field(): GameMap {
  const n = 40;
  return { id: "field", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid: new Uint8Array(n * n), spawns: [], portals: [], lights: [] };
}

describe("npc wander", () => {
  it("strolls near home without twitching (no frame-to-frame reversals)", () => {
    const sim = createSim("field", 11);
    const npc = spawnNpc(sim, "maelis", 600, 600)!;
    const rng = createRng(5);
    const wander = 40;
    let reversals = 0;
    let prev = { x: 0, y: 0 };
    let maxDist = 0;
    for (let i = 0; i < Math.round(120 / SIM_DT); i++) {
      const intent = thinkNpc(sim, npc, rng, SIM_DT, wander);
      if (prev.x * intent.move.x + prev.y * intent.move.y < 0) reversals++;
      if (intent.move.x || intent.move.y) prev = intent.move;
      // Move the NPC as the sim would (straight line at its speed).
      npc.x += intent.move.x * npc.stats.speed * SIM_DT;
      npc.y += intent.move.y * npc.stats.speed * SIM_DT;
      maxDist = Math.max(maxDist, Math.hypot(npc.x - 600, npc.y - 600));
    }
    expect(maxDist).toBeLessThan(wander + 12);
    // Turning back at the leash happens at most once per walk, never every frame.
    expect(reversals).toBeLessThan(40);
  });

  it("in the full sim too", () => {
    const sim = createSim("field", 3);
    const map = field();
    spawnNpc(sim, "maelis", 600, 600);
    let flips = 0;
    let facing = "";
    for (let i = 0; i < Math.round(60 / SIM_DT); i++) {
      stepSim(sim, map, {});
      const a = Object.values(sim.actors)[0]!;
      if (facing && a.facing !== facing) flips++;
      facing = a.facing;
    }
    expect(flips).toBeLessThan(60);
  });
});
