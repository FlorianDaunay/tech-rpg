import { createRng, hashSeed, type Rng } from "../math/rng";

/**
 * Rift floor generator: rooms joined by corridors on a cell grid. Pure and deterministic: the same
 * (seed, floor) always gives the same floor, on every peer. Content turns the layout into a map
 * (tiles, enemies, loot) with a Rift theme; this only decides the shape and where things go.
 */

export interface RiftRoom {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RiftLayout {
  width: number;
  height: number;
  /** One string per row: "." floor, "#" wall. */
  rows: string[];
  rooms: RiftRoom[];
  /** Cells (centre of the start / exit rooms). */
  start: { x: number; y: number };
  exit: { x: number; y: number };
  /** Enemy spots (cells), in rooms other than the start one; `elite` marks the exit room's guardian. */
  enemies: { x: number; y: number; elite: boolean }[];
  chests: { x: number; y: number }[];
}

export interface RiftShape {
  width: number;
  height: number;
  rooms: [number, number];
  roomSize: [number, number];
  /** Enemies per 16 floor cells of a room (before the floor bonus). */
  density: number;
  /** Extra density per floor below the first. */
  densityPerFloor: number;
  /** Chance that a room (not start/exit) holds a chest. */
  chestChance: number;
}

export const DEFAULT_SHAPE: RiftShape = { width: 52, height: 40, rooms: [7, 10], roomSize: [6, 11], density: 0.55, densityPerFloor: 0.12, chestChance: 0.25 };

/** Generated Rift floor map ids: `rift-<rift>-s<seed>-f<floor>` (kebab-case like every map id). */
export const RIFT_PREFIX = "rift-";
const SUFFIX = /-s(\d+)-f(\d+)$/;

export const riftMapId = (rift: string, seed: number, floor: number) => `${RIFT_PREFIX}${rift}-s${seed >>> 0}-f${floor}`;

export function parseRiftMapId(id: string): { rift: string; seed: number; floor: number } | null {
  const m = id.startsWith(RIFT_PREFIX) ? SUFFIX.exec(id) : null;
  if (!m) return null;
  const rift = id.slice(RIFT_PREFIX.length, m.index);
  const floor = Number(m[2]);
  return rift && floor >= 1 ? { rift, seed: Number(m[1]), floor } : null;
}

/** Seed of one floor of a run. */
export const floorSeed = (seed: number, floor: number) => hashSeed(`${seed}:${floor}`);

/** Daily seed: same for every player on the same UTC day. */
export const dailySeed = (now: number) => hashSeed(`daily-${new Date(now).toISOString().slice(0, 10)}`);

const center = (r: RiftRoom) => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
const overlaps = (a: RiftRoom, b: RiftRoom, gap: number) => a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h;

function carveRoom(grid: boolean[][], r: RiftRoom): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y]![x] = true;
}

/** L-shaped corridor, 2 cells wide, between two points. */
function carveCorridor(grid: boolean[][], a: { x: number; y: number }, b: { x: number; y: number }, rng: Rng): void {
  const dig = (x: number, y: number) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (grid[y + dy]?.[x + dx] !== undefined) grid[y + dy]![x + dx] = true;
  };
  const horizontalFirst = rng.chance(0.5);
  const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  for (const [from, to] of [[a, corner], [corner, b]] as const) {
    const sx = Math.sign(to.x - from.x);
    const sy = Math.sign(to.y - from.y);
    let x = from.x;
    let y = from.y;
    dig(x, y);
    while (x !== to.x || y !== to.y) {
      if (x !== to.x) x += sx;
      else y += sy;
      dig(x, y);
    }
  }
}

/** Walking distance (cells) from a start cell to every floor cell; -1 = unreachable. */
export function floorDistances(rows: readonly string[], from: { x: number; y: number }): number[][] {
  const h = rows.length;
  const w = rows[0]!.length;
  const dist = rows.map((r) => Array.from(r, () => -1));
  const queue: [number, number][] = [[from.x, from.y]];
  dist[from.y]![from.x] = 0;
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || rows[ny]![nx] !== "." || dist[ny]![nx]! >= 0) continue;
      dist[ny]![nx] = dist[y]![x]! + 1;
      queue.push([nx, ny]);
    }
  }
  return dist;
}

/** Generates one floor. Floors deeper in the run hold more enemies. */
export function generateRift(seed: number, floor: number, shape: RiftShape = DEFAULT_SHAPE): RiftLayout {
  const rng = createRng(floorSeed(seed, floor));
  const { width, height } = shape;
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => false));

  // Rooms: random rectangles that keep a 2-cell gap, inside a 2-cell border.
  const want = rng.int(shape.rooms[0], shape.rooms[1]);
  const rooms: RiftRoom[] = [];
  for (let tries = 0; rooms.length < want && tries < 400; tries++) {
    const w = rng.int(shape.roomSize[0], shape.roomSize[1]);
    const h = rng.int(shape.roomSize[0], shape.roomSize[1] - 2);
    const room = { x: rng.int(2, width - w - 3), y: rng.int(2, height - h - 3), w, h };
    if (rooms.some((r) => overlaps(r, room, 2))) continue;
    rooms.push(room);
  }

  // Corridors: a spanning tree over room centres (nearest unconnected room each time) + one loop.
  for (const r of rooms) carveRoom(grid, r);
  const linked = [0];
  while (linked.length < rooms.length) {
    let best: [number, number, number] | null = null;
    for (const i of linked)
      for (let j = 0; j < rooms.length; j++) {
        if (linked.includes(j)) continue;
        const a = center(rooms[i]!);
        const b = center(rooms[j]!);
        const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (!best || d < best[2]) best = [i, j, d];
      }
    carveCorridor(grid, center(rooms[best![0]]!), center(rooms[best![1]]!), rng);
    linked.push(best![1]);
  }
  if (rooms.length > 3) carveCorridor(grid, center(rooms[rng.int(0, rooms.length - 1)]!), center(rooms[rng.int(0, rooms.length - 1)]!), rng);

  const rows = grid.map((r) => r.map((f) => (f ? "." : "#")).join(""));

  // Start: the first room. Exit: the room whose centre is the farthest walk away.
  const start = center(rooms[0]!);
  const dist = floorDistances(rows, start);
  let exitRoom = 1;
  rooms.forEach((r, i) => {
    const c = center(r);
    if (i > 0 && dist[c.y]![c.x]! > dist[center(rooms[exitRoom]!).y]![center(rooms[exitRoom]!).x]!) exitRoom = i;
  });
  const exit = center(rooms[exitRoom]!);

  // Enemies and chests, inside room interiors (one cell off the walls).
  const enemies: RiftLayout["enemies"] = [];
  const chests: RiftLayout["chests"] = [];
  const density = shape.density + shape.densityPerFloor * (floor - 1);
  rooms.forEach((r, i) => {
    if (i === 0) return;
    const spot = () => ({ x: rng.int(r.x + 1, r.x + r.w - 2), y: rng.int(r.y + 1, r.y + r.h - 2) });
    const taken = new Set<string>();
    const free = () => {
      for (let t = 0; t < 20; t++) {
        const s = spot();
        const k = `${s.x},${s.y}`;
        if (!taken.has(k) && !(s.x === exit.x && s.y === exit.y)) {
          taken.add(k);
          return s;
        }
      }
      return null;
    };
    const count = Math.max(1, Math.round(((r.w * r.h) / 16) * density));
    for (let n = 0; n < count; n++) {
      const s = free();
      if (s) enemies.push({ ...s, elite: false });
    }
    if (i === exitRoom) {
      const s = free();
      if (s) enemies.push({ ...s, elite: true });
    } else if (rng.chance(shape.chestChance)) {
      const s = free();
      if (s) chests.push(s);
    }
  });

  return { width, height, rows, rooms, start, exit, enemies, chests };
}
