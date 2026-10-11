import type { CombatStats } from "./actor";
import type { Move } from "./moves";

/**
 * Data the combat rules need, as plain interfaces. Content JSON (src/content) is validated by zod
 * and must satisfy these shapes; core never imports content. The game registers the data at boot
 * (`registerCombatData`), tests register fixtures or the real JSON.
 */

export const ELEMENTS = ["ember", "frost", "storm", "hollow"] as const;
export type Element = (typeof ELEMENTS)[number];

/** One stage of a boss fight, active once hp drops to `below` (fraction of max; the first is 1). */
export interface BossPhase {
  below: number;
  /** Weighted attacks; `range` = distance it closes to before starting that move. */
  attacks: { move: string; weight: number; range: number }[];
  /** Seconds between attacks in this phase. */
  attackCooldown: number;
  /** Movement speed multiplier in this phase. */
  speed: number;
  /** Adds called on entering the phase (and every `every` seconds if set), at most `count` alive. */
  summon?: { enemy: string; count: number; every?: number };
}

/** A Herald: multi-phase fight in an arena (exits lock while it is engaged). */
export interface BossDef {
  /** Arena radius around its spawn: it never leaves it and forgets players outside. */
  arena: number;
  phases: BossPhase[];
  /** Story flag every player gets when it falls. */
  flag?: string;
}

export interface EnemyDef {
  id: string;
  look: string;
  stats: CombatStats;
  /** Behaviour: melee chaser, heavy slow brute, ranged kiter. */
  ai: "melee" | "brute" | "ranged";
  attack: string;
  aggroRange: number;
  attackRange: number;
  /** Seconds between attacks. */
  attackCooldown: number;
  radius: number;
  xp: number;
  loot?: string;
  /** Damage taken multiplier per element (missing = 1). */
  resist: Partial<Record<Element, number>>;
  boss?: BossDef;
}

export interface StatusDef {
  id: string;
  element?: Element;
  /** Seconds. */
  duration: number;
  maxStacks: number;
  /** Damage per tick per stack, as a fraction of the applier's power. */
  tickDamage: number;
  tickInterval: number;
  /** Multiplies movement speed (frozen < 1). */
  speedMult: number;
  /** Multiplies damage taken (vulnerable > 1). */
  damageTakenMult: number;
  /** Can't act while it lasts. */
  stun: boolean;
}

/** Two elements meeting on one target: consumes the existing status and triggers an effect. */
export interface ReactionDef {
  id: string;
  /** Element already on the target (via a status). */
  on: Element;
  /** Element of the incoming hit. */
  by: Element;
  /** Bonus damage as a fraction of the hit's power. */
  damage: number;
  /** Radius of the burst (0 = only the target). */
  radius: number;
  /** Status applied by the reaction. */
  applies?: string;
  /** Extra poise damage (reactions break guards). */
  poise: number;
}

export interface WeaponDef {
  id: string;
  /** Moveset family, trained by weapon mastery. */
  family?: string;
  /** Decides how many affixes a dropped copy rolls (see `affixCount`). */
  rarity?: string;
  /** First move of the light combo. */
  light: string;
  heavy: string;
  element?: Element;
  /** Status a hit may apply. */
  onHit?: { status: string; chance: number };
  /** Added to the wielder's base stats. */
  bonus: Partial<Pick<CombatStats, "power" | "critChance" | "critMultiplier" | "speed">>;
}

export interface ShieldDef {
  id: string;
  rarity?: string;
  /** Damage blocked (fraction). */
  reduction: number;
  /** Perfect-parry window, seconds. */
  parryWindow: number;
  /** Stamina lost per blocked damage point. */
  staminaPerDamage: number;
  defense: number;
}

export interface LootEntry {
  item: string;
  weight: number;
  min: number;
  max: number;
}

export interface LootTableDef {
  id: string;
  rolls: number;
  /** Chance that each roll drops anything at all. */
  chance: number;
  entries: LootEntry[];
  gold: { min: number; max: number };
}

/** Bag items the rules care about (consumable effects). */
export interface ItemDef {
  id: string;
  kind: "currency" | "material" | "consumable" | "key";
  effect?: { heal?: number; stamina?: number; status?: string };
}

export const SKILL_SLOTS = ["skill1", "skill2", "ultimate"] as const;
export type SkillSlot = (typeof SKILL_SLOTS)[number];

/** An active ability: a move with a cooldown, unlocked by level. Ultimates also need a full Ember gauge. */
export interface SkillDef {
  id: string;
  kind: "skill" | "ultimate";
  /** The move it performs (melee, area or projectile). */
  move: string;
  /** Seconds before it can be used again. */
  cooldown: number;
  unlockLevel: number;
  /** Ultimates: damage the player must deal to fill the Ember gauge. */
  charge: number;
}

export const TALENT_TREES = ["blade", "ward", "arcana"] as const;
export type TalentTree = (typeof TALENT_TREES)[number];
export const TALENT_STATS = ["maxHp", "power", "defense", "critChance", "critMultiplier", "maxPoise", "speed"] as const;

/** A star of the talent constellation. Effects are per rank. */
export interface TalentDef {
  id: string;
  tree: TalentTree;
  ranks: number;
  /** Points per rank. */
  cost: number;
  /** Talents that must have at least one rank first. */
  requires: string[];
  /** Points already spent in this tree before it opens. */
  treePoints: number;
  /** Constellation grid position (column, row). */
  x: number;
  y: number;
  stats: Partial<Record<(typeof TALENT_STATS)[number], number>>;
  /** Skill cooldowns shortened by this fraction. */
  cooldown: number;
  /** Ember gauge fills this fraction faster. */
  ultGain: number;
  /** Unlocks a skill regardless of its level. */
  skill?: string;
}

export const AFFIX_STATS = ["maxHp", "power", "defense", "critChance", "critMultiplier", "maxPoise", "speed"] as const;
export type AffixStat = (typeof AFFIX_STATS)[number];

/** A random property rolled on a dropped sword or shield: one stat between min and max. */
export interface AffixDef {
  id: string;
  slot: "weapon" | "shield" | "any";
  stat: AffixStat;
  min: number;
  max: number;
  /** Relative chance among the affixes that fit the slot. */
  weight: number;
}

/** Gear worn together: each bonus applies once that many pieces are equipped. */
export interface GearSetDef {
  id: string;
  pieces: string[];
  bonuses: { pieces: number; stats: Partial<Record<AffixStat, number>> }[];
}

export interface CombatData {
  moves: Record<string, Move>;
  enemies: Record<string, EnemyDef>;
  statuses: Record<string, StatusDef>;
  reactions: ReactionDef[];
  weapons: Record<string, WeaponDef>;
  shields: Record<string, ShieldDef>;
  loot: Record<string, LootTableDef>;
  items: Record<string, ItemDef>;
  skills: Record<string, SkillDef>;
  talents: Record<string, TalentDef>;
  affixes: Record<string, AffixDef>;
  sets: Record<string, GearSetDef>;
  /** Affixes a dropped sword/shield rolls, by its rarity (missing = none). */
  affixCount: Record<string, number>;
}

let data: CombatData | null = null;

export function registerCombatData(d: CombatData): void {
  data = d;
}

function db(): CombatData {
  if (!data) throw new Error("Combat data not registered (call registerCombatData at boot)");
  return data;
}

const getter =
  <K extends Exclude<keyof CombatData, "reactions">>(key: K, label: string) =>
  (id: string): CombatData[K][string] => {
    const v = db()[key][id];
    if (!v) throw new Error(`Unknown ${label} "${id}"`);
    return v as CombatData[K][string];
  };

export const getMove = getter("moves", "move");
export const getEnemy = getter("enemies", "enemy");
export const getStatus = getter("statuses", "status");
/**
 * Gear in bags and slots is a key: the base id, then rolled affixes (`cinder-edge+keen:5+ward:9`,
 * see core/combat/gear). Lookups by key resolve to the base definition.
 */
export const GEAR_SEP = "+";
export const baseOf = (key: string): string => {
  const i = key.indexOf(GEAR_SEP);
  return i < 0 ? key : key.slice(0, i);
};
const weaponGetter = getter("weapons", "weapon");
const shieldGetter = getter("shields", "shield");
export const getWeapon = (key: string): WeaponDef => weaponGetter(baseOf(key));
export const getShield = (key: string): ShieldDef => shieldGetter(baseOf(key));
export const findAffix = (id: string): AffixDef | undefined => db().affixes?.[id];
export const allAffixes = (): AffixDef[] => Object.values(db().affixes ?? {});
export const allSets = (): GearSetDef[] => Object.values(db().sets ?? {});
export const affixCountFor = (rarity: string | undefined): number => (rarity ? (db().affixCount?.[rarity] ?? 0) : 0);
export const getLootTable = getter("loot", "loot table");
export const getSkill = getter("skills", "skill");
export const findSkill = (id: string): SkillDef | undefined => db().skills[id];
export const allSkills = (): SkillDef[] => Object.values(db().skills);
export const findTalent = (id: string): TalentDef | undefined => db().talents[id];
export const allTalents = (): TalentDef[] => Object.values(db().talents);
export const findItem = (id: string): ItemDef | undefined => db().items[id];
export const isWeapon = (key: string) => baseOf(key) in db().weapons;
export const isShield = (key: string) => baseOf(key) in db().shields;
export const findReaction = (on: Element, by: Element) => db().reactions.find((r) => r.on === on && r.by === by);
