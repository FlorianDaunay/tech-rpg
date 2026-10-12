import { z } from "zod";
import { AFFIX_STATS } from "@/core/combat/defs";
import type { CosmeticDef, ForgeDef, ProjectDef, ShopDef } from "@/core/economy/defs";
import { Id, LocalizedText, ref, refAny } from "./common";

/**
 * Economy content: shops, the forge, Cinderhold's building projects, cosmetics. Each schema's output
 * must satisfy the matching `core/economy/defs` interface (checked below).
 */

const Ware = refAny(["item", "sword", "shield", "cosmetic"]);
const Costs = z.record(ref("item"), z.number().int().min(1)).default({}).describe("Materials (item id → count)");
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour #RRGGBB");

export const ShopSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    npc: ref("npc").describe("Who runs it: players must stand near them"),
    sells: z.array(z.object({ item: Ware, price: z.number().int().min(1) })).default([]).describe("Always on the shelf"),
    rotating: z
      .object({
        count: z.number().int().min(0).default(0).describe("Daily items shown"),
        pool: z.array(z.object({ item: Ware, price: z.number().int().min(1), weight: z.number().positive().default(1) })).default([]),
      })
      .default({ count: 0, pool: [] })
      .describe("Daily selection (same for everyone, changes at midnight UTC)"),
    buyRate: z.number().min(0).max(1).default(0).describe("Fraction of an item's value paid to players who sell (0 = doesn't buy)"),
  })
  .describe("Shop");

export const ForgeSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    npc: ref("npc"),
    tiers: z
      .array(z.object({ gold: z.number().int().min(0), items: Costs, power: z.number().nonnegative().describe("Total power at this tier (weapons)"), defense: z.number().nonnegative().describe("Total defense at this tier (shields)") }))
      .min(1)
      .describe("+1, +2, … : cost and total bonus"),
    reroll: z.object({ gold: z.number().int().min(0), items: Costs }).describe("Cost of rerolling one affix"),
  })
  .describe("Forge");

export const ProjectSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    npc: ref("npc").describe("Who takes the donation"),
    cost: z.object({ gold: z.number().int().min(0), items: Costs }),
    requires: z.array(ref("project")).default([]).describe("Projects that must stand first"),
    effects: z
      .object({
        stats: z.partialRecord(z.enum(AFFIX_STATS), z.number()).optional().describe("Permanent stat bonus"),
        xp: z.number().min(0).optional().describe("XP bonus (0.05 = +5 %)"),
        shopDiscount: z.number().min(0).max(0.5).optional(),
        forgeDiscount: z.number().min(0).max(0.5).optional(),
        rotatingSlots: z.number().int().min(0).optional().describe("Extra daily items in shops"),
      })
      .default({}),
  })
  .describe("Village project");

export const CosmeticSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    kind: z.enum(["lantern", "trail", "pet"]).describe("Lantern light colour, footstep trail, or a pet trinket"),
    color: Hex,
    shape: z.enum(["bow", "crown", "scarf", "bell"]).optional().describe("Pet trinkets only"),
  })
  .describe("Cosmetic");

// Compile-time contract: content must satisfy what the economy rules read.
type Assert<T extends true> = T;
type Fits<A, B> = A extends B ? true : false;
export type _EconomyContracts = [
  Assert<Fits<z.infer<typeof ShopSchema>, ShopDef>>,
  Assert<Fits<z.infer<typeof ForgeSchema>, ForgeDef>>,
  Assert<Fits<z.infer<typeof ProjectSchema>, ProjectDef>>,
  Assert<Fits<z.infer<typeof CosmeticSchema>, CosmeticDef>>,
];
