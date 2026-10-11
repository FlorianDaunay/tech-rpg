import { z } from "zod";
import type { ProgressionDef } from "@/core/progression/level";
import { Id, RaritySchema, SwordFamilySchema } from "./common";
import { MODIFIERS } from "@/core/combat/modifiers";

const Gain = z.number().nonnegative();

/** Character growth: XP curve and stats per level. The game uses the entry with id "player". */
export const ProgressionSchema = z
  .object({
    id: Id,
    maxLevel: z.number().int().min(1).default(30).describe("Level cap"),
    xpBase: z.number().positive().default(40).describe("XP to leave level L = round(xpBase × L^xpExponent)"),
    xpExponent: z.number().min(0).default(1.5).describe("Curve steepness (1 = linear)"),
    perLevel: z
      .object({ maxHp: Gain.optional(), power: Gain.optional(), defense: Gain.optional(), critChance: z.number().min(0).max(0.05).optional(), maxPoise: Gain.optional() })
      .default({})
      .describe("Stats gained per level above 1"),
    talentPointsPerLevel: z.number().int().min(0).default(1).describe("Talent points earned per level above 1"),
    healOnLevelUp: z.boolean().default(true).describe("A level-up refills health and stamina"),
    affixesByRarity: z
      .partialRecord(RaritySchema, z.number().int().min(0).max(4))
      .default({ uncommon: 1, rare: 2, epic: 2, legendary: 3 })
      .describe("Random affixes a dropped sword or shield rolls, by its rarity"),
    ngPlus: z
      .object({
        unlockFlag: z.string().describe("Story flag that finishes the game and offers New Game+"),
        perCycle: z.partialRecord(z.enum(MODIFIERS), z.number().nonnegative()).default({}).describe("Added to each multiplier per NG+ cycle (0.5 → ×1.5, ×2…)"),
      })
      .optional()
      .describe("New Game+: keep level, talents, gear and mastery; enemies scale per cycle"),
    mastery: z
      .object({
        maxLevel: z.number().int().min(0).default(10).describe("Mastery cap per sword family"),
        xpBase: z.number().positive().default(30).describe("Kill XP to leave mastery level L = round(xpBase × (L+1)^xpExponent)"),
        xpExponent: z.number().min(0).default(1.4),
        families: z
          .partialRecord(
            SwordFamilySchema,
            z.object({ power: Gain.optional(), critChance: z.number().min(0).max(0.05).optional(), critMultiplier: Gain.optional(), maxPoise: Gain.optional(), speed: Gain.optional() })
          )
          .default({})
          .describe("Stats per mastery level while wielding that family"),
      })
      .optional()
      .describe("Weapon mastery: kills train the wielded sword family"),
  })
  .describe("Progression");

export type ProgressionContent = z.infer<typeof ProgressionSchema>;

type Assert<T extends true> = T;
type Fits<A, B> = A extends B ? true : false;
export type _Contracts = [Assert<Fits<ProgressionContent, ProgressionDef>>];
