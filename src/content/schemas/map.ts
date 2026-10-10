import { z } from "zod";
import { LIGHT_COLORS } from "@/config/palette";
import { Id, LocalizedText, ref } from "./common";

/**
 * Maps are authored as character grids (one char per tile) plus a legend. Readable in a diff,
 * easy to paint in the admin, compact. Every layer has `height` rows of `width` chars.
 */
export const LegendEntry = z.object({
  /**
   * `<asset-key>#<frame>`; a frame range `#0-15` picks a stable pseudo-random variant per cell.
   * For autotiles, the asset key of a "terrain-3x3+inner" tileset.
   */
  tile: z.string().describe("Tile: asset-key#frame or asset-key#from-to"),
  solid: z.boolean().default(false).describe("Blocks movement"),
  /** Terrain autotile: edges/corners chosen from neighbours with the same char. */
  autotile: z.boolean().default(false).describe("Auto edges (terrain-3x3+inner tileset)"),
});

export const MapLayerSchema = z.object({
  id: z.string(),
  rows: z.array(z.string()).describe("One string per row, one legend char per cell; '.' or ' ' = empty"),
  above: z.boolean().default(false).describe("Drawn above characters (canopies, roofs)"),
});

export const MapSpawnSchema = z.object({
  id: z.string(),
  kind: z.enum(["player", "enemy", "npc", "portal"]),
  /** Tile coordinates (cell), converted to the cell centre in world pixels. */
  cx: z.number().int().nonnegative(),
  cy: z.number().int().nonnegative(),
  ref: z.string().optional().describe("Content id (enemy, npc, target map…)"),
});

/** A placed sprite (tree, house, rock…), y-sorted with characters. */
export const MapObjectSchema = z.object({
  asset: z.string().describe("Asset key (props/…)"),
  frame: z.number().int().nonnegative().default(0),
  /** Bottom-centre cell of the object's footprint. */
  cx: z.number().int().nonnegative(),
  cy: z.number().int().nonnegative(),
  /** Solid cells [w, h], bottom-centred on (cx, cy). Omit for walk-through decoration. */
  footprint: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  flipX: z.boolean().default(false),
  /** The object glows (torch, lantern, window): lights the darkness around it. */
  light: z
    .object({
      radius: z.number().positive().describe("px"),
      color: z.enum(Object.keys(LIGHT_COLORS) as [keyof typeof LIGHT_COLORS, ...(keyof typeof LIGHT_COLORS)[]]),
      intensity: z.number().min(0).max(1).default(1),
      flicker: z.boolean().default(false),
      offsetY: z.number().default(0).describe("px from the object's base (negative = up)"),
    })
    .optional(),
});

/** A rectangle of cells that sends players to another map (edge exits, doors, rifts). */
export const MapPortalSchema = z.object({
  id: z.string(),
  cx: z.number().int().nonnegative(),
  cy: z.number().int().nonnegative(),
  w: z.number().int().positive().default(1),
  h: z.number().int().positive().default(1),
  to: ref("map"),
  arrive: z.string().describe("Player spawn id in the target map"),
});

export const MapSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    zone: ref("zone").describe("Zone: music, ambience, lighting, weather"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tileSize: z.number().int().positive().default(32),
    legend: z.record(z.string().length(1), LegendEntry),
    layers: z.array(MapLayerSchema).min(1),
    objects: z.array(MapObjectSchema).default([]),
    spawns: z.array(MapSpawnSchema).default([]),
    portals: z.array(MapPortalSchema).default([]),
  })
  .superRefine((map, ctx) => {
    for (const layer of map.layers) {
      if (layer.rows.length !== map.height)
        ctx.addIssue({ code: "custom", message: `layer ${layer.id}: ${layer.rows.length} rows, expected ${map.height}` });
      layer.rows.forEach((row, y) => {
        if (row.length !== map.width)
          ctx.addIssue({ code: "custom", message: `layer ${layer.id} row ${y}: ${row.length} chars, expected ${map.width}` });
        for (const ch of row)
          if (ch !== "." && ch !== " " && !map.legend[ch])
            ctx.addIssue({ code: "custom", message: `layer ${layer.id} row ${y}: char "${ch}" not in legend` });
      });
    }
    const inside = (cx: number, cy: number) => cx < map.width && cy < map.height;
    map.objects.forEach((o, i) => inside(o.cx, o.cy) || ctx.addIssue({ code: "custom", message: `object ${i} (${o.asset}) outside the map` }));
    map.spawns.forEach((s) => inside(s.cx, s.cy) || ctx.addIssue({ code: "custom", message: `spawn ${s.id} outside the map` }));
    map.portals.forEach((p) => inside(p.cx + p.w - 1, p.cy + p.h - 1) || ctx.addIssue({ code: "custom", message: `portal ${p.id} outside the map` }));
  })
  .describe("Map");

export type MapContent = z.infer<typeof MapSchema>;
