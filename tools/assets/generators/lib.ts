/** Shared helpers for procedural pixel-art generators (noise, lighting, small shapes). */
import type { Rng } from "../../../src/core/math/rng";
import { Canvas, clamp, rampPick, type Color } from "../png";
import type { GeneratedAsset, AssetKind, AssetMeta } from "../types";

/** Deterministic integer hash → [0,1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (v: number, p: number) => ((v % p) + p) % p;

/**
 * Value noise in [0,1). `cell` = feature size in px. If `period` (px, multiple of cell) is given
 * the noise tiles seamlessly with that period.
 */
export function noise(x: number, y: number, cell: number, seed = 0, period = 0): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smooth(gx - x0);
  const fy = smooth(gy - y0);
  const p = period ? period / cell : 0;
  const h = (i: number, j: number) => hash2(p ? wrap(i, p) : i, p ? wrap(j, p) : j, seed);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * fx;
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

export function fbm(x: number, y: number, cell: number, seed = 0, period = 0, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x, y, cell, seed + o * 101, period) * amp;
    norm += amp;
    amp *= 0.5;
    cell = Math.max(1, cell / 2);
  }
  return sum / norm;
}

/** Top-left light. Returns the diffuse term for a surface normal on a unit sphere/ellipse. */
const L = (() => {
  const v = [-0.5, -0.7, 0.55];
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  return v.map((c) => c / n) as [number, number, number];
})();
export function sphereLight(nx: number, ny: number): number {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return clamp(nx * L[0] + ny * L[1] + nz * L[2]);
}

/** Shaded blob (sphere-lit ellipse) painted into c with a ramp. */
export function blob(
  c: Canvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ramp: readonly Color[],
  opts: { bias?: number; contrast?: number; dither?: number; tex?: (x: number, y: number) => number } = {},
) {
  const { bias = 0, contrast = 1, dither = 0.4, tex } = opts;
  c.forEllipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    let t = (sphereLight(nx, ny) - 0.35) * contrast + 0.45 + bias;
    if (tex) t += tex(x, y);
    c.set(x, y, rampPick(ramp, t, x, y, dither));
  });
}

/** Soft drop shadow ellipse (semi-transparent, banded — pixel-art friendly). */
export function groundShadow(c: Canvas, cx: number, cy: number, rx: number, ry: number, color: Color, alpha = 0.32) {
  c.forEllipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const d = nx * nx + ny * ny;
    c.blend(x, y, color, d < 0.55 ? alpha : alpha * 0.6);
  });
}

/** Recolour every opaque pixel that touches transparency (inner outline), keeping silhouette size. */
export function innerOutline(c: Canvas, color: Color) {
  const pts: [number, number][] = [];
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      if (c.alpha(x, y) < 128) continue;
      if (c.alpha(x - 1, y) < 128 || c.alpha(x + 1, y) < 128 || c.alpha(x, y - 1) < 128 || c.alpha(x, y + 1) < 128)
        pts.push([x, y]);
    }
  for (const [x, y] of pts) c.set(x, y, color);
}

export function asset(
  path: string,
  kind: AssetKind,
  canvas: Canvas,
  frame?: { w: number; h: number; frames: number },
  meta?: AssetMeta,
): GeneratedAsset {
  const a: GeneratedAsset = { path, kind, png: canvas.toPng() };
  const f = frame ?? { w: canvas.width, h: canvas.height, frames: 1 };
  a.frameWidth = f.w;
  a.frameHeight = f.h;
  a.frames = f.frames;
  if (meta) a.meta = meta;
  return a;
}

/** Shuffle-free pick of n distinct ints in [0, max) using the rng. */
export function scatter(rng: Rng, n: number, w: number, h: number, margin = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([rng.int(margin, w - 1 - margin), rng.int(margin, h - 1 - margin)]);
  return out;
}

export { Canvas, clamp, rampPick };
