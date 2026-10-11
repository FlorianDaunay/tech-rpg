import type { MapMarker, MinimapLayout } from "@/bridge/events";
import { MINIMAP_COLORS } from "@/config/palette";
import type { Actor } from "@/core/combat/actor";
import type { SimState } from "@/core/sim/state";
import type { GameMap } from "@/core/world/map";

/** Tile family of a resolved tile key (`tiles/grass#3` → `grass`). */
const family = (tile: string) => tile.slice(tile.indexOf("/") + 1).split("#")[0] ?? "";

/** The same colour, darker (blocked cells keep a hint of the terrain under them). */
function shade(color: string, f: number): string {
  const c = [1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Families that are solid on their own (a solid cell under them is terrain, not a building or tree). */
const SOLID_TERRAIN = new Set(["water", "water-shore", "cave-wall", "wall", "void"]);
/** Brightness of a cell blocked by an object, relative to its terrain. */
const BLOCKED_SHADE = 0.72;

/**
 * The map as one colour per cell: the top ground/deco tile's family colour, or the "blocked" colour
 * where an object (tree, house, rock) makes the cell solid. Built once per map entry.
 */
export function minimapLayout(map: GameMap, zone: string): MinimapLayout {
  const palette: string[] = [MINIMAP_COLORS.empty, MINIMAP_COLORS.blocked];
  const index = new Map<string, number>();
  const colorIndex = (color: string) => {
    let i = index.get(color);
    if (i === undefined) {
      i = palette.push(color) - 1;
      index.set(color, i);
    }
    return i;
  };
  const ground = map.layers.filter((l) => !l.above);
  const cells = new Uint8Array(map.width * map.height);
  for (let i = 0; i < cells.length; i++) {
    let top = "";
    for (const l of ground) if (l.tiles[i]) top = family(l.tiles[i]!);
    const terrain = top ? (MINIMAP_COLORS.tiles[top as keyof typeof MINIMAP_COLORS.tiles] ?? MINIMAP_COLORS.unknown) : null;
    if (map.solid[i] && !SOLID_TERRAIN.has(top)) cells[i] = terrain ? colorIndex(shade(terrain, BLOCKED_SHADE)) : 1;
    else if (terrain) cells[i] = colorIndex(terrain);
  }
  const ts = map.tileSize;
  return {
    map: map.id,
    zone,
    width: map.width,
    height: map.height,
    palette,
    cells,
    portals: map.portals.map((p) => ({ x: p.x / ts, y: p.y / ts, w: p.w / ts, h: p.h / ts, to: p.to })),
  };
}

const ALIVE = (a: Actor) => a.action.kind !== "dead";

/** Moving things and points of interest, in cell units. */
export function mapMarkers(sim: SimState, ts: number, localId: string): MapMarker[] {
  const out: MapMarker[] = [];
  for (const c of sim.chests) if (!c.opened) out.push({ kind: "chest", x: c.x / ts, y: c.y / ts });
  for (const a of Object.values(sim.actors)) {
    if (!ALIVE(a)) continue;
    const kind = a.id === localId ? "me" : a.kind === "player" || a.kind === "pet" ? "ally" : a.kind === "enemy" ? "enemy" : "npc";
    out.push({ kind, x: a.x / ts, y: a.y / ts });
  }
  // The local player last, drawn on top.
  return out.sort((a, b) => Number(a.kind === "me") - Number(b.kind === "me"));
}
