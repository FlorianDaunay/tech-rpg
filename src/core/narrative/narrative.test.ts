import { beforeAll, describe, expect, it } from "vitest";
import { combatData } from "@/content/combat";
import { narrativeData } from "@/content/narrative";
import { registerCombatData } from "../combat/defs";
import type { SimEvent } from "../combat/events";
import type { Intent } from "../sim/intent";
import { createSim, spawnEnemy, spawnNpc, spawnPlayer, stepSim } from "../sim/state";
import type { GameMap } from "../world/map";
import { registerNarrativeData } from "./defs";
import { questState } from "./progress";

beforeAll(() => {
  registerCombatData(combatData());
  registerNarrativeData(narrativeData());
});

function room(id = "room"): GameMap {
  const n = 16;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  return { id, zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns: [], portals: [], lights: [] };
}

const idle = (extra: Partial<Intent> = {}): Intent => ({ move: { x: 0, y: 0 }, aim: null, held: [], pressed: [], ...extra });

function setup(mapId = "room") {
  const map = room(mapId);
  const sim = createSim(mapId, 7);
  const p = spawnPlayer(sim, "p1", "x", 200, 200);
  const step = (intent: Intent = idle()): SimEvent[] => {
    stepSim(sim, map, { p1: intent });
    return sim.events;
  };
  const choose = (dialogue: string, node: string, choice: number) => step(idle({ commands: [{ type: "dialogue", dialogue, node, choice }] }));
  const story = () => ({ id: p.id, bag: p.bag, progress: p.progress! });
  return { map, sim, p, step, choose, story };
}

describe("narrative", () => {
  it("interact next to an NPC opens its dialogue; NPCs can't be hit", () => {
    const { sim, p, step } = setup();
    const npc = spawnNpc(sim, "maelis", 220, 200)!;
    const talk = step(idle({ pressed: ["interact"] })).find((e) => e.type === "talk");
    expect(talk).toMatchObject({ type: "talk", npc: "maelis", dialogue: "maelis" });
    expect(p.progress!.met).toContain("maelis");
    p.aim = { x: 1, y: 0 };
    let hits = 0;
    for (let i = 0; i < 40; i++) hits += step(idle({ pressed: i === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } })).filter((e) => e.type === "hit").length;
    expect(hits).toBe(0);
    expect(npc.hp).toBe(npc.stats.maxHp);
  });

  it("the main quest runs start → kill → collect → turn-in with rewards", () => {
    const { sim, map, p, step, choose, story } = setup("whispering-wilds");
    const ev = choose("maelis", "ask", 0);
    expect(ev.some((e) => e.type === "quest" && e.quest === "first-ember" && e.change === "started")).toBe(true);
    // Already standing in the Wilds: the reach objective is met right away.
    expect(p.progress!.visited).toContain("whispering-wilds");
    expect(questState(story(), "first-ember")).toBe("active");
    // Turning in early is refused (the host re-checks the choice's conditions... and the state).
    choose("maelis", "turnin", 0);
    expect(questState(story(), "first-ember")).toBe("active");

    const warden = spawnEnemy(sim, "hollowed-warden", 222, 200);
    warden.hp = 1;
    warden.ai!.cooldown = 99;
    const kills: SimEvent[] = [];
    for (let i = 0; i < 200 && !p.bag["sunlit-ember"]; i++) kills.push(...step(idle({ pressed: i === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } })));
    expect(kills.some((e) => e.type === "kill-credit" && e.enemy === "hollowed-warden")).toBe(true);
    expect(p.bag["sunlit-ember"]).toBe(1);
    expect(questState(story(), "first-ember")).toBe("ready");
    expect(kills.some((e) => e.type === "quest" && e.change === "ready")).toBe(true);

    const gold = p.bag.gold ?? 0;
    const done = choose("maelis", "turnin", 0);
    expect(done.some((e) => e.type === "quest" && e.change === "done")).toBe(true);
    expect(questState(story(), "first-ember")).toBe("done");
    expect(p.bag["sunlit-ember"]).toBeUndefined(); // handed over
    expect(p.bag["cinder-edge"]).toBe(1);
    expect(p.bag.gold).toBe(gold + 50);
    expect(p.progress!.flags).toContain("first-ember-returned");
    // A second turn-in does nothing.
    choose("maelis", "turnin", 0);
    expect(p.bag["cinder-edge"]).toBe(1);
    void map;
  });

  it("collect quests track the bag, and invalid choices are ignored", () => {
    const { p, choose, story, step } = setup();
    choose("bram", "intro", 0);
    expect(questState(story(), "grave-iron")).toBe("active");
    p.bag["grave-iron"] = 3;
    step();
    expect(questState(story(), "grave-iron")).toBe("ready");
    choose("bram", "intro", 7); // no such choice
    choose("nope", "x", 0); // no such dialogue
    choose("bram", "turnin", 0);
    expect(p.bag["grave-iron"]).toBeUndefined();
    expect(p.bag["warden-kite"]).toBe(1);
  });

  it("bounty kills only count while the quest is active", () => {
    const { sim, p, step, choose, story } = setup();
    const kill = () => {
      const e = spawnEnemy(sim, "hollow-shade", p.x + 20, p.y);
      e.hp = 1;
      e.ai!.cooldown = 99;
      for (let i = 0; i < 40 && e.hp > 0; i++) step(idle({ pressed: i === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } }));
      for (let i = 0; i < 30; i++) step();
    };
    kill();
    expect(p.progress!.kills["hollow-shade"]).toBe(1);
    choose("oskar", "intro", 0);
    expect(p.progress!.quests["shade-culling"]!.counts.shades ?? 0).toBe(0);
    for (let i = 0; i < 5; i++) kill();
    expect(questState(story(), "shade-culling")).toBe("ready");
    expect(p.progress!.quests["shade-culling"]!.counts.shades).toBe(5);
  });
});
