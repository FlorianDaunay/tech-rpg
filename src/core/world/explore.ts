/**
 * Fog of war: which parts of each map a player has seen. One bit per FOG_CELL×FOG_CELL tiles,
 * row-major, packed 6 bits per character (URL-safe base64 alphabet) so a whole map fits in a short
 * string inside the save. Pure and deterministic: the sim reveals around players on a fixed cadence.
 */

/** Tiles per fog cell (side). */
export const FOG_CELL = 2;
/** Reveal radius around a player (tiles): a bit wider than the lantern, so the map runs ahead of you. */
export const REVEAL_RADIUS = 7;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const VALUE = new Map([...ALPHABET].map((c, i) => [c, i]));

export interface FogGrid {
  /** Fog cells across / down. */
  w: number;
  h: number;
}

export const fogGrid = (mapWidth: number, mapHeight: number): FogGrid => ({ w: Math.ceil(mapWidth / FOG_CELL), h: Math.ceil(mapHeight / FOG_CELL) });

/** Bits of an encoded fog string (missing / short / garbage → unexplored). */
export function decodeFog(s: string | undefined, g: FogGrid): Uint8Array {
  const bits = new Uint8Array(g.w * g.h);
  if (!s) return bits;
  for (let i = 0; i < bits.length; i++) {
    const v = VALUE.get(s[Math.floor(i / 6)] ?? "A") ?? 0;
    bits[i] = (v >> (i % 6)) & 1;
  }
  return bits;
}

export function encodeFog(bits: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0;
    for (let k = 0; k < 6 && i + k < bits.length; k++) v |= (bits[i + k]! & 1) << k;
    out += ALPHABET[v];
  }
  return out;
}

/** Is tile (tx, ty) explored in this bit set? */
export const tileRevealed = (bits: Uint8Array, g: FogGrid, tx: number, ty: number): boolean => bits[Math.floor(ty / FOG_CELL) * g.w + Math.floor(tx / FOG_CELL)] === 1;

/**
 * Reveals a disc around a tile position in `explored[mapId]`. Returns true when anything new was
 * revealed (callers can skip work otherwise).
 */
export function revealAround(explored: Record<string, string>, map: { id: string; width: number; height: number }, tx: number, ty: number, radius = REVEAL_RADIUS): boolean {
  const g = fogGrid(map.width, map.height);
  const bits = decodeFog(explored[map.id], g);
  const r = radius / FOG_CELL;
  const fx = tx / FOG_CELL;
  const fy = ty / FOG_CELL;
  let changed = false;
  for (let y = Math.max(0, Math.floor(fy - r)); y <= Math.min(g.h - 1, Math.ceil(fy + r)); y++)
    for (let x = Math.max(0, Math.floor(fx - r)); x <= Math.min(g.w - 1, Math.ceil(fx + r)); x++) {
      const i = y * g.w + x;
      if (bits[i] || Math.hypot(x + 0.5 - fx, y + 0.5 - fy) > r) continue;
      bits[i] = 1;
      changed = true;
    }
  if (changed) explored[map.id] = encodeFog(bits);
  return changed;
}

/** Share of a map explored (0…1), for the world map / codex. */
export function exploredShare(s: string | undefined, mapWidth: number, mapHeight: number): number {
  const g = fogGrid(mapWidth, mapHeight);
  const bits = decodeFog(s, g);
  let n = 0;
  for (const b of bits) n += b;
  return bits.length ? n / bits.length : 0;
}
