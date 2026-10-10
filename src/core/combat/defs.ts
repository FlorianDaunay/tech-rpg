import type { CombatStats } from "./actor";
import type { Move } from "./moves";

/**
 * Data the combat rules need, as plain interfaces. Content JSON (src/content) is validated by zod
 * and must satisfy these shapes; core never imports content. The game registers the data at boot
 * (`registerCombatData`), tests register fixtures or the real JSON.
 */

export const ELEMENTS = ["ember", "frost", "storm", "hollow"] as const;
export type Element = (typeof ELEMENTS)[number];

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

export interface CombatData {
  moves: Record<string, Move>;
  enemies: Record<string, EnemyDef>;
  statuses: Record<string, StatusDef>;
  reactions: ReactionDef[];
  weapons: Record<string, WeaponDef>;
  shields: Record<string, ShieldDef>;
  loot: Record<string, LootTableDef>;
  items: Record<string, ItemDef>;
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
export const getWeapon = getter("weapons", "weapon");
export const getShield = getter("shields", "shield");
export const getLootTable = getter("loot", "loot table");
export const findItem = (id: string): ItemDef | undefined => db().items[id];
export const isWeapon = (id: string) => id in db().weapons;
export const isShield = (id: string) => id in db().shields;
export const findReaction = (on: Element, by: Element) => db().reactions.find((r) => r.on === on && r.by === by);
