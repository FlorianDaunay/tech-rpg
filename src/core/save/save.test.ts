import { beforeAll, describe, expect, it } from "vitest";
import { registerContent } from "@/content/boot";
import { content } from "@/content/registry";
import { applyCommand } from "../combat/commands";
import { equip } from "../combat/equipment";
import { createSim, spawnPlayer } from "../sim/state";
import { grantXp, xpToNext } from "../progression/level";
import { captureSave, capturePlayer, migrateSave, newGamePlus, restorePlayer, SAVE_VERSION } from "./save";

beforeAll(registerContent);

const mapExists = (id: string) => !!content.maps.find(id);
const fresh = () => spawnPlayer(createSim("cinderhold", 1), "p1", "x", 100, 100, { weapon: "initiate-blade", shield: "initiate-buckler" });

function veteran() {
  const p = fresh();
  grantXp([], p, xpToNext(1) + xpToNext(2) + xpToNext(3) + 7);
  applyCommand([], p, { type: "talent", talent: "iron-skin" });
  applyCommand([], p, { type: "talent", talent: "kindling" });
  p.bag = { gold: 42, "rift-shard": 2 };
  p.progress!.flags.push("met-maelis");
  p.progress!.quests["first-ember"] = { done: false, counts: { o1: 1 } };
  p.ultCharge = 33;
  p.mastery = { blade: 120, rapier: 5 };
  equip(p, p.weapon, p.shield);
  p.hp = 50;
  return p;
}

describe("save", () => {
  it("round-trips a player through JSON", () => {
    const p = veteran();
    const json = JSON.parse(JSON.stringify(captureSave(p, "deep-mines", 123, 456, 789)));
    const save = migrateSave(json, mapExists)!;
    expect(save).not.toBeNull();
    expect(save).toMatchObject({ version: SAVE_VERSION, map: "deep-mines", time: 123, playtime: 456, savedAt: 789, x: p.x, y: p.y });
    const q = fresh();
    restorePlayer(q, save.player);
    expect(capturePlayer(q)).toEqual(capturePlayer(p));
    expect(q.stats).toEqual(p.stats);
  });

  it("keeps the fog of war: explored maps survive saving, garbage is dropped, NG+ remembers the world", () => {
    const p = veteran();
    p.progress!.explored = { "deep-mines": "AB_-9z", "frostfell-reach": "Qw" };
    const raw = JSON.parse(JSON.stringify(captureSave(p, "deep-mines", 0, 0, 0)));
    raw.player.progress.explored["bad"] = 42;
    raw.player.progress.explored["worse"] = "<script>";
    const save = migrateSave(raw, mapExists)!;
    expect(save.player.progress.explored).toEqual({ "deep-mines": "AB_-9z", "frostfell-reach": "Qw" });
    save.player.progress.flags.push("dawnblade-reforged");
    expect(newGamePlus(save, 0)!.player.progress.explored).toEqual(save.player.progress.explored);
    delete raw.player.progress.explored;
    expect(migrateSave(raw, mapExists)!.player.progress.explored).toEqual({});
  });

  it("drops content that no longer exists and clamps talent ranks", () => {
    const p = veteran();
    const raw = JSON.parse(JSON.stringify(captureSave(p, "deep-mines", 0, 0, 0)));
    raw.player.bag["removed-item"] = 3;
    raw.player.talents["removed-talent"] = 1;
    raw.player.talents["iron-skin"] = 99;
    raw.player.loadout.skill2 = "removed-skill";
    raw.player.progress.quests["removed-quest"] = { done: true, counts: {} };
    raw.player.weapon = "removed-sword";
    const save = migrateSave(raw, mapExists)!;
    expect(save.player.bag).toEqual({ gold: 42, "rift-shard": 2 });
    expect(save.player.talents["removed-talent"]).toBeUndefined();
    expect(save.player.talents["iron-skin"]).toBe(content.talents.get("iron-skin").ranks);
    expect(save.player.loadout.skill2).toBeNull();
    expect(save.player.progress.quests["removed-quest"]).toBeUndefined();
    expect(save.player.weapon).toBeNull();
  });

  it("a removed map falls back to the hub", () => {
    const raw = JSON.parse(JSON.stringify(captureSave(veteran(), "deep-mines", 0, 0, 0)));
    raw.map = "sunken-temple";
    const save = migrateSave(raw, mapExists)!;
    expect(save.map).toBe("cinderhold");
    expect(save.x).toBe(-1);
  });

  it("rejects things that aren't saves, and saves from a newer version", () => {
    expect(migrateSave(null, mapExists)).toBeNull();
    expect(migrateSave("hello", mapExists)).toBeNull();
    expect(migrateSave({ version: 1 }, mapExists)).toBeNull();
    const raw = JSON.parse(JSON.stringify(captureSave(veteran(), "deep-mines", 0, 0, 0)));
    expect(migrateSave({ ...raw, version: SAVE_VERSION + 1 }, mapExists)).toBeNull();
  });

  it("missing fields get safe defaults", () => {
    const save = migrateSave({ version: 1, map: "cinderhold", player: {} }, mapExists)!;
    expect(save.player).toMatchObject({ level: 1, xp: 0, bag: {}, talents: {}, mastery: {}, weapon: null, shield: null });
    const p = fresh();
    restorePlayer(p, save.player);
    expect(p.hp).toBeGreaterThan(0);
  });
});
