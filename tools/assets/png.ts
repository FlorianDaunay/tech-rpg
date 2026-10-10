/**
 * Tiny RGBA canvas + PNG I/O on top of pngjs. Everything here is deterministic: no time, no
 * Math.random — generators get a seeded Rng from src/core/math/rng.ts.
 */
import { PNG } from "pngjs";

export type RGB = readonly [number, number, number];
export type Color = RGB | string;

export function rgb(c: Color): RGB {
  if (typeof c !== "string") return c;
  const h = c.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: Color, b: Color, t: number): RGB {
  const x = rgb(a);
  const y = rgb(b);
  return [0, 1, 2].map((i) => Math.round(x[i]! + (y[i]! - x[i]!) * t)) as unknown as RGB;
}

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/** Ordered-dither threshold in [0,1) for a pixel. */
export const bayer = (x: number, y: number) => (BAYER4[y & 3]![x & 3]! + 0.5) / 16;

/**
 * Pick a colour from a dark→light ramp for a light value t∈[0,1], with a little ordered dithering
 * at band boundaries (`dither` = width of the dithered zone, 0 = hard bands).
 */
export function rampPick(ramp: readonly Color[], t: number, x: number, y: number, dither = 0.35): RGB {
  const n = ramp.length;
  const f = clamp(t) * (n - 1);
  let i = Math.floor(f);
  const frac = f - i;
  if (dither > 0 && frac > 1 - dither / 2 && bayer(x, y) < (frac - (1 - dither / 2)) / dither) i++;
  else if (frac >= 0.5 && dither === 0) i++;
  return rgb(ramp[Math.min(n - 1, Math.max(0, i))]!);
}

export class Canvas {
  readonly data: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  static fromPng(buf: Buffer): Canvas {
    const p = PNG.sync.read(buf);
    const c = new Canvas(p.width, p.height);
    c.data.set(p.data);
    return c;
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  alpha(x: number, y: number) {
    return this.inside(x, y) ? this.data[(y * this.width + x) * 4 + 3]! : 0;
  }

  get(x: number, y: number): [number, number, number, number] {
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }

  /** Overwrite a pixel. */
  set(x: number, y: number, c: Color, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inside(x, y)) return;
    const [r, g, b] = rgb(c);
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = Math.round(clamp(a, 0, 255));
  }

  /** Source-over blend of a colour with alpha a∈[0,1]. */
  blend(x: number, y: number, c: Color, a: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inside(x, y) || a <= 0) return;
    a = clamp(a);
    const [r, g, b] = rgb(c);
    const i = (y * this.width + x) * 4;
    const da = this.data[i + 3]! / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    const ch = (s: number, d: number) => Math.round((s * a + d * da * (1 - a)) / oa);
    this.data[i] = ch(r, this.data[i]!);
    this.data[i + 1] = ch(g, this.data[i + 1]!);
    this.data[i + 2] = ch(b, this.data[i + 2]!);
    this.data[i + 3] = Math.round(oa * 255);
  }

  rect(x: number, y: number, w: number, h: number, c: Color, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }

  /** Filled ellipse via a per-pixel callback (lets callers shade). */
  forEllipse(cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number, nx: number, ny: number) => void) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) fn(x, y, nx, ny);
      }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, a = 255) {
    this.forEllipse(cx, cy, rx, ry, (x, y) => this.set(x, y, c, a));
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Color, a = 255) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** 1px outline around every opaque pixel (4-neighbour; `diagonal` adds corners). */
  outline(c: Color, opts: { diagonal?: boolean; threshold?: number } = {}) {
    const th = opts.threshold ?? 1;
    const solid = (x: number, y: number) => this.alpha(x, y) >= th;
    const pts: [number, number][] = [];
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        if (solid(x, y)) continue;
        const n = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
        const d = opts.diagonal && (solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1));
        if (n || d) pts.push([x, y]);
      }
    for (const [x, y] of pts) this.set(x, y, c);
  }

  /** Copy (alpha-blended) another canvas at dx,dy. */
  blit(src: Canvas, dx: number, dy: number, sx = 0, sy = 0, w = src.width, h = src.height) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b, a] = src.get(sx + x, sy + y);
        if (a > 0) this.blend(dx + x, dy + y, [r, g, b], a / 255);
      }
  }

  /** Raw copy (no blending), used for slicing. */
  crop(sx: number, sy: number, w: number, h: number): Canvas {
    const c = new Canvas(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!this.inside(sx + x, sy + y)) continue;
        const i = ((sy + y) * this.width + sx + x) * 4;
        c.data.set(this.data.subarray(i, i + 4), (y * w + x) * 4);
      }
    return c;
  }

  /** Horizontal strip from equally sized frames. */
  static strip(frames: readonly Canvas[]): Canvas {
    const f0 = frames[0]!;
    const c = new Canvas(f0.width * frames.length, f0.height);
    frames.forEach((f, i) => c.blit(f, i * f0.width, 0));
    return c;
  }

  toPng(): Buffer {
    const p = new PNG({ width: this.width, height: this.height });
    p.data = Buffer.from(this.data);
    return PNG.sync.write(p, { colorType: 6, deflateLevel: 9 });
  }
}
