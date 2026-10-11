/**
 * World modifiers (difficulty × Omens × NG+ cycle), all multipliers, 1 = unchanged. The sim holds
 * the combined set; combat rules read it from the world (see core/sim/rules for how it is built).
 */
export const MODIFIERS = ["enemyHp", "enemyDamage", "enemySpeed", "enemyAttackRate", "xp", "gold", "lootChance", "healing"] as const;
export type Modifier = (typeof MODIFIERS)[number];
export type Modifiers = Record<Modifier, number>;

export const NEUTRAL_MODS: Modifiers = Object.freeze(Object.fromEntries(MODIFIERS.map((m) => [m, 1])) as Modifiers);

/** A modifier of a world (worlds built without rules are neutral). */
export const modOf = (w: { mods?: Modifiers }, m: Modifier): number => w.mods?.[m] ?? 1;
