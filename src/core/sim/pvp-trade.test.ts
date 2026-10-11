import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import type { SimEvent } from "../combat/events";
import { hostile, pickRespawn, scoreKill, createPvp } from "../combat/pvp";
import type { GameMap } from "../world/map";
import type { Trade } from "../trade/trade";
import { TRADE_LEASH } from "../trade/trade";
import { emptyIntent, type Command, type Intent } from "./intent";
import { positionAgo, rewindTicks } from "./lagcomp";
import { createSim, enablePvp, SIM_DT, spawnPlayer, stepSim, type SimState } from "./state";

beforeAll(registerContent);

function room(): GameMap {
  const n = 40;
  const solid = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 0 || y === 0 || x === n - 1 || y === n - 1) solid[y * n + x] = 1;
  const spawns = [
    { id: "a", kind: "player" as const, x: 100, y: 100 },
    { id: "b", kind: "player" as const, x: 1100, y: 1100 },
  ];
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects: [], solid, spawns, portals: [], lights: [] };
}

const intent = (o: Partial<Intent> = {}): Intent => ({ ...emptyIntent(), ...o });

function duel(pvp: boolean) {
  const map = room();
  const sim = createSim("room", 7);
  const p1 = spawnPlayer(sim, "p1", "x", 400, 400, { weapon: "initiate-blade" });
  const p2 = spawnPlayer(sim, "p2", "x", 418, 400, { weapon: "initiate-blade" });
  if (pvp) enablePvp(sim, map);
  return { map, sim, p1, p2 };
}

/** Runs steps; p1/p2 intents per step index. */
function run(sim: SimState, map: GameMap, steps: number, input: (i: number) => Record<string, Intent> = () => ({}), opts = {}): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    stepSim(sim, map, input(i), opts);
    events.push(...sim.events);
  }
  return events;
}

const swing = (i: number) => intent({ pressed: i === 0 ? ["attack"] : [], aim: { x: 1, y: 0 } });

describe("pvp", () => {
  it("players can't hurt each other outside an arena, can inside", () => {
    const calm = duel(false);
    run(calm.sim, calm.map, 30, (i) => ({ p1: swing(i) }));
    expect(calm.p2.hp).toBe(calm.p2.stats.maxHp);

    const arena = duel(true);
    const events = run(arena.sim, arena.map, 30, (i) => ({ p1: swing(i) }));
    expect(arena.p2.hp).toBeLessThan(arena.p2.stats.maxHp);
    expect(events.some((e) => e.type === "hit" && e.attacker === "p1" && e.target === "p2")).toBe(true);
  });

  it("pets fight for their owner; NPCs are never hostile", () => {
    const pvp = createPvp([]);
    const p1 = { id: "p1", team: "players" as const, kind: "player" as const, owner: null };
    const pet1 = { id: "pet-p1", team: "players" as const, kind: "pet" as const, owner: "p1" };
    const p2 = { id: "p2", team: "players" as const, kind: "player" as const, owner: null };
    const npc = { id: "n1", team: "neutral" as const, kind: "npc" as const, owner: null };
    expect(hostile(pvp, p1, pet1)).toBe(false);
    expect(hostile(pvp, pet1, p2)).toBe(true);
    expect(hostile(null, pet1, p2)).toBe(false);
    expect(hostile(pvp, p1, npc)).toBe(false);
  });

  it("a kill scores, the victim respawns away from the killer", () => {
    const { map, sim, p1, p2 } = duel(true);
    p2.hp = 1;
    const events = run(sim, map, 30, (i) => ({ p1: swing(i) }));
    expect(events).toContainEqual({ type: "pvp-kill", killer: "p1", victim: "p2", streak: 1 });
    expect(sim.pvp!.score.p1).toMatchObject({ kills: 1, deaths: 0 });
    expect(sim.pvp!.score.p2).toMatchObject({ kills: 0, deaths: 1 });
    run(sim, map, Math.round(3.2 / SIM_DT));
    expect(p2.action.kind).toBe("free");
    // p1 stands near (400, 400): the far spawn wins.
    expect({ x: p2.x, y: p2.y }).toEqual({ x: 1100, y: 1100 });
    expect(p1.hp).toBe(p1.stats.maxHp);
  });

  it("score and respawn helpers", () => {
    const pvp = createPvp([]);
    scoreKill(pvp, "p2", "p1");
    scoreKill(pvp, "p3", "p1");
    scoreKill(pvp, "p1", null);
    expect(pvp.score.p1).toEqual({ kills: 2, deaths: 1, streak: 0 });
    const me = duel(false).p1;
    expect(pickRespawn(pvp, me, [], { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });

  it("lag compensation: a swing at where the attacker saw the target lands", () => {
    const setup = () => {
      const s = duel(true);
      // p2 runs away from p1 for a while; p1 swings at the spot it saw p2 at.
      s.p2.x = 424;
      return s;
    };
    const flee = intent({ move: { x: 1, y: 0 } });
    // Without rewind the target has moved out of reach by the time the swing is live.
    const plain = setup();
    run(plain.sim, plain.map, 8, () => ({ p2: flee }));
    run(plain.sim, plain.map, 30, (i) => ({ p1: swing(i), p2: flee }));
    expect(plain.p2.hp).toBe(plain.p2.stats.maxHp);

    const comp = setup();
    run(comp.sim, comp.map, 8, () => ({ p2: flee }));
    run(comp.sim, comp.map, 30, (i) => ({ p1: swing(i), p2: flee }), { lagMs: { p1: 200 } });
    expect(comp.p2.hp).toBeLessThan(comp.p2.stats.maxHp);
  });

  it("rewind is capped and needs history", () => {
    expect(rewindTicks(100)).toBe(6);
    expect(rewindTicks(1000)).toBe(12);
    expect(positionAgo({ tick: 5 }, "nobody", 3)).toBeNull();
  });
});

describe("trading", () => {
  function pair() {
    const map = room();
    const sim = createSim("room", 3);
    const a = spawnPlayer(sim, "p1", "x", 400, 400);
    const b = spawnPlayer(sim, "p2", "x", 430, 400);
    a.bag = { gold: 100, "healing-draught": 3, "sunlit-ember": 1 };
    b.bag = { gold: 5, "ember-shard": 4 };
    const cmd = (p1: Command[] = [], p2: Command[] = []) => {
      stepSim(sim, map, { p1: intent({ commands: p1 }), p2: intent({ commands: p2 }) });
      return sim.events.filter((e) => e.type === "trade");
    };
    return { map, sim, a, b, cmd };
  }
  const current = (sim: SimState): Trade => sim.trades[0]!;

  it("ask by interacting near another player, accept, offer, both ready: goods swap", () => {
    const { map, sim, a, b, cmd } = pair();
    stepSim(sim, map, { p1: intent({ pressed: ["interact"] }) });
    expect(sim.events).toContainEqual(expect.objectContaining({ type: "trade", change: "asked" }));
    const id = current(sim).id;
    cmd([], [{ type: "trade", op: "answer", id, accept: true }]);
    expect(current(sim).status).toBe("open");
    cmd([{ type: "trade", op: "offer", id, items: { gold: 40, "healing-draught": 1 } }], [{ type: "trade", op: "offer", id, items: { "ember-shard": 4 } }]);
    const rev = current(sim).rev;
    expect(rev).toBe(2);
    const done = cmd([{ type: "trade", op: "ready", id, rev, ready: true }], [{ type: "trade", op: "ready", id, rev, ready: true }]);
    expect(done.at(-1)).toMatchObject({ change: "done" });
    expect(a.bag).toEqual({ gold: 60, "healing-draught": 2, "sunlit-ember": 1, "ember-shard": 4 });
    expect(b.bag).toEqual({ gold: 45, "healing-draught": 1 });
    expect(sim.trades).toEqual([]);
  });

  it("a ready for an old revision doesn't count (no switching offers under a click)", () => {
    const { sim, b, cmd } = pair();
    cmd([{ type: "trade", op: "ask", to: "p2" }]);
    const id = current(sim).id;
    cmd([], [{ type: "trade", op: "answer", id, accept: true }]);
    cmd([{ type: "trade", op: "offer", id, items: { gold: 50 } }]);
    const seen = current(sim).rev;
    cmd([{ type: "trade", op: "ready", id, rev: seen, ready: true }]);
    // p1 swaps the offer for less right as p2 clicks ready on what it saw.
    cmd([{ type: "trade", op: "offer", id, items: { gold: 1 } }], [{ type: "trade", op: "ready", id, rev: seen, ready: true }]);
    expect(current(sim).ready).toEqual({ p1: false, p2: false });
    expect(b.bag.gold).toBe(5);
  });

  it("key items, missing items and bad counts are refused", () => {
    const { sim, cmd } = pair();
    cmd([{ type: "trade", op: "ask", to: "p2" }]);
    const id = current(sim).id;
    cmd([], [{ type: "trade", op: "answer", id, accept: true }]);
    cmd([{ type: "trade", op: "offer", id, items: { "sunlit-ember": 1 } }]);
    cmd([{ type: "trade", op: "offer", id, items: { gold: 101 } }]);
    cmd([{ type: "trade", op: "offer", id, items: { "rift-shard": 1 } }]);
    expect(current(sim).offers.p1).toEqual({});
    cmd([{ type: "trade", op: "offer", id, items: { gold: 2.5, "healing-draught": 1 } }]);
    expect(current(sim).offers.p1).toEqual({ "healing-draught": 1 });
  });

  it("goods spent before both are ready: the trade fails, nothing moves", () => {
    const { sim, a, b, cmd } = pair();
    cmd([{ type: "trade", op: "ask", to: "p2" }]);
    const id = current(sim).id;
    cmd([], [{ type: "trade", op: "answer", id, accept: true }]);
    cmd([{ type: "trade", op: "offer", id, items: { "healing-draught": 3 } }]);
    const rev = current(sim).rev;
    a.hp = 10;
    const ev = cmd([{ type: "use", item: "healing-draught" }, { type: "trade", op: "ready", id, rev, ready: true }], [{ type: "trade", op: "ready", id, rev, ready: true }]);
    expect(ev.at(-1)).toMatchObject({ change: "failed" });
    expect(a.bag["healing-draught"]).toBe(2);
    expect(b.bag["healing-draught"]).toBeUndefined();
  });

  it("no asking from afar or twice; walking away, declining or timing out ends it", () => {
    const { sim, a, b, cmd } = pair();
    b.x = 600;
    cmd([{ type: "trade", op: "ask", to: "p2" }]);
    expect(sim.trades).toEqual([]);
    b.x = 430;
    cmd([{ type: "trade", op: "ask", to: "p2" }]);
    cmd([], [{ type: "trade", op: "ask", to: "p1" }]);
    expect(sim.trades).toHaveLength(1);
    const declined = cmd([], [{ type: "trade", op: "answer", id: current(sim).id, accept: false }]);
    expect(declined[0]).toMatchObject({ change: "declined", by: "p2" });

    cmd([{ type: "trade", op: "ask", to: "p2" }]);
    a.x = b.x - TRADE_LEASH - 10;
    expect(cmd()[0]).toMatchObject({ change: "cancelled" });

    a.x = 400;
    cmd([{ type: "trade", op: "ask", to: "p2" }]);
    sim.time += 31;
    expect(cmd()[0]).toMatchObject({ change: "declined" });
  });

  it("no trade prompt in a PvP arena (interact near a foe does nothing)", () => {
    const { map, sim } = pair();
    enablePvp(sim, map);
    stepSim(sim, map, { p1: intent({ pressed: ["interact"] }) });
    expect(sim.trades).toEqual([]);
  });
});
