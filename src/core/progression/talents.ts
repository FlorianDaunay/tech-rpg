import type { Actor, CombatStats } from "../combat/actor";
import { allTalents, findTalent, TALENT_STATS, type TalentDef, type TalentTree } from "../combat/defs";
import type { SimEvent } from "../combat/events";
import { refreshLoadout, unlockedSkills } from "../combat/skills";
import { progression, recomputeStats } from "./level";

/** What the talent rules read (the UI passes its inventory view, the sim an Actor). */
export type TalentHolder = Pick<Actor, "level" | "talents">;

/** Points earned by levelling (level 1 has none). */
export const talentPointsEarned = (a: TalentHolder) => Math.max(0, a.level - 1) * progression().talentPointsPerLevel;

export function talentPointsSpent(a: TalentHolder, tree?: TalentTree): number {
  let n = 0;
  for (const [id, rank] of Object.entries(a.talents)) {
    const def = findTalent(id);
    if (def && (!tree || def.tree === tree)) n += def.cost * rank;
  }
  return n;
}

export const talentPointsLeft = (a: TalentHolder) => talentPointsEarned(a) - talentPointsSpent(a);

export type LearnBlocker = "unknown" | "maxed" | "points" | "requires" | "tree";

/** Why the next rank can't be learned (null = it can). Shared by the sim and the talent screen. */
export function learnBlocker(a: TalentHolder, id: string): LearnBlocker | null {
  const def = findTalent(id);
  if (!def) return "unknown";
  if ((a.talents[id] ?? 0) >= def.ranks) return "maxed";
  if (def.requires.some((r) => !a.talents[r])) return "requires";
  if (talentPointsSpent(a, def.tree) < def.treePoints) return "tree";
  if (talentPointsLeft(a) < def.cost) return "points";
  return null;
}

/** Learns one rank (validated: the host never trusts the client). */
export function learnTalent(events: SimEvent[], a: Actor, id: string): boolean {
  if (learnBlocker(a, id)) return false;
  const before = unlockedSkills(a);
  a.talents[id] = (a.talents[id] ?? 0) + 1;
  recomputeStats(a);
  refreshLoadout(events, a, before);
  events.push({ type: "talent", id: a.id, talent: id, rank: a.talents[id]! });
  return true;
}

/** Refunds every talent. Skills only a talent unlocked leave the loadout. */
export function resetTalents(events: SimEvent[], a: Actor): void {
  if (!Object.keys(a.talents).length) return;
  a.talents = {};
  recomputeStats(a);
  refreshLoadout(null, a);
  events.push({ type: "talent", id: a.id, talent: null, rank: 0 });
}

/** Stats added by learned talents. */
export function talentStats(a: Actor): Partial<CombatStats> {
  const out: Partial<CombatStats> = {};
  for (const [id, rank] of Object.entries(a.talents)) {
    const def = findTalent(id);
    if (!def) continue;
    for (const k of TALENT_STATS) {
      const v = def.stats[k];
      if (v) out[k] = (out[k] ?? 0) + v * rank;
    }
  }
  return out;
}

/** Talents of a tree in constellation order (rows, then columns). */
export const treeTalents = (tree: TalentTree): TalentDef[] =>
  allTalents()
    .filter((t) => t.tree === tree)
    .sort((x, y) => x.y - y.y || x.x - y.x);
