import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import { content } from "@/content/registry";
import { toGameMap } from "@/content/maps";
import { gearKey, normalizeGear, parseGear } from "../combat/gear";
import type { Actor } from "../combat/actor";
import { capturePlayer, migrateSave, newGamePlus, restorePlayer } from "../save/save";
import type { GameMap } from "../world/map";
import { emptyIntent, type Command } from "../sim/intent";
import { createSim, spawnNpc, spawnPlayer, stepSim, type SimState } from "../sim/state";
import { findForge, findShop } from "./defs";
import { dangerMods, offers, priceFor, rotation, sellPrice, valueOf, xpMultOf } from "./economy";

beforeAll(registerContent);

function room(objects: GameMap["objects"] = []): GameMap {
  const n = 30;
  const solid = new Uint8Array(n * n);
  return { id: "room", zone: "test", width: n, height: n, tileSize: 32, layers: [], objects, solid, spawns: [], portals: [], lights: [] };
}

/** A player standing next to every NPC that runs a service. */
function village(gold = 0): { sim: SimState; map: GameMap; me: Actor } {
  const map = room();
  const sim = createSim("room", 3);
  for (const npc of ["oskar", "bram", "harl", "maelis", "tomas"]) spawnNpc(sim, npc, 300, 300);
  const me = spawnPlayer(sim, "p1", "x", 310, 300, { weapon: "initiate-blade", shield: "initiate-buckler" });
  me.bag.gold = gold;
  return { sim, map, me };
}

function send(sim: SimState, map: GameMap, ...commands: Command[]): void {
  stepSim(sim, map, { p1: { ...emptyIntent(), commands } });
}

describe("shops", () => {
  it("sells at the listed price, only near the shopkeeper, never more gold than carried", () => {
    const { sim, map, me } = village(100);
    send(sim, map, { type: "buy", shop: "oskar-wares", item: "healing-draught", count: 2 });
    expect(me.bag["healing-draught"]).toBe(2);
    expect(me.bag.gold).toBe(20);
    send(sim, map, { type: "buy", shop: "oskar-wares", item: "healing-draught", count: 1 });
    expect(me.bag["healing-draught"]).toBe(2);

    me.bag.gold = 100;
    me.x += 500;
    send(sim, map, { type: "buy", shop: "oskar-wares", item: "healing-draught", count: 1 });
    expect(me.bag.gold).toBe(100);
  });

  it("refuses wares that are not on today's shelf", () => {
    const { sim, map, me } = village(99999);
    const shop = findShop("oskar-wares")!;
    const today = new Set(offers(shop, sim.day, me).map((o) => o.item));
    const missing = shop.rotating.pool.find((e) => !today.has(e.item))!;
    send(sim, map, { type: "buy", shop: shop.id, item: missing.item, count: 1 });
    expect(me.bag.gold).toBe(99999);
  });

  it("daily wares are the same for everyone on a day and change with the day", () => {
    const shop = findShop("oskar-wares")!;
    const a = rotation(shop, 123).map((e) => e.item);
    expect(rotation(shop, 123).map((e) => e.item)).toEqual(a);
    expect(new Set(a).size).toBe(shop.rotating.count);
    const days = new Set(Array.from({ length: 10 }, (_, d) => rotation(shop, d).map((e) => e.item).join()));
    expect(days.size).toBeGreaterThan(1);
  });

  it("a cosmetic is bought once and goes to the wardrobe, not the bag", () => {
    const { sim, map, me } = village(1000);
    send(sim, map, { type: "buy", shop: "oskar-wares", item: "lantern-amber", count: 1 });
    send(sim, map, { type: "buy", shop: "oskar-wares", item: "lantern-amber", count: 1 });
    expect(me.cosmetics.owned).toEqual(["lantern-amber"]);
    expect(me.bag["lantern-amber"]).toBeUndefined();
    expect(me.bag.gold).toBe(750);
    send(sim, map, { type: "cosmetic", slot: "lantern", id: "lantern-amber" });
    expect(me.cosmetics.lantern).toBe("lantern-amber");
    send(sim, map, { type: "cosmetic", slot: "trail", id: "trail-void" });
    expect(me.cosmetics.trail).toBeNull();
  });

  it("buys loot back at a fraction of its value; never gold or key items", () => {
    const { sim, map, me } = village(0);
    const shop = findShop("oskar-wares")!;
    me.bag["grave-iron"] = 4;
    me.bag["sunlit-ember"] = 1;
    const each = sellPrice(shop, "grave-iron");
    expect(each).toBe(Math.floor(content.items.get("grave-iron").value * shop.buyRate));
    send(sim, map, { type: "sell", shop: shop.id, item: "grave-iron", count: 4 });
    expect(me.bag["grave-iron"]).toBeUndefined();
    expect(me.bag.gold).toBe(each * 4);
    send(sim, map, { type: "sell", shop: shop.id, item: "sunlit-ember", count: 1 });
    expect(me.bag["sunlit-ember"]).toBe(1);
    expect(sellPrice(shop, "gold")).toBe(0);
  });

  it("rolled and forged gear is worth more than its base", () => {
    const base = valueOf("cinder-edge");
    expect(valueOf(gearKey("cinder-edge", [{ id: "keen", q: 3 }]))).toBeGreaterThan(base);
    expect(valueOf(gearKey("cinder-edge", [], 2))).toBeGreaterThan(base);
  });
});

describe("forge", () => {
  it("upgrades a worn sword: pays the tier, the key gains up:1, power rises", () => {
    const { sim, map, me } = village(1000);
    const tier = findForge("bram-forge")!.tiers[0]!;
    for (const [id, n] of Object.entries(tier.items)) me.bag[id] = n;
    const before = me.stats.power;
    send(sim, map, { type: "forge", forge: "bram-forge", op: "upgrade", item: "initiate-blade", from: "weapon" });
    expect(me.weapon).toBe("initiate-blade+up:1");
    expect(me.stats.power).toBe(before + tier.power);
    expect(me.bag.gold).toBe(1000 - tier.gold);
    for (const id of Object.keys(tier.items)) expect(me.bag[id]).toBeUndefined();
  });

  it("refuses without the materials, and past the last tier", () => {
    const { sim, map, me } = village(99999);
    send(sim, map, { type: "forge", forge: "bram-forge", op: "upgrade", item: "initiate-blade", from: "weapon" });
    expect(me.weapon).toBe("initiate-blade");

    const max = findForge("bram-forge")!.tiers.length;
    me.bag[`initiate-blade+up:${max}`] = 1;
    for (const id of ["grave-iron", "deep-ore", "ember-shard", "rift-shard", "hollow-dust"]) me.bag[id] = 999;
    send(sim, map, { type: "forge", forge: "bram-forge", op: "upgrade", item: `initiate-blade+up:${max}`, from: "bag" });
    expect(me.bag[`initiate-blade+up:${max}`]).toBe(1);
  });

  it("rerolls one affix, keeps the others and the tier", () => {
    const { sim, map, me } = village(1000);
    me.bag["ember-shard"] = 5;
    const key = gearKey("cinder-edge", [{ id: "keen", q: 2 }, { id: "brutal", q: 4 }], 1);
    me.bag[key] = 1;
    const brutalAt = parseGear(key).affixes.findIndex((a) => a.id === "brutal");
    send(sim, map, { type: "forge", forge: "bram-forge", op: "reroll", item: key, from: "bag", affix: brutalAt });
    expect(me.bag[key]).toBeUndefined();
    const next = Object.keys(me.bag).find((k) => k.startsWith("cinder-edge"))!;
    const parsed = parseGear(next);
    expect(parsed.tier).toBe(1);
    expect(parsed.affixes.find((a) => a.id === "keen")).toEqual({ id: "keen", q: 2 });
    expect(parsed.affixes).toHaveLength(2);
    expect(normalizeGear(next)).toBe(next);
  });

  it("the tier survives save normalisation and is clamped to the forge's tiers", () => {
    expect(normalizeGear("cinder-edge+keen:5+up:2")).toBe("cinder-edge+keen:5+up:2");
    expect(normalizeGear("cinder-edge+up:99")).toBe(`cinder-edge+up:${findForge("bram-forge")!.tiers.length}`);
  });
});

describe("village projects", () => {
  it("need their prerequisites, cost what they say, and grant their bonus for good", () => {
    const { sim, map, me } = village(5000);
    me.bag["grave-iron"] = 50;
    me.bag["deep-ore"] = 50;
    me.bag["ember-shard"] = 50;
    send(sim, map, { type: "build", project: "training-yard" });
    expect(me.progress!.flags).not.toContain("built:training-yard");

    const hp = me.stats.maxHp;
    send(sim, map, { type: "build", project: "watchtower" });
    expect(me.progress!.flags).toContain("built:watchtower");
    expect(me.stats.maxHp).toBe(hp + 20);
    expect(me.bag.gold).toBe(5000 - 600);

    send(sim, map, { type: "build", project: "watchtower" });
    expect(me.bag.gold).toBe(4400);

    // Bonuses come back with the character (equip applies them on restore).
    const copy = spawnPlayer(sim, "p2", "x", 0, 0);
    restorePlayer(copy, capturePlayer(me));
    expect(copy.stats.maxHp).toBe(me.stats.maxHp);

    send(sim, map, { type: "build", project: "lantern-vigil" });
    expect(xpMultOf(me)).toBeCloseTo(1.1);
  });

  it("discounts apply to shop prices", () => {
    const { me } = village();
    const entry = { item: "healing-draught", price: 40 };
    expect(priceFor(entry, me)).toBe(40);
    me.progress!.flags.push("built:market-awning");
    expect(priceFor(entry, me)).toBe(36);
    expect(offers(findShop("oskar-wares")!, 1, me).filter((o) => o.daily)).toHaveLength(findShop("oskar-wares")!.rotating.count + 2);
  });

  it("a project's rest point only answers its builder", () => {
    const hub = toGameMap(content.maps.get("cinderhold"));
    const bench = hub.objects.find((o) => o.ifFlag === "built:story-circle" && o.interact)!;
    const sim = createSim("cinderhold", 1);
    const me = spawnPlayer(sim, "p1", "x", bench.x, bench.y - 20);
    me.hp = 5;
    stepSim(sim, hub, { p1: { ...emptyIntent(), pressed: ["interact"] } });
    expect(me.hp).toBe(5);
    me.progress!.flags.push("built:story-circle");
    stepSim(sim, hub, { p1: { ...emptyIntent(), pressed: ["interact"] } });
    expect(me.hp).toBe(me.stats.maxHp);
  });
});

describe("rift danger", () => {
  it("raising pays the difference in fuel, lowering is free", () => {
    const rift = toGameMap(content.maps.get("hollow-rift"));
    const brazier = rift.objects.find((o) => o.interact?.kind === "service")!;
    const sim = createSim("hollow-rift", 1);
    const me = spawnPlayer(sim, "p1", "x", brazier.x, brazier.y - 20);
    me.bag["hollow-dust"] = 40;
    const costs = content.rifts.get("endless-night").danger!.costs;
    send(sim, rift, { type: "danger", rift: "endless-night", tier: 2 });
    expect(me.riftDanger).toBe(2);
    expect(me.bag["hollow-dust"]).toBe(40 - costs[1]!);
    send(sim, rift, { type: "danger", rift: "endless-night", tier: 1 });
    expect(me.riftDanger).toBe(1);
    expect(me.bag["hollow-dust"]).toBe(40 - costs[1]!);
    send(sim, rift, { type: "danger", rift: "endless-night", tier: 3 });
    expect(me.riftDanger).toBe(1);
  });

  it("each tier adds its multipliers", () => {
    const per = content.rifts.get("endless-night").danger!.perTier;
    expect(dangerMods("endless-night", 2).gold).toBeCloseTo((per.gold ?? 0) * 2);
    expect(dangerMods("endless-night", 0)).toEqual({});
  });
});

describe("saves", () => {
  it("cosmetics survive a save; unknown ones are dropped, worn ones must be owned", () => {
    const { me } = village();
    me.cosmetics = { owned: ["lantern-frost", "gone-forever"], lantern: "lantern-frost", trail: "trail-void", pet: null };
    const save = { version: 1, savedAt: 0, playtime: 0, map: "cinderhold", time: 0, player: capturePlayer(me) };
    const back = migrateSave(save, () => true)!;
    expect(back.player.cosmetics).toEqual({ owned: ["lantern-frost"], lantern: "lantern-frost", trail: null, pet: null });
  });

  it("NG+ keeps the village projects, not the story", () => {
    const { me } = village();
    me.progress!.flags.push("built:watchtower", "dawnblade-reforged");
    const save = migrateSave({ version: 1, savedAt: 0, playtime: 0, map: "cinderhold", time: 0, player: capturePlayer(me) }, () => true)!;
    expect(newGamePlus(save, 1)!.player.progress.flags).toEqual(["built:watchtower"]);
  });
});
