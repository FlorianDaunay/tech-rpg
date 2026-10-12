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
  /** Enemies: seconds before returning after death, or never (absent = the zone's default). */
  respawn?: number | "never";
}

/** A placed sprite; `x, y` = bottom-centre of its footprint in world pixels (its sort point). */
export interface MapObject {
  asset: string;
  frame: number;
  x: number;
  y: number;
  flipX: boolean;
  /** Openable once; `key` = `map:chest` (recorded in progress.cleared). */
  chest?: { key: string; loot: string };
  /** Interact to rest (full heal) or open a service (e.g. the Rift danger brazier). */
  interact?: MapInteract;
  /** Only drawn once the local player has this story flag (village projects). Never solid. */
  ifFlag?: string;
}

export type MapInteract = { kind: "rest" } | { kind: "service"; service: "rift-danger"; ref: string };

/** Trigger rectangle in world pixels that sends players to another map. */
export interface MapPortal {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  to: string;
  arrive: string;
  /** Enemy spawn ids that must fall before it opens. */
  requires: string[];
}

/** A light source in world pixels (rendering only, but data lives with the map). */
export interface MapLight {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  flicker: boolean;
  /** Only lit once the local player has this story flag (its object is a village project). */
  ifFlag?: string;
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
  portals: MapPortal[];
  lights: MapLight[];
}

export const cellIndex = (map: GameMap, cx: number, cy: number) => cy * map.width + cx;

/** Outside the map counts as solid, so nothing walks off the edge. */
export function isSolidCell(map: GameMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return true;
  return map.solid[cellIndex(map, cx, cy)] === 1;
}
