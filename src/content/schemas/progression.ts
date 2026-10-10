import { z } from "zod";
import type { ProgressionDef } from "@/core/progression/level";
import { Id } from "./common";

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
  })
  .describe("Progression");

export type ProgressionContent = z.infer<typeof ProgressionSchema>;

type Assert<T extends true> = T;
type Fits<A, B> = A extends B ? true : false;
export type _Contracts = [Assert<Fits<ProgressionContent, ProgressionDef>>];
