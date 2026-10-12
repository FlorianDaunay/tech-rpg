import type { AffixStat } from "../combat/defs";
import type { Modifier } from "../combat/modifiers";

/**
 * Economy content as core sees it (core never imports content: the content layer registers it at
 * boot). Shops, Bram's forge, Cinderhold's building projects, cosmetics, Rift danger.
 */

export interface ShopEntry {
  /** Item, sword, shield or cosmetic id. */
  item: string;
  price: number;
}

export interface ShopDef {
  id: string;
  /** NPC who runs it (players must stand near them to trade). */
  npc: string;
  /** Always on the shelf. */
  sells: ShopEntry[];
  /** A daily selection from a pool (same for everyone, from the date seed). */
  rotating: { count: number; pool: (ShopEntry & { weight: number })[] };
  /** Fraction of an item's value paid when buying from players (0 = doesn't buy). */
  buyRate: number;
}

export interface ForgeTier {
  gold: number;
  items: Record<string, number>;
  /** Total bonus at this tier (weapons gain power, shields defense). */
  power: number;
  defense: number;
}

export interface ForgeDef {
  id: string;
  npc: string;
  /** tiers[0] = the cost and bonus of +1, and so on. */
  tiers: ForgeTier[];
  /** Rerolling one affix. */
  reroll: { gold: number; items: Record<string, number> };
}

export interface ProjectEffects {
  stats?: Partial<Record<AffixStat, number>>;
  /** Added to the XP multiplier (0.05 = +5 %). */
  xp?: number;
  /** Fraction off shop prices. */
  shopDiscount?: number;
  /** Fraction off forge gold costs. */
  forgeDiscount?: number;
  /** Extra daily items in every shop. */
  rotatingSlots?: number;
}

export interface ProjectDef {
  id: string;
  /** Who takes the donation. */
  npc: string;
  cost: { gold: number; items: Record<string, number> };
  /** Other projects that must stand first. */
  requires: string[];
  effects: ProjectEffects;
}

export type CosmeticKind = "lantern" | "trail" | "pet";

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  /** Light / trail / trinket colour (#RRGGBB). */
  color: string;
  /** Pet trinkets: what it looks like. */
  shape?: "bow" | "crown" | "scarf" | "bell";
}

/** Making a Rift run harder for better spoils (lit at a brazier by the gate). */
export interface DangerDef {
  rift: string;
  /** What feeds the brazier. */
  item: string;
  /** Total cost to reach tier 1, 2, 3... */
  costs: number[];
  /** Added to each multiplier per tier (0.25 → ×1.25, ×1.5…). */
  perTier: Partial<Record<Modifier, number>>;
}

export interface EconomyData {
  shops: Record<string, ShopDef>;
  forges: Record<string, ForgeDef>;
  projects: Record<string, ProjectDef>;
  cosmetics: Record<string, CosmeticDef>;
  dangers: Record<string, DangerDef>;
}

let data: EconomyData = { shops: {}, forges: {}, projects: {}, cosmetics: {}, dangers: {} };

export function registerEconomy(d: EconomyData): void {
  data = d;
}

export const economy = () => data;
export const findShop = (id: string) => data.shops[id];
export const findForge = (id: string) => data.forges[id];
export const findProject = (id: string) => data.projects[id];
export const allProjects = () => Object.values(data.projects);
export const findCosmetic = (id: string) => data.cosmetics[id];
export const findDanger = (rift: string) => data.dangers[rift];
/** Upgrade tiers (the forge's; one forge in the world). */
export const forgeTiers = (): ForgeTier[] => Object.values(data.forges)[0]?.tiers ?? [];
