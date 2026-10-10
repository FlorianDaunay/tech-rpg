import { beforeAll, describe, expect, it } from "vitest";
import { combatData } from "@/content/combat";
import { playerProgression } from "@/content/narrative";
import { applyCommand } from "../combat/commands";
import { findTalent, registerCombatData } from "../combat/defs";
import type { SimEvent } from "../combat/events";
import { skillCooldown, talentMods } from "../combat/skills";
import { createSim, spawnPlayer } from "../sim/state";
import { grantXp, registerProgression, setLevel, statsAtLevel, xpToNext } from "./level";
import { learnBlocker, talentPointsLeft } from "./talents";

beforeAll(() => {
  registerCombatData(combatData());
  registerProgression(playerProgression());
});

function player(level = 1) {
  const p = spawnPlayer(createSim("room", 1), "p1", "x", 100, 100);
  setLevel(p, level);
  return p;
}
const learn = (p: ReturnType<typeof player>, talent: string, events: SimEvent[] = []) => (applyCommand(events, p, { type: "talent", talent }), events);

describe("talents", () => {
  it("one point per level above 1", () => {
    expect(talentPointsLeft(player(1))).toBe(0);
    expect(talentPointsLeft(player(5))).toBe(4 * playerProgression().talentPointsPerLevel);
  });

  it("learning needs points, prerequisites and tree investment; ranks cap", () => {
    expect(learnBlocker(player(1), "keen-edge")).toBe("points");
    const p = player(10);
    expect(learnBlocker(p, "precision")).toBe("requires");
    for (let i = 0; i < 3; i++) learn(p, "keen-edge");
    expect(p.talents["keen-edge"]).toBe(3);
    expect(learnBlocker(p, "keen-edge")).toBe("maxed");
    learn(p, "keen-edge");
    expect(p.talents["keen-edge"]).toBe(3);
    learn(p, "precision");
    expect(learnBlocker(p, "executioner")).toBe("tree"); // needs 5 points in Blade, 4 spent
  });

  it("talent stats add to the level stats and survive levelling", () => {
    const p = player(4);
    learn(p, "iron-skin");
    learn(p, "iron-skin");
    const per = findTalent("iron-skin")!.stats.defense!;
    expect(p.baseStats.defense).toBe(statsAtLevel(4).defense + 2 * per);
    grantXp([], p, xpToNext(4));
    expect(p.level).toBe(5);
    expect(p.baseStats.defense).toBe(statsAtLevel(5).defense + 2 * per);
  });

  it("a talent can unlock a skill early, and a respec takes it back out of the loadout", () => {
    const p = player(5); // Storm Rush unlocks at 6 by level
    expect(p.loadout.skill2).not.toBe("storm-rush");
    learn(p, "keen-edge");
    learn(p, "fleetfoot");
    learn(p, "fleetfoot");
    const events = learn(p, "thunderstep");
    expect(events).toContainEqual({ type: "skill-unlocked", id: "p1", skill: "storm-rush" });
    applyCommand([], p, { type: "loadout", slot: "skill2", skill: "storm-rush" });
    expect(p.loadout.skill2).toBe("storm-rush");
    applyCommand([], p, { type: "respec" });
    expect(p.talents).toEqual({});
    expect(talentPointsLeft(p)).toBe(4);
    expect(Object.values(p.loadout)).not.toContain("storm-rush");
    expect(p.baseStats).toEqual(statsAtLevel(5));
  });

  it("loadout: only unlocked skills of the slot's kind; equipping the other slot's skill swaps", () => {
    const p = player(6);
    const { skill1, skill2 } = p.loadout;
    applyCommand([], p, { type: "loadout", slot: "ultimate", skill: skill1! });
    expect(p.loadout.ultimate).not.toBe(skill1);
    applyCommand([], p, { type: "loadout", slot: "skill1", skill: skill2! });
    expect(p.loadout.skill1).toBe(skill2);
    expect(p.loadout.skill2).toBe(skill1);
    const low = player(1);
    applyCommand([], low, { type: "loadout", slot: "skill2", skill: "storm-rush" });
    expect(low.loadout.skill2).not.toBe("storm-rush");
  });

  it("Arcana shortens skill cooldowns", () => {
    const p = player(6);
    learn(p, "kindling");
    for (let i = 0; i < 3; i++) learn(p, "quickened-rites");
    expect(talentMods(p).cooldown).toBeCloseTo(3 * findTalent("quickened-rites")!.cooldown);
    expect(talentMods(p).ultGain).toBeCloseTo(findTalent("kindling")!.ultGain);
    expect(skillCooldown(p, "flame-lash")).toBe(0);
  });
});
