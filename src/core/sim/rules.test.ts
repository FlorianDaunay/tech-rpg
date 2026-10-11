import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import { content } from "@/content/registry";
import { applyCommand } from "../combat/commands";
import { getEnemy, type LootTableDef } from "../combat/defs";
import { rollLoot } from "../combat/loot";
import { createRng } from "../math/rng";
import { captureSave, migrateSave, newGamePlus, restorePlayer, START_MAP } from "../save/save";
import { applyRules, combineMods, ngPlusDef, normalizeRules } from "./rules";
import { createSim, spawnEnemy, spawnPlayer } from "./state";

beforeAll(registerContent);

const mapExists = (id: string) => !!content.maps.find(id);

describe("world rules", () => {
  it("Normal is neutral; difficulties and Omens multiply; NG+ adds a step per cycle", () => {
    expect(Object.values(combineMods({ difficulty: "normal", omens: [], ngPlus: 0 })).every((v) => v === 1)).toBe(true);
    const hard = content.difficulties.get("hard").mods;
    const moon = content.omens.get("blood-moon").mods;
    const m = combineMods({ difficulty: "hard", omens: ["blood-moon"], ngPlus: 0 });
    expect(m.enemyDamage).toBeCloseTo((hard.enemyDamage ?? 1) * (moon.enemyDamage ?? 1));
    const step = ngPlusDef()!.perCycle.enemyHp ?? 0;
    expect(combineMods({ difficulty: "normal", omens: [], ngPlus: 2 }).enemyHp).toBeCloseTo(1 + 2 * step);
  });

  it("difficulties go from easy to hard", () => {
    const order = content.difficulties.all().sort((a, b) => a.order - b.order);
    const hp = order.map((d) => d.mods.enemyHp ?? 1);
    expect(order[0]!.id).toBe("story");
    for (let i = 1; i < hp.length; i++) expect(hp[i]).toBeGreaterThanOrEqual(hp[i - 1]!);
  });

  it("unknown difficulty or Omens are cleaned", () => {
    expect(normalizeRules({ difficulty: "impossible", omens: ["blood-moon", "gone", "blood-moon"], ngPlus: -3 })).toEqual({ difficulty: "normal", omens: ["blood-moon"], ngPlus: 0 });
  });

  it("enemies spawn scaled, and changing the rules rescales them without compounding", () => {
    const sim = createSim("room", 1, 0, { difficulty: "nightmare" });
    const e = spawnEnemy(sim, "hollow-shade", 0, 0);
    const def = getEnemy("hollow-shade");
    expect(e.stats.maxHp).toBe(Math.round(def.stats.maxHp * sim.mods.enemyHp));
    expect(e.hp).toBe(e.stats.maxHp);
    e.hp = Math.round(e.stats.maxHp / 2);
    applyRules(sim, { difficulty: "story", omens: [], ngPlus: 0 });
    applyRules(sim, { difficulty: "story", omens: [], ngPlus: 0 });
    expect(e.stats.maxHp).toBe(Math.round(def.stats.maxHp * sim.mods.enemyHp));
    expect(e.hp / e.stats.maxHp).toBeCloseTo(0.5, 1);
    expect(e.stats.power).toBeCloseTo(def.stats.power * sim.mods.enemyDamage);
  });

  it("gold and loot chance follow the modifiers; healing items heal less under Frail Light", () => {
    const table: LootTableDef = { id: "t", rolls: 0, chance: 1, entries: [], gold: { min: 10, max: 10 } };
    const mods = combineMods({ difficulty: "hard", omens: [], ngPlus: 0 });
    expect(rollLoot(table, createRng(1), mods)[0]!.count).toBe(Math.round(10 * mods.gold));

    const sim = createSim("room", 1, 0, { omens: ["frail-light"] });
    const p = spawnPlayer(sim, "p1", "x", 0, 0);
    const draught = content.items.get("healing-draught");
    p.hp = 1;
    p.bag = { "healing-draught": 1 };
    applyCommand([], p, { type: "use", item: "healing-draught" }, sim.mods.healing);
    expect(p.hp).toBe(1 + Math.round((draught.effect?.heal ?? 0) * sim.mods.healing));
  });

  it("saves keep the rules; old saves get Normal", () => {
    const p = spawnPlayer(createSim("room", 1), "p1", "x", 0, 0);
    const rules = { difficulty: "hard", omens: ["iron-hide"], ngPlus: 1 };
    const save = migrateSave(JSON.parse(JSON.stringify(captureSave(p, "cinderhold", 0, 0, 0, rules))), mapExists)!;
    expect(save.rules).toEqual(rules);
    const old = JSON.parse(JSON.stringify(captureSave(p, "cinderhold", 0, 0, 0)));
    delete old.rules;
    expect(migrateSave(old, mapExists)!.rules).toEqual({ difficulty: "normal", omens: [], ngPlus: 0 });
  });

  it("New Game+ needs the story finished, restarts the story one cycle harder and keeps the character", () => {
    const p = spawnPlayer(createSim("room", 1), "p1", "x", 0, 0, { weapon: "cinder-edge+keen:3" });
    p.level = 12;
    p.talents = { "iron-skin": 1 };
    p.mastery = { blade: 500 };
    p.bag = { gold: 300, "healing-draught": 2 };
    p.progress!.quests["first-ember"] = { done: true, counts: {} };
    const unfinished = migrateSave(JSON.parse(JSON.stringify(captureSave(p, "deep-mines", 50, 99, 0, { difficulty: "hard", omens: [], ngPlus: 0 }))), mapExists)!;
    expect(newGamePlus(unfinished, 1)).toBeNull();

    p.progress!.flags.push(ngPlusDef()!.unlockFlag);
    const done = migrateSave(JSON.parse(JSON.stringify(captureSave(p, "deep-mines", 50, 99, 0, { difficulty: "hard", omens: [], ngPlus: 0 }))), mapExists)!;
    const ng = newGamePlus(done, 1)!;
    expect(ng.rules).toEqual({ difficulty: "hard", omens: [], ngPlus: 1 });
    expect(ng.map).toBe(START_MAP);
    expect(ng.player.progress.quests).toEqual({});
    expect(ng.player.progress.flags).toEqual([]);
    expect(ng.player).toMatchObject({ level: 12, talents: { "iron-skin": 1 }, mastery: { blade: 500 }, weapon: "cinder-edge+keen:3", bag: { gold: 300, "healing-draught": 2 } });
    const q = spawnPlayer(createSim("room", 1), "p1", "x", 0, 0);
    restorePlayer(q, ng.player);
    expect(q.hp).toBe(q.stats.maxHp);
  });
});
