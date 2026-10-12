import { z } from "zod";
import { MODIFIERS } from "@/core/combat/modifiers";
import { Id, LocalizedText, ref } from "./common";
import { LegendEntry } from "./map";

const Pool = z.array(z.object({ enemy: ref("enemy"), weight: z.number().positive().default(1), fromFloor: z.number().int().min(1).default(1).describe("First floor it appears on") })).min(1);

/**
 * A Rift: a run of procedurally generated floors (core/world/riftgen) dressed with this theme.
 * Map portals can lead to a Rift id: the run starts on floor 1 of the daily seed.
 */
export const RiftSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    zone: ref("zone").describe("Music, ambience, lighting and weather of every floor"),
    floors: z.number().int().min(1).max(20).default(5),
    tiles: z.object({ floor: LegendEntry, wall: LegendEntry }).describe("Floor tile and (solid, autotiled) wall tile"),
    enemies: Pool.describe("Room enemies"),
    elites: Pool.describe("Guardian of each floor's exit"),
    seal: z
      .union([z.literal("all"), z.number().int().min(0)])
      .default(3)
      .describe("The exit stays sealed until these fall: \"all\" enemies of the floor, or the exit guardian + N wardens (marked on the map)"),
    chestLoot: ref("loot").describe("Chests found in rooms"),
    finalLoot: ref("loot").describe("Chest waiting by the last floor's exit"),
    perFloor: z.partialRecord(z.enum(MODIFIERS), z.number().nonnegative()).default({}).describe("Added to each multiplier per floor below the first (0.15 → ×1.15, ×1.3…)"),
    exitTo: ref("map").describe("Where the last floor's exit leads"),
    exitArrive: z.string().describe("Player spawn id in that map"),
    danger: z
      .object({
        item: ref("item").describe("Fuel for the gate brazier"),
        costs: z.array(z.number().int().min(1)).min(1).describe("Total fuel to reach tier 1, 2, 3…"),
        perTier: z.partialRecord(z.enum(MODIFIERS), z.number().nonnegative()).describe("Added to each multiplier per tier (enemies harder, spoils richer)"),
      })
      .optional()
      .describe("Optional danger players can light at the brazier by the gate (one run)"),
    gate: z.object({ prop: z.string().describe("Asset key of the spires flanking each exit"), light: z.string().default("rift") }).default({ prop: "props/rift-spire", light: "rift" }),
  })
  .describe("Rift");

export type RiftContent = z.infer<typeof RiftSchema>;
