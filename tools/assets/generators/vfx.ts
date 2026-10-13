/**
 * VFX strips, white/greyscale so they are tinted at runtime by element colour (palette.ts):
 * slash arcs, impact spark, dust puff, elemental bursts, telegraphs, lights, shadow.
 * Directional effects point to +x (right); rotate at runtime. meta.origin = pivot in px.
 */
import type { Rng } from "../../../src/core/math/rng";
import type { GeneratedAsset, PaletteModule } from "../types";
import { asset, Canvas, clamp, hash2 } from "./lib";

const WHITE = "#ffffff";

/** Put a greyscale value v∈[0,1] with alpha a∈[0,1], quantised to a few pixel-art levels. */
function grey(c: Canvas, x: number, y: number, v: number, a: number) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (a <= 0.02 || !c.inside(x, y)) return;
  const lv = v > 0.8 ? 255 : v > 0.55 ? 214 : v > 0.3 ? 168 : 128;
  const la = a > 0.8 ? 1 : a > 0.55 ? 0.78 : a > 0.3 ? 0.55 : 0.32;
  const prev = c.alpha(x, y) / 255;
  if (prev >= la && c.get(x, y)[0] >= lv) return;
  c.set(x, y, [lv, lv, lv], Math.max(prev, la) * 255);
}

// ---- slash arcs ---------------------------------------------------------------------------

function slashFrames(size: number): Canvas[] {
  const R = size * 0.36;
  const maxW = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  const a0 = (-110 * Math.PI) / 180;
  const a1 = (110 * Math.PI) / 180;
  const heads = [0.4, 0.78, 1, 1];
  const tails = [0, 0.06, 0.32, 0.66];
  const fade = [1, 1, 0.9, 0.6];
  return heads.map((head, f) => {
    const c = new Canvas(size, size);
    const tail = tails[f]!;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const p = (ang - a0) / (a1 - a0); // 0 … 1 along the swing (top → bottom)
        if (p < tail || p > head) continue;
        const s = (p - tail) / Math.max(0.001, head - tail); // 0 tail … 1 head
        const w = maxW * Math.pow(Math.sin(Math.min(1, s * 1.05) * Math.PI * 0.5 + 0.0001), 0.8) * (s > 0.92 ? (1 - s) / 0.08 : 1);
        const inner = R - w * 0.35;
        const outer = R + w * 0.65;
        if (r < inner || r > outer) continue;
        const q = (r - inner) / Math.max(0.5, outer - inner); // 0 inner … 1 outer
        const edge = q > 0.55 && q < 0.92;
        const v = edge ? 1 : q >= 0.92 ? 0.7 : 0.45 + q * 0.4;
        grey(c, x, y, v, fade[f]! * (0.45 + s * 0.55) * (q < 0.2 ? 0.6 : 1));
      }
    return c;
  });
}

// ---- impact & dust ------------------------------------------------------------------------

function sparkFrames(): Canvas[] {
  const S = 32;
  const rays = 8;
  const spec = [
    { core: 4, r0: 0, r1: 7 },
    { core: 3, r0: 2, r1: 12 },
    { core: 1.5, r0: 7, r1: 14 },
    { core: 0, r0: 12, r1: 15 },
  ];
  return spec.map((sp, f) => {
    const c = new Canvas(S, S);
    const cx = 16;
    const cy = 16;
    if (sp.core > 0)
      c.forEllipse(cx, cy, sp.core, sp.core, (x, y, nx, ny) => grey(c, x, y, nx * nx + ny * ny < 0.4 ? 1 : 0.7, 1));
    for (let k = 0; k < rays; k++) {
      const ang = (k / rays) * Math.PI * 2 + (k % 2 ? 0.2 : 0);
      const long = k % 2 === 0;
      const r1 = long ? sp.r1 : sp.r1 * 0.65;
      const r0 = long ? sp.r0 : sp.r0 * 0.65;
      for (let r = r0; r <= r1; r += 0.5) {
        const x = Math.floor(cx + Math.cos(ang) * r);
        const y = Math.floor(cy + Math.sin(ang) * r);
        const tip = (r - r0) / Math.max(1, r1 - r0);
        grey(c, x, y, tip > 0.7 ? 0.6 : 1, f === 3 ? 0.6 : 1);
        if (f < 2 && tip < 0.4 && long) grey(c, x + 1, y, 0.6, 0.8);
      }
    }
    return c;
  });
}

function dustFrames(): Canvas[] {
  const S = 32;
  const puffs = [
    { x: 12, y: 20, r: 4, vx: -0.9, vy: -0.4 },
    { x: 20, y: 21, r: 4.5, vx: 0.9, vy: -0.3 },
    { x: 16, y: 17, r: 5, vx: 0, vy: -0.9 },
    { x: 9, y: 23, r: 2.5, vx: -1.3, vy: 0 },
    { x: 23, y: 23, r: 2.5, vx: 1.3, vy: 0 },
  ];
  return [0, 1, 2, 3, 4].map((f) => {
    const c = new Canvas(S, S);
    const grow = [0.7, 1, 1.2, 1.25, 1.1][f]!;
    const alpha = [0.9, 0.85, 0.7, 0.5, 0.3][f]!;
    for (const p of puffs) {
      const px = p.x + p.vx * f * 1.6;
      const py = p.y + p.vy * f * 1.6;
      const r = p.r * grow;
      c.forEllipse(px, py, r, r * 0.9, (x, y, nx, ny) => {
        const lit = -nx * 0.5 - ny * 0.7;
        const v = lit > 0.25 ? 0.95 : lit > -0.2 ? 0.7 : 0.4;
        grey(c, x, y, v, alpha * (f >= 3 && (x + y) % 2 ? 0.6 : 1));
      });
    }
    return c;
  });
}

// ---- elemental bursts (48×48, 6 frames) ----------------------------------------------------

const B = 48;

function emberBurst(rng: Rng): Canvas[] {
  const tongues = Array.from({ length: 9 }, (_, k) => ({
    ang: (k / 9) * Math.PI * 2 + rng.range(-0.2, 0.2),
    h: rng.range(10, 16),
    w: rng.range(2.5, 3.8),
    lean: rng.range(-0.25, 0.25),
  }));
  const sparks = Array.from({ length: 12 }, () => ({ x: rng.range(-14, 14), y: rng.range(-4, 10), up: rng.range(2, 4), drift: rng.range(-1, 1) }));
  /** Flame teardrop: base at (bx,by), pointing up, height h, half-width w. */
  const flame = (c: Canvas, bx: number, by: number, h: number, w: number, lean: number, a: number) => {
    for (let y = Math.floor(by - h); y <= Math.ceil(by + w * 0.6); y++)
      for (let x = Math.floor(bx - w - h * 0.3); x <= Math.ceil(bx + w + h * 0.3); x++) {
        const u = (by - (y + 0.5)) / h; // 0 base … 1 tip
        if (u < -0.25 || u > 1) continue;
        const cx = bx + lean * u * h;
        const width = u < 0 ? w * Math.sqrt(1 - (u / 0.25) ** 2) : u < 0.3 ? w : (w * (1 - u)) / 0.7;
        const d = Math.abs(x + 0.5 - cx);
        if (d > width) continue;
        const core = d < width * 0.5 && u < 0.55;
        grey(c, x, y, core ? 1 : d > width - 1 ? 0.5 : 0.75, a);
      }
  };
  return [0, 1, 2, 3, 4, 5].map((f) => {
    const c = new Canvas(B, B);
    const t = f / 5;
    const fade = f < 3 ? 1 : 1 - (f - 2) * 0.25;
    // ignition flash
    const core = [7, 5, 3.5, 2.5, 0, 0][f]!;
    if (core) c.forEllipse(24, 30, core, core * 0.8, (x, y, nx, ny) => grey(c, x, y, nx * nx + ny * ny < 0.5 ? 1 : 0.75, 1));
    // ring of flame tongues that spreads, licks up and dies down
    const ring = 3 + 11 * Math.sin(Math.min(1, t * 1.8) * Math.PI * 0.5);
    const hMul = [0.35, 0.85, 1, 0.8, 0.5, 0.25][f]!;
    for (const tg of [...tongues].sort((p, q) => Math.sin(p.ang) - Math.sin(q.ang))) {
      const bx = 24 + Math.cos(tg.ang) * ring;
      const by = 32 + Math.sin(tg.ang) * ring * 0.55;
      flame(c, bx, by, tg.h * hMul, tg.w * (0.6 + hMul * 0.4), tg.lean + Math.cos(tg.ang) * 0.3, fade);
    }
    // embers rising
    if (f >= 2)
      for (const sp of sparks) grey(c, 24 + sp.x + sp.drift * f, 28 + sp.y - sp.up * (f - 1) * 2.2, f < 5 ? 1 : 0.6, fade);
    return c;
  });
}

function frostBurst(rng: Rng): Canvas[] {
  const shards = Array.from({ length: 7 }, (_, k) => ({
    ang: (k / 7) * Math.PI * 2 + rng.range(-0.2, 0.2),
    len: rng.range(12, 19),
  }));
  return [0, 1, 2, 3, 4, 5].map((f) => {
    const c = new Canvas(B, B);
    const grow = [0.35, 0.75, 1, 1, 1, 1][f]!;
    const fade = [1, 1, 1, 0.85, 0.6, 0.35][f]!;
    const shatter = f >= 3;
    for (const sh of shards) {
      const len = sh.len * grow;
      const ca = Math.cos(sh.ang);
      const sa = Math.sin(sh.ang);
      // diamond crystal along the ray
      for (let s = 0; s <= len; s += 0.4) {
        const p = s / len;
        const half = 3.2 * Math.sin(Math.min(1, p * 1.25) * Math.PI) * (p < 0.8 ? 1 : (1 - p) * 5);
        if (shatter && Math.floor(s / 4) % 2 === (f % 2)) continue; // break into fragments
        const off = shatter ? (f - 2) * 1.5 : 0;
        for (let w = -half; w <= half; w += 0.5) {
          const x = 24 + ca * (s + off) - sa * w;
          const y = 24 + sa * (s + off) + ca * w;
          const facet = w < 0 ? 1 : 0.6;
          grey(c, x, y, Math.abs(w) > half - 0.8 ? 0.45 : facet, fade);
        }
      }
    }
    // snowflake core
    if (f < 4) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        for (let r = 0; r < 5; r++) grey(c, 24 + Math.cos(a) * r, 24 + Math.sin(a) * r, 1, fade);
      }
    }
    return c;
  });
}

function stormBurst(rng: Rng): Canvas[] {
  return [0, 1, 2, 3, 4, 5].map((f) => {
    const c = new Canvas(B, B);
    const fade = [1, 1, 0.9, 0.75, 0.5, 0.3][f]!;
    const flash = [6, 4, 3, 2, 1, 0][f]!;
    if (flash) c.forEllipse(24, 24, flash, flash, (x, y) => grey(c, x, y, 1, 1));
    const bolts = f < 4 ? 4 : 2;
    for (let b = 0; b < bolts; b++) {
      let ang = (b / bolts) * Math.PI * 2 + f * 0.7 + rng.range(-0.3, 0.3);
      let x = 24;
      let y = 24;
      const len = rng.range(14, 21) * (f === 0 ? 0.6 : 1);
      let walked = 0;
      while (walked < len) {
        const seg = rng.range(3, 5);
        ang += rng.range(-0.8, 0.8);
        const nx = x + Math.cos(ang) * seg;
        const ny = y + Math.sin(ang) * seg;
        const steps = Math.ceil(seg * 2);
        for (let i = 0; i <= steps; i++) {
          const px = x + ((nx - x) * i) / steps;
          const py = y + ((ny - y) * i) / steps;
          grey(c, px, py, 1, fade);
          if (walked < len * 0.5) grey(c, px + 1, py, 0.6, fade * 0.8);
        }
        // forks
        if (rng.chance(0.3)) {
          const fa = ang + rng.range(0.6, 1.1) * (rng.chance(0.5) ? 1 : -1);
          for (let i = 0; i < 6; i++) grey(c, nx + Math.cos(fa) * i * 0.7, ny + Math.sin(fa) * i * 0.7, 0.65, fade * 0.8);
        }
        x = nx;
        y = ny;
        walked += seg;
      }
    }
    return c;
  });
}

function hollowBurst(rng: Rng): Canvas[] {
  const motes = Array.from({ length: 14 }, () => ({ ang: rng.range(0, Math.PI * 2), r: rng.range(14, 22) }));
  return [0, 1, 2, 3, 4, 5].map((f) => {
    const c = new Canvas(B, B);
    const t = f / 5;
    // contracting ring
    const ring = 21 * (1 - t) + 3;
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const d = Math.hypot(x + 0.5 - 24, y + 0.5 - 24);
        const ang = Math.atan2(y + 0.5 - 24, x + 0.5 - 24);
        const band = Math.abs(d - ring);
        if (band < 1.6) grey(c, x, y, band < 0.7 ? 1 : 0.55, 1 - t * 0.4);
        // spiral arms pulled inward
        const spiral = Math.sin(ang * 3 + d * 0.45 - f * 1.4);
        if (d < ring - 2 && spiral > 0.86) grey(c, x, y, 0.45, (0.8 - t * 0.3) * (d / ring));
      }
    // motes sucked in
    for (const m of motes) {
      const r = m.r * (1 - t * 0.9);
      const a = m.ang + t * 2.2;
      grey(c, 24 + Math.cos(a) * r, 24 + Math.sin(a) * r, 0.9, 0.9);
    }
    // the hollow core: a dim orb with a bright rim, collapsing to a point
    const core = f < 5 ? 4 + f * 0.6 : 2;
    c.forEllipse(24, 24, core, core, (x, y, nx, ny) => {
      const r = nx * nx + ny * ny;
      grey(c, x, y, r > 0.55 ? 1 : 0.3, r > 0.55 ? 1 : 0.6);
    });
    return c;
  });
}

// ---- telegraphs, lights, shadow ---------------------------------------------------------------

function telegraphCircle(fill: boolean): Canvas {
  const S = 64;
  const c = new Canvas(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
      if (d > 31.5) continue;
      if (fill) {
        c.set(x, y, WHITE, 255 * (d > 29.5 ? 0.9 : 0.55));
        continue;
      }
      let a = 0.18 + (d / 32) * 0.17; // faint fill, brighter towards the rim
      if (d > 29.5) a = 1;
      else if (d > 28.5) a = 0.55;
      else if (Math.abs(d - 22) < 0.6 && Math.floor((Math.atan2(y - 32, x - 32) / Math.PI) * 12 + 12) % 2 === 0) a = 0.6; // dashed inner ring
      c.set(x, y, WHITE, 255 * a);
    }
  return c;
}

function telegraphCone(): Canvas {
  const S = 64;
  const c = new Canvas(S, S);
  const half = (30 * Math.PI) / 180;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - 1;
      const dy = y + 0.5 - 32;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      if (d > 62.5 || Math.abs(ang) > half) continue;
      const edgeA = (half - Math.abs(ang)) * d;
      let a = 0.2 + (d / 62) * 0.18;
      if (d > 60.5 || edgeA < 1.2) a = 1;
      else if (d > 59.5 || edgeA < 2.2) a = 0.55;
      c.set(x, y, WHITE, 255 * a);
    }
  return c;
}

/**
 * Boss AoE ground sigil (128 px): double outer ring with runes between the rings, a dashed inner
 * ring, faint spokes; the centre stays clear so the growing fill reads through it.
 */
function aoeSigil(): Canvas {
  const S = 128;
  const C = S / 2;
  const c = new Canvas(S, S);
  const RUNES = 12;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - C;
      const dy = y + 0.5 - C;
      const d = Math.hypot(dx, dy);
      if (d > 63.5) continue;
      const ang = Math.atan2(dy, dx);
      const turn = (ang / (Math.PI * 2) + 1) % 1; // 0..1
      let a = 0;
      if (d > 61.5) a = 1; // outer ring
      else if (d > 60.5) a = 0.55;
      else if (Math.abs(d - 50) < 0.8) a = 0.9; // inner rune band edge
      else if (d > 51 && d < 60) {
        // A rune per sector: little strokes picked from a hash so each sigil reads as script.
        const sector = Math.floor(turn * RUNES);
        const local = turn * RUNES - sector; // 0..1 across the sector
        const u = Math.floor(local * 6); // 6 columns per rune
        const v = Math.floor((d - 51) / 1.5); // 6 rows
        if (local > 0.15 && local < 0.85 && hash2(sector * 7 + u, v, 41) > 0.58) a = 0.85;
        // Separator ticks between runes.
        if (local < 0.04) a = 0.6;
      } else if (Math.abs(d - 36) < 0.6 && Math.floor(turn * 48) % 2 === 0) a = 0.6; // dashed ring
      else if (d > 14 && d < 49 && Math.abs(((turn * 8) % 1) - 0.5) * d * Math.PI * 2 / 8 < 0.55) a = 0.3; // 8 spokes
      if (a > 0) c.set(x, y, WHITE, 255 * a);
    }
  return c;
}

/** Cone version (128 px, tip at the left middle, 60° wide, pointing right): double edges, runes along the arc. */
function aoeConeSigil(): Canvas {
  const S = 128;
  const c = new Canvas(S, S);
  const half = (30 * Math.PI) / 180;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - 1;
      const dy = y + 0.5 - 64;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      if (d > 126.5 || Math.abs(ang) > half) continue;
      const edge = (half - Math.abs(ang)) * d; // px from the side edge
      let a = 0;
      if (d > 124.5 || edge < 1.2) a = 1;
      else if (edge > 3 && edge < 4.2 && d > 12) a = 0.55; // second edge line
      else if (d > 112 && d < 122) {
        const along = (ang + half) / (2 * half); // 0..1 across the arc
        const sector = Math.floor(along * 5);
        const local = along * 5 - sector;
        const u = Math.floor(local * 6);
        const v = Math.floor((d - 112) / 1.7);
        if (local > 0.15 && local < 0.85 && hash2(sector * 11 + u, v, 43) > 0.58) a = 0.85;
      } else if (Math.abs(d - 110.5) < 0.6) a = 0.9;
      else if (Math.abs(d % 24 - 12) < 0.5 && d > 20 && d < 108 && Math.floor(ang * 40) % 2 === 0) a = 0.35; // dashed arcs
      if (a > 0) c.set(x, y, WHITE, 255 * a);
    }
  return c;
}

function lightSoft(size: number): Canvas {
  const c = new Canvas(size, size);
  const h = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - h, y + 0.5 - h) / h;
      if (d >= 1) continue;
      const a = Math.pow(1 - d * d, 2);
      c.set(x, y, WHITE, Math.round(255 * clamp(a)));
    }
  return c;
}

function lightBanded(size: number): Canvas {
  const c = new Canvas(size, size);
  const h = size / 2;
  const levels = [1, 0.62, 0.36, 0.16];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - h, y + 0.5 - h) / h;
      if (d >= 1) continue;
      const band = Math.min(3, Math.floor(d * 4 + (hash2(x, y, 3) - 0.5) * 0.25));
      c.set(x, y, WHITE, Math.round(255 * levels[band]!));
    }
  return c;
}

/**
 * Column of light over rare loot: a bright core with a soft halo, narrowing and fading upwards,
 * a flare where it meets the ground, a few faint streaks. Origin = bottom centre (12, 92).
 */
function lootBeam(): Canvas {
  const W = 24;
  const H = 96;
  const base = 92;
  const c = new Canvas(W, H);
  const levels = (a: number) => (a > 0.8 ? 1 : a > 0.55 ? 0.72 : a > 0.32 ? 0.48 : a > 0.14 ? 0.26 : a > 0.04 ? 0.12 : 0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - W / 2);
      const up = clamp((base - y) / base); // 0 at the ground … 1 at the top
      // Column: half-width shrinks with height; the core stays a hard bright line.
      const halo = 5.5 - up * 3;
      const core = dx < 1 ? 1 : dx < 2 ? 0.7 : 0;
      const soft = Math.exp(-(dx * dx) / (2 * halo * halo * 0.35));
      const fade = y > base ? 0 : Math.pow(1 - up, 1.6);
      const streak = hash2(x, Math.floor(y / 6), 11) > 0.86 && dx < halo ? 0.25 : 0;
      let a = Math.max(core * 0.9, soft * 0.55 + streak) * fade;
      // Ground flare: a flat ellipse of light at the foot.
      const fy = (y + 0.5 - base) / 3.2;
      const fx = (x + 0.5 - W / 2) / 11;
      const f = 1 - (fx * fx + fy * fy);
      if (f > 0) a = Math.max(a, f * 0.85);
      const v = levels(clamp(a));
      if (v > 0) c.set(x, y, WHITE, Math.round(255 * v));
    }
  return c;
}

/** Status glyphs over afflicted actors: white with a dark outline (tinted by element at runtime). */
const ELEMENT_GLYPHS: Record<"ember" | "frost" | "storm" | "hollow", string[]> = {
  ember: ["....X....", "...XX....", "...XXX...", "..XXXX.X.", ".XXXXXXX.", ".XXX.XXX.", ".XX...XX.", "..XX.XX..", "...XXX..."],
  frost: ["....X....", ".X..X..X.", "..X.X.X..", "...XXX...", "XXXXXXXXX", "...XXX...", "..X.X.X..", ".X..X..X.", "....X...."],
  storm: [".....XXX.", "....XXX..", "...XXX...", "..XXXXXX.", ".XXXXXX..", "....XXX..", "...XX....", "..XX.....", ".X......."],
  hollow: [".........", "..XXXXX..", ".XX...XX.", "XX..X..XX", "X..XXX..X", "XX..X..XX", ".XX...XX.", "..XXXXX..", "........."],
};
export const ELEMENT_GLYPH_ORDER = ["ember", "frost", "storm", "hollow"] as const;

function elementGlyph(rows: string[]): Canvas {
  const c = new Canvas(11, 11);
  const on = (x: number, y: number) => rows[y - 1]?.[x - 1] === "X";
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < 11; x++) {
      if (on(x, y)) c.set(x, y, WHITE, 255);
      else if ([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([dx, dy]) => on(x + dx!, y + dy!))) c.set(x, y, "#120c10", 235);
    }
  return c;
}

function shadowEllipse(): Canvas {
  const c = new Canvas(32, 16);
  c.forEllipse(16, 8, 15, 7, (x, y, nx, ny) => {
    const d = nx * nx + ny * ny;
    c.set(x, y, "#000000", d < 0.45 ? 110 : 70);
  });
  return c;
}

export function vfx(rng: Rng, _P: PaletteModule): GeneratedAsset[] {
  const out: GeneratedAsset[] = [];
  const tint = { tint: "runtime" } as const;
  for (const [name, size] of [
    ["s", 32],
    ["m", 48],
    ["l", 64],
  ] as const) {
    out.push(
      asset(`vfx/slash-${name}.png`, "vfx", Canvas.strip(slashFrames(size)), { w: size, h: size, frames: 4 }, {
        ...tint,
        fps: 20,
        direction: "right",
        originX: size / 2,
        originY: size / 2,
      }),
    );
  }
  out.push(asset("vfx/impact-spark.png", "vfx", Canvas.strip(sparkFrames()), { w: 32, h: 32, frames: 4 }, { ...tint, fps: 18 }));
  out.push(asset("vfx/dust-puff.png", "vfx", Canvas.strip(dustFrames()), { w: 32, h: 32, frames: 5 }, { ...tint, fps: 12 }));
  const bursts = { ember: emberBurst, frost: frostBurst, storm: stormBurst, hollow: hollowBurst } as const;
  for (const [el, fn] of Object.entries(bursts))
    out.push(asset(`vfx/burst-${el}.png`, "vfx", Canvas.strip(fn(rng)), { w: B, h: B, frames: 6 }, { ...tint, element: el, fps: 14 }));
  out.push(asset("vfx/telegraph-circle.png", "vfx", telegraphCircle(false), undefined, { ...tint, telegraph: "circle" }));
  out.push(asset("vfx/telegraph-circle-fill.png", "vfx", telegraphCircle(true), undefined, { ...tint, telegraph: "circle-fill" }));
  out.push(asset("vfx/telegraph-cone.png", "vfx", telegraphCone(), undefined, { ...tint, telegraph: "cone", angleDeg: 60, originX: 1, originY: 32, direction: "right" }));
  out.push(asset("vfx/aoe-sigil.png", "vfx", aoeSigil(), undefined, { ...tint, telegraph: "boss-circle" }));
  out.push(asset("vfx/aoe-cone-sigil.png", "vfx", aoeConeSigil(), undefined, { ...tint, telegraph: "boss-cone", angleDeg: 60, originX: 1, originY: 64, direction: "right" }));
  out.push(asset("vfx/light-soft.png", "light", lightSoft(128), undefined, { blend: "add" }));
  out.push(asset("vfx/light-banded.png", "light", lightBanded(64), undefined, { blend: "add" }));
  out.push(asset("vfx/loot-beam.png", "vfx", lootBeam(), undefined, { ...tint, blend: "add", originX: 12, originY: 92 }));
  out.push(asset("vfx/element-icons.png", "vfx", Canvas.strip(ELEMENT_GLYPH_ORDER.map((el) => elementGlyph(ELEMENT_GLYPHS[el]))), { w: 11, h: 11, frames: 4 }, { ...tint, frames: ELEMENT_GLYPH_ORDER.join(",") }));
  out.push(asset("vfx/shadow.png", "vfx", shadowEllipse(), undefined, { blend: "normal" }));
  return out;
}
