import { hashSeed } from "@/core/math/rng";
import type { GameMap, MapLayer } from "@/core/world/map";
import type { MapContent } from "./schemas/map";

/**
 * "terrain-3x3+inner" autotile frames (5 columns per block):
 *   0 NW  1 N  2 NE | 3 inner-NW 4 inner-NE
 *   5 W   6 C  7 E  | 8 inner-SW 9 inner-SE
 *  10 SW 11 S 12 SE | 13, 14 centre variants
 */
export function autotileFrame(same: (dx: number, dy: number) => boolean, variant: number): number {
  const n = same(0, -1);
  const s = same(0, 1);
  const w = same(-1, 0);
  const e = same(1, 0);
  if (!n && !w) return 0;
  if (!n && !e) return 2;
  if (!s && !w) return 10;
  if (!s && !e) return 12;
  if (!n) return 1;
  if (!s) return 11;
  if (!w) return 5;
  if (!e) return 7;
  // All four sides are terrain: check diagonals for inner corners.
  if (!same(-1, -1)) return 3;
  if (!same(1, -1)) return 4;
  if (!same(-1, 1)) return 8;
  if (!same(1, 1)) return 9;
  return [6, 6, 6, 13, 14][variant % 5]!;
}

/** Stable per-cell variant so maps look the same on every load and every peer. */
const cellHash = (mapId: string, layer: string, x: number, y: number) => hashSeed(`${mapId}:${layer}:${x}:${y}`);

function resolveFrame(tile: string, hash: number): string {
  const m = /^(.*)#(\d+)-(\d+)$/.exec(tile);
  if (!m) return tile.includes("#") ? tile : `${tile}#0`;
  const from = Number(m[2]);
  const to = Number(m[3]);
  return `${m[1]}#${from + (hash % (to - from + 1))}`;
}

/** Converts authored map content (char grids + legend + objects) into the runtime GameMap. */
export function toGameMap(content: MapContent): GameMap {
  const { width, height, tileSize, legend } = content;
  const solid = new Uint8Array(width * height);

  const layers: MapLayer[] = content.layers.map((layer) => {
    const charAt = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? "" : (layer.rows[y]?.[x] ?? ""));
    const tiles: string[] = new Array<string>(width * height).fill("");
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ch = charAt(x, y);
        const entry = legend[ch];
        if (!entry) continue;
        const hash = cellHash(content.id, layer.id, x, y);
        tiles[y * width + x] = entry.autotile
          ? `${entry.tile.split("#")[0]}#${autotileFrame((dx, dy) => {
              const other = charAt(x + dx, y + dy);
              // Map edges continue the terrain, so it doesn't get a border there.
              return other === ch || other === "";
            }, hash)}`
          : resolveFrame(entry.tile, hash);
        if (entry.solid) solid[y * width + x] = 1;
      }
    }
    return { id: layer.id, tiles, above: layer.above };
  });

  const objects = content.objects.map((o) => {
    const [w, h] = o.footprint ?? [1, 1];
    const left = o.cx - Math.floor((w - 1) / 2);
    if (o.footprint)
      for (let y = o.cy - h + 1; y <= o.cy; y++)
        for (let x = left; x < left + w; x++) if (x >= 0 && y >= 0 && x < width && y < height) solid[y * width + x] = 1;
    return { asset: o.asset, frame: o.frame, flipX: o.flipX, x: (left + w / 2) * tileSize, y: (o.cy + 1) * tileSize };
  });

  const spawns = content.spawns.map((s) => ({
    id: s.id,
    kind: s.kind,
    ref: s.ref,
    x: (s.cx + 0.5) * tileSize,
    y: (s.cy + 0.5) * tileSize,
  }));
  return { id: content.id, zone: content.zone, width, height, tileSize, layers, objects, solid, spawns };
}
