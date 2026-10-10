import { beforeAll, describe, expect, it } from "vitest";
import { combatData } from "@/content/combat";
import { narrativeData, playerProgression } from "@/content/narrative";
import { registerCombatData } from "../combat/defs";
import type { SimEvent } from "../combat/events";
import { registerNarrativeData } from "../narrative/defs";
import { createSim, spawnEnemy, spawnPlayer } from "../sim/state";
import { awardXp, grantXp, progression, registerProgression, setLevel, statsAtLevel, xpToNext } from "./level";

beforeAll(() => {
  registerCombatData(combatData());
  registerNarrativeData(narrativeData());
  registerProgression(playerProgression());
});

function player(weapon: string | null = null) {
  const sim = createSim("room", 1);
  const p = spawnPlayer(sim, "p1", "x", 100, 100, { weapon });
  return { sim, p };
}

describe("progression", () => {
  it("the XP curve grows with level and stops at the cap", () => {
    const def = progression();
    for (let l = 1; l < def.maxLevel - 1; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    expect(xpToNext(def.maxLevel)).toBe(Infinity);
  });

  it("stats grow per level on top of the base stats", () => {
    const def = progression();
    const s1 = statsAtLevel(1);
    const s5 = statsAtLevel(5);
    expect(s5.maxHp).toBe(s1.maxHp + 4 * (def.perLevel.maxHp ?? 0));
    expect(s5.power).toBe(s1.power + 4 * (def.perLevel.power ?? 0));
  });

  it("enough XP for several levels levels up several times, keeping the remainder", () => {
    const { p } = player();
    const events: SimEvent[] = [];
    const amount = xpToNext(1) + xpToNext(2) + 5;
    grantXp(events, p, amount);
    expect(p.level).toBe(3);
    expect(p.xp).toBe(5);
    expect(events.filter((e) => e.type === "level-up").map((e) => (e as { level: number }).level)).toEqual([2, 3]);
    expect(p.stats.maxHp).toBe(statsAtLevel(3).maxHp);
    expect(p.hp).toBe(p.stats.maxHp);
  });

  it("levelling keeps equipment bonuses", () => {
    const sword = Object.keys(combatData().weapons)[0]!;
    const { p } = player(sword);
    const bonus = p.stats.power - p.baseStats.power;
    setLevel(p, 4);
    expect(p.stats.power).toBe(statsAtLevel(4).power + bonus);
  });

  it("an enemy killed by a player gives its XP to every living player; quests give theirs", () => {
    const sim = createSim("room", 1);
    const a = spawnPlayer(sim, "p1", "x", 100, 100);
    const b = spawnPlayer(sim, "p2", "x", 140, 100);
    const e = spawnEnemy(sim, "hollow-shade", 120, 100);
    const xp = combatData().enemies["hollow-shade"]!.xp;
    const events: SimEvent[] = [{ type: "death", id: e.id, killer: "p1", xp }];
    awardXp(events, sim.actors);
    expect(a.xp).toBe(xp);
    expect(b.xp).toBe(xp);

    const quest = narrativeData().quests["first-ember"]!;
    const before = a.level * 1000 + a.xp;
    awardXp([{ type: "quest", id: "p1", quest: quest.id, change: "done" }], sim.actors);
    expect(a.level * 1000 + a.xp).toBeGreaterThan(before);
    expect(b.xp).toBe(xp);
  });

  it("no XP past the level cap", () => {
    const { p } = player();
    setLevel(p, progression().maxLevel);
    const events: SimEvent[] = [];
    grantXp(events, p, 99999);
    expect(p.level).toBe(progression().maxLevel);
    expect(events).toEqual([]);
  });
});
