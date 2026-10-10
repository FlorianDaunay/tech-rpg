import { clampLength, type Vec2 } from "../math/vec";
import { isSolidCell, type GameMap } from "../world/map";

/** A moving body: circle-ish feet hitbox approximated by a square of half-size `radius`. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface MoveTuning {
  /** px/s at full stick. */
  maxSpeed: number;
  /** px/s² towards the desired velocity. */
  accel: number;
  /** px/s² when no input (higher = snappier stop). */
  decel: number;
}

/** Steers velocity towards `wish * maxSpeed` (wish length ≤ 1). */
export function steer(body: Body, wish: Vec2, tuning: MoveTuning, dt: number): void {
  const w = clampLength(wish, 1);
  const tx = w.x * tuning.maxSpeed;
  const ty = w.y * tuning.maxSpeed;
  const rate = (w.x !== 0 || w.y !== 0 ? tuning.accel : tuning.decel) * dt;
  const dx = tx - body.vx;
  const dy = ty - body.vy;
  const d = Math.hypot(dx, dy);
  if (d <= rate) {
    body.vx = tx;
    body.vy = ty;
  } else {
    body.vx += (dx / d) * rate;
    body.vy += (dy / d) * rate;
  }
}

/**
 * Moves the body by its velocity, resolving collisions against solid tiles axis by axis
 * (lets bodies slide along walls). Steps are sub-divided so fast dashes can't tunnel.
 */
export function moveAndCollide(body: Body, map: GameMap, dt: number): { hitX: boolean; hitY: boolean } {
  const maxStep = map.tileSize / 4;
  const dist = Math.max(Math.abs(body.vx * dt), Math.abs(body.vy * dt));
  const steps = Math.max(1, Math.ceil(dist / maxStep));
  let hitX = false;
  let hitY = false;
  for (let i = 0; i < steps; i++) {
    if (!hitX && sweepAxis(body, map, (body.vx * dt) / steps, 0)) hitX = true;
    if (!hitY && sweepAxis(body, map, 0, (body.vy * dt) / steps)) hitY = true;
  }
  if (hitX) body.vx = 0;
  if (hitY) body.vy = 0;
  return { hitX, hitY };
}

function sweepAxis(body: Body, map: GameMap, dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return false;
  const nx = body.x + dx;
  const ny = body.y + dy;
  const r = body.radius;
  const ts = map.tileSize;
  const x0 = Math.floor((nx - r) / ts);
  const x1 = Math.floor((nx + r - 0.001) / ts);
  const y0 = Math.floor((ny - r) / ts);
  const y1 = Math.floor((ny + r - 0.001) / ts);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!isSolidCell(map, cx, cy)) continue;
      // Snap flush against the tile edge on the moving axis.
      if (dx > 0) body.x = cx * ts - r;
      else if (dx < 0) body.x = (cx + 1) * ts + r;
      if (dy > 0) body.y = cy * ts - r;
      else if (dy < 0) body.y = (cy + 1) * ts + r;
      return true;
    }
  }
  body.x = nx;
  body.y = ny;
  return false;
}
