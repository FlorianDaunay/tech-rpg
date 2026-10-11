import type { Rng } from "../math/rng";
import { isShield, isWeapon, type LootTableDef } from "./defs";
import { rollGear } from "./gear";

export const GOLD = "gold";

export interface Drop {
  item: string;
  count: number;
}

/** Rolls a loot table. Same rng state → same drops (deterministic, shared by all peers). */
export function rollLoot(table: LootTableDef, rng: Rng): Drop[] {
  const drops: Drop[] = [];
  const gold = table.gold.max > 0 ? rng.int(table.gold.min, table.gold.max) : 0;
  if (gold > 0) drops.push({ item: GOLD, count: gold });
  if (table.entries.length === 0) return drops;
  for (let i = 0; i < table.rolls; i++) {
    if (!rng.chance(table.chance)) continue;
    const entry = rng.weighted(table.entries.map((e) => [e, e.weight] as const));
    const count = rng.int(entry.min, entry.max);
    if (isWeapon(entry.item) || isShield(entry.item)) {
      // Each sword or shield rolls its own affixes.
      for (let n = 0; n < count; n++) drops.push({ item: rollGear(entry.item, rng), count: 1 });
      continue;
    }
    const same = drops.find((d) => d.item === entry.item);
    if (same) same.count += count;
    else drops.push({ item: entry.item, count });
  }
  return drops;
}
