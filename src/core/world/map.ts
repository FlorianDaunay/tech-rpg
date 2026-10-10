/**
 * Runtime map model (pure). Content maps (JSON) are normalized into this.
 * Coordinates: world pixels; tiles are `tileSize` squares; (0,0) top-left.
 */
export interface MapLayer {
  id: string;
  /** Resolved tile per cell, row-major: `asset-key#frame`, "" = empty. */
  tiles: string[];
  /** Draw above actors (tree canopies, roofs). */
  above?: boolean;
}

export interface MapSpawn {
  id: string;
  kind: "player" | "enemy" | "npc" | "portal";
  x: number;
  y: number;
  ref?: string;
}

/** A placed sprite; `x, y` = bottom-centre of its footprint in world pixels (its sort point). */
export interface MapObject {
  asset: string;
  frame: number;
  x: number;
  y: number;
  flipX: boolean;
}

export interface GameMap {
  id: string;
  zone: string;
  width: number;
  height: number;
  tileSize: number;
  layers: MapLayer[];
  objects: MapObject[];
  /** 1 = solid, per cell. */
  solid: Uint8Array;
  spawns: MapSpawn[];
}

export const cellIndex = (map: GameMap, cx: number, cy: number) => cy * map.width + cx;

/** Outside the map counts as solid, so nothing walks off the edge. */
export function isSolidCell(map: GameMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return true;
  return map.solid[cellIndex(map, cx, cy)] === 1;
}
