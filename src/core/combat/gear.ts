import type { Rng } from "../math/rng";
import type { Actor, CombatStats } from "./actor";
import { affixCountFor, allAffixes, allSets, baseOf, findAffix, GEAR_SEP, getShield, getWeapon, isShield, isWeapon, type AffixDef, type AffixStat } from "./defs";

/**
 * Rolled gear. A dropped sword or shield is stored as a key: base id, then each affix with its
 * quality 0..9 (`cinder-edge+keen:5+stalwart:9`). The key holds the roll, the affix content holds
 * the ranges, so rebalancing an affix rescales every copy instead of rerolling it. Identical
 * rolls stack in the bag like any item. Plain ids (starter gear, quest rewards) have no affixes.
 */

export const QUALITY_MAX = 9;

export interface RolledAffix {
  id: string;
  /** 0 (min) .. 9 (max). */
  q: number;
}

export function parseGear(key: string): { base: string; affixes: RolledAffix[] } {
  const [base, ...rest] = key.split(GEAR_SEP);
  const affixes = rest.map((part) => {
    const [id, q] = part.split(":");
    return { id: id ?? "", q: Math.max(0, Math.min(QUALITY_MAX, Math.floor(Number(q) || 0))) };
  });
  return { base: base ?? "", affixes };
}

/** Canonical key (affixes sorted by id so identical rolls stack). */
export function gearKey(base: string, affixes: readonly RolledAffix[]): string {
  return [base, ...[...affixes].sort((a, b) => a.id.localeCompare(b.id)).map((a) => `${a.id}:${a.q}`)].join(GEAR_SEP);
}

/** An affix's value at a quality. Whole-number ranges give whole numbers. */
export function affixValue(def: AffixDef, q: number): number {
  const v = def.min + ((def.max - def.min) * q) / QUALITY_MAX;
  return Number.isInteger(def.min) && Number.isInteger(def.max) ? Math.round(v) : Math.round(v * 1000) / 1000;
}

/** Affixes of a key that still exist, with their values. */
export function gearAffixes(key: string): { def: AffixDef; q: number; value: number }[] {
  return parseGear(key).affixes.flatMap(({ id, q }) => {
    const def = findAffix(id);
    return def ? [{ def, q, value: affixValue(def, q) }] : [];
  });
}

/** Stats the rolled affixes of a key add. */
export function gearStats(key: string | null): Partial<Record<AffixStat, number>> {
  const out: Partial<Record<AffixStat, number>> = {};
  if (!key) return out;
  for (const { def, value } of gearAffixes(key)) out[def.stat] = (out[def.stat] ?? 0) + value;
  return out;
}

const slotOf = (base: string) => (isWeapon(base) ? "weapon" : isShield(base) ? "shield" : null);

/** Rolls the affixes of one dropped copy (count by the base's rarity, distinct affixes fitting its slot). */
export function rollGear(base: string, rng: Rng): string {
  const slot = slotOf(base);
  if (!slot) return base;
  const rarity = slot === "weapon" ? getWeapon(base).rarity : getShield(base).rarity;
  let pool = allAffixes().filter((a) => (a.slot === "any" || a.slot === slot) && a.weight > 0);
  const rolled: RolledAffix[] = [];
  for (let i = affixCountFor(rarity); i > 0 && pool.length; i--) {
    const def = rng.weighted(pool.map((a) => [a, a.weight] as const));
    pool = pool.filter((a) => a.stat !== def.stat); // one affix per stat
    rolled.push({ id: def.id, q: rng.int(0, QUALITY_MAX) });
  }
  return gearKey(base, rolled);
}

/**
 * Cleans a key read from a save or a peer: null if the base is gone; unknown affixes, affixes that
 * don't fit the slot, and duplicates are dropped.
 */
export function normalizeGear(key: string): string | null {
  const { base, affixes } = parseGear(key);
  const slot = slotOf(base);
  if (!slot) return null;
  const seen = new Set<string>();
  const kept = affixes.filter(({ id }) => {
    const def = findAffix(id);
    if (!def || (def.slot !== "any" && def.slot !== slot) || seen.has(def.stat)) return false;
    seen.add(def.stat);
    return true;
  });
  return gearKey(base, kept);
}

/** Sets the actor is wearing pieces of, with how many pieces and which bonuses are active. */
export function activeSets(a: Pick<Actor, "weapon" | "shield">) {
  const worn = [a.weapon, a.shield].filter((k): k is string => !!k).map(baseOf);
  return allSets()
    .map((set) => {
      const count = set.pieces.filter((p) => worn.includes(p)).length;
      return { set, count, bonuses: set.bonuses.filter((b) => count >= b.pieces) };
    })
    .filter((s) => s.count > 0);
}

/** Stats from complete-enough sets. */
export function setStats(a: Pick<Actor, "weapon" | "shield">): Partial<CombatStats> {
  const out: Partial<CombatStats> = {};
  for (const { bonuses } of activeSets(a)) for (const b of bonuses) for (const [k, v] of Object.entries(b.stats) as [AffixStat, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}
