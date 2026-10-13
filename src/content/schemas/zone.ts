import { z } from "zod";
import { Id, LocalizedText } from "./common";

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour #RRGGBB");

export const WEATHERS = ["fog", "fireflies", "embers", "rain", "ash", "motes", "snow"] as const;

/**
 * A zone is the mood of a set of maps: name banner, music, ambience bed, lighting and weather.
 * Maps reference their zone; several maps can share one.
 */
export const ZoneSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    subtitle: LocalizedText.optional().describe("Second line of the arrival banner"),
    music: z.string().optional().describe("Song id (defaults to the zone id)"),
    ambience: z.string().optional().describe("Ambience bed id (defaults to the zone id)"),
    safe: z.boolean().default(false).describe("Hub/sanctuary: no hostile spawns expected"),
    pvp: z.boolean().default(false).describe("Arena: players can fight each other (scoreboard, respawn at the farthest player spawn)"),
    respawn: z.number().positive().default(180).describe("Seconds before a slain enemy returns to its spawn (when no player is near)"),
    lighting: z
      .object({
        ambient: Hex.describe("Colour of the darkness"),
        darkness: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).describe("Darkness at the brightest and darkest hour [day, night]"),
        playerLight: z.number().nonnegative().default(70).describe("Radius of the player's own lantern (px)"),
      })
      .describe("Lighting"),
    weather: z.array(z.enum(WEATHERS)).default([]),
  })
  .refine((zn) => zn.lighting.darkness[0] <= zn.lighting.darkness[1], "day darkness must be ≤ night darkness")
  .describe("Zone");

export type ZoneContent = z.infer<typeof ZoneSchema>;
