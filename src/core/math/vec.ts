export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const len = (v: Vec2) => Math.hypot(v.x, v.y);

/** Clamps a vector to length ≤ max (keeps analog stick magnitude, caps diagonals). */
export function clampLength(v: Vec2, max: number): Vec2 {
  const l = len(v);
  return l > max && l > 0 ? { x: (v.x / l) * max, y: (v.y / l) * max } : { x: v.x, y: v.y };
}

export function normalize(v: Vec2): Vec2 {
  const l = len(v);
  return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}

/** 4-way facing used by Pipoya sheets, from a direction vector. */
export type Facing = "down" | "left" | "right" | "up";
export function facingOf(v: Vec2, fallback: Facing): Facing {
  if (Math.abs(v.x) < 1e-3 && Math.abs(v.y) < 1e-3) return fallback;
  return Math.abs(v.x) > Math.abs(v.y) ? (v.x < 0 ? "left" : "right") : v.y < 0 ? "up" : "down";
}
