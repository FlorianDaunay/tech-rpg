import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import { createRng } from "../math/rng";
import { createSim, spawnPlayer } from "../sim/state";
import { migrateSave, captureSave } from "../save/save";
import { applyCommand } from "./commands";
import { affixCountFor, findAffix, getWeapon, type LootTableDef } from "./defs";
import { equip } from "./equipment";
import { activeSets, affixValue, gearAffixes, gearKey, normalizeGear, parseGear, QUALITY_MAX, rollGear } from "./gear";
import { rollLoot } from "./loot";

beforeAll(registerContent);

const player = (gear: { weapon?: string | null; shield?: string | null } = {}) =>
  spawnPlayer(createSim("cinderhold", 1), "p1", "x", 100, 100, { weapon: gear.weapon ?? null, shield: gear.shield ?? null });

describe("gear", () => {
  it("keys round-trip and sort affixes so identical rolls stack", () => {
    const key = gearKey("cinder-edge", [{ id: "keen", q: 5 }, { id: "brutal", q: 9 }]);
    expect(key).toBe("cinder-edge+brutal:9+keen:5");
    expect(parseGear(key)).toEqual({ base: "cinder-edge", affixes: [{ id: "brutal", q: 9 }, { id: "keen", q: 5 }], tier: 0 });
    expect(getWeapon(key).id).toBe("cinder-edge");
  });

  it("affix values span min..max over the quality range", () => {
    const brutal = findAffix("brutal")!;
    expect(affixValue(brutal, 0)).toBe(brutal.min);
    expect(affixValue(brutal, QUALITY_MAX)).toBe(brutal.max);
    expect(Number.isInteger(affixValue(brutal, 4))).toBe(true);
  });

  it("rolls are deterministic, sized by rarity, fit the slot and never repeat a stat", () => {
    for (const base of ["cinder-edge", "dawnshard", "ember-aegis", "warden-kite"]) {
      for (let seed = 1; seed < 40; seed++) {
        const key = rollGear(base, createRng(seed));
        expect(rollGear(base, createRng(seed))).toBe(key);
        const affixes = gearAffixes(key);
        expect(new Set(affixes.map((a) => a.def.stat)).size).toBe(affixes.length);
        const slot = base === "ember-aegis" || base === "warden-kite" ? "shield" : "weapon";
        for (const a of affixes) expect(["any", slot]).toContain(a.def.slot);
      }
    }
    expect(gearAffixes(rollGear("dawnshard", createRng(3)))).toHaveLength(affixCountFor("legendary"));
    expect(rollGear("initiate-blade", createRng(3))).toBe("initiate-blade"); // common: no affix
  });

  it("affix stats apply when equipped and leave when unequipped", () => {
    const key = gearKey("cinder-edge", [{ id: "brutal", q: QUALITY_MAX }, { id: "vital", q: 0 }]);
    const p = player();
    const plain = { power: p.stats.power, maxHp: p.stats.maxHp };
    p.bag[key] = 1;
    applyCommand([], p, { type: "equip", slot: "weapon", item: key });
    expect(p.weapon).toBe(key);
    const base = getWeapon("cinder-edge").bonus.power ?? 0;
    expect(p.stats.power).toBe(plain.power + base + findAffix("brutal")!.max);
    expect(p.stats.maxHp).toBe(plain.maxHp + findAffix("vital")!.min);
    applyCommand([], p, { type: "equip", slot: "weapon", item: null });
    expect(p.stats.power).toBe(plain.power);
    expect(p.bag[key]).toBe(1);
  });

  it("set bonuses need the pieces worn together, rolled copies included", () => {
    const solo = player({ weapon: "initiate-blade" });
    expect(activeSets(solo)[0]?.bonuses).toEqual([]);
    const both = player({ weapon: "initiate-blade", shield: "initiate-buckler" });
    expect(activeSets(both)[0]?.bonuses).toHaveLength(1);
    expect(both.stats.maxHp).toBeGreaterThan(solo.stats.maxHp);

    const p = player();
    equip(p, "warden-greatblade+keen:3", "warden-kite+sturdy:0");
    expect(activeSets(p).map((s) => s.set.id)).toEqual(["wardens-oath"]);
    expect(activeSets(p)[0]!.bonuses).toHaveLength(1);
  });

  it("loot rolls each sword or shield separately", () => {
    const table: LootTableDef = { id: "t", rolls: 1, chance: 1, entries: [{ item: "ember-aegis", weight: 1, min: 3, max: 3 }], gold: { min: 0, max: 0 } };
    const drops = rollLoot(table, createRng(7));
    expect(drops).toHaveLength(3);
    for (const d of drops) {
      expect(d.count).toBe(1);
      expect(parseGear(d.item).base).toBe("ember-aegis");
      expect(gearAffixes(d.item)).toHaveLength(affixCountFor("rare"));
    }
  });

  it("normalizing drops unknown or misplaced affixes and gone bases", () => {
    expect(normalizeGear("cinder-edge+removed:4+keen:5+sturdy:9")).toBe("cinder-edge+keen:5"); // sturdy is shield-only
    expect(normalizeGear("cinder-edge+keen:5+keen:2")).toBe("cinder-edge+keen:5");
    expect(normalizeGear("removed-sword+keen:5")).toBeNull();
    const p = player({ weapon: "cinder-edge+keen:5+removed:1" });
    p.bag = { "ember-aegis+removed:3": 1, "ember-aegis": 1, "gone+keen:1": 1 };
    const save = migrateSave(JSON.parse(JSON.stringify(captureSave(p, "cinderhold", 0, 0, 0))), () => true)!;
    expect(save.player.weapon).toBe("cinder-edge+keen:5");
    expect(save.player.bag).toEqual({ "ember-aegis": 2 });
  });
});
