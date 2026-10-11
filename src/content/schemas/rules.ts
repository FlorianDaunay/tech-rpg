import { z } from "zod";
import { MODIFIERS } from "@/core/combat/modifiers";
import type { DifficultyDef, OmenDef } from "@/core/sim/rules";
import { Id, LocalizedText } from "./common";

/** Multipliers, 1 = unchanged. Shared by difficulties, Omens and the NG+ step. */
export const ModifiersSchema = z
  .partialRecord(z.enum(MODIFIERS), z.number().positive())
  .default({})
  .describe("Multipliers (1 = unchanged): enemy hp / damage / speed / attack rate, xp, gold, loot chance, healing taken from items");

export const DifficultySchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    order: z.number().int().describe("Position in the picker, easiest first"),
    mods: ModifiersSchema,
  })
  .describe("Difficulty");

export const OmenSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    glyph: z.string().max(2).default("✦").describe("Symbol shown in the Omen picker"),
    mods: ModifiersSchema,
  })
  .describe("Omen");

export type DifficultyContent = z.infer<typeof DifficultySchema>;
export type OmenContent = z.infer<typeof OmenSchema>;

type Assert<T extends true> = T;
type Fits<A, B> = A extends B ? true : false;
export type _Contracts = [Assert<Fits<DifficultyContent, DifficultyDef>>, Assert<Fits<OmenContent, OmenDef>>];
