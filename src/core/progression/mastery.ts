import type { Actor, CombatStats } from "../combat/actor";
import { getWeapon } from "../combat/defs";

export const MASTERY_STATS = ["power", "critChance", "critMultiplier", "maxPoise", "speed"] as const;
export type MasteryStat = (typeof MASTERY_STATS)[number];

/** Weapon mastery: kills made with a sword family train it; its levels add stats while wielding that family. */
export interface MasteryDef {
  maxLevel: number;
  /** XP to leave mastery level L = round(xpBase × (L+1)^xpExponent) (level 0 = untrained). */
  xpBase: number;
  xpExponent: number;
  /** Stats per mastery level, by sword family. */
  families: Record<string, Partial<Record<MasteryStat, number>>>;
}

const NONE: MasteryDef = { maxLevel: 0, xpBase: 1, xpExponent: 1, families: {} };
let def: MasteryDef = NONE;
export const registerMastery = (d: MasteryDef | undefined) => void (def = d ?? NONE);
export const masteryDef = () => def;

/** XP to go from mastery `level` to the next (Infinity at the cap). */
export function masteryToNext(level: number, d: MasteryDef = def): number {
  if (level >= d.maxLevel) return Infinity;
  return Math.max(1, Math.round(d.xpBase * Math.pow(level + 1, d.xpExponent)));
}

/** Level and progress inside it, from the total XP earned with a family. */
export function masteryLevel(total: number, d: MasteryDef = def): { level: number; xp: number; next: number } {
  let level = 0;
  let xp = Math.max(0, total);
  while (xp >= masteryToNext(level, d)) {
    xp -= masteryToNext(level, d);
    level++;
  }
  return { level, xp: level >= d.maxLevel ? 0 : xp, next: masteryToNext(level, d) };
}

/** Sword family in hand (null = unarmed or no family). */
export const wieldedFamily = (a: Actor): string | null => (a.weapon ? getWeapon(a.weapon).family ?? null : null);

/** Stats the wielded family's mastery adds. */
export function masteryStats(a: Actor): Partial<CombatStats> {
  const family = wieldedFamily(a);
  const per = family ? def.families[family] : undefined;
  if (!per) return {};
  const { level } = masteryLevel(a.mastery[family!] ?? 0);
  return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * level]));
}
