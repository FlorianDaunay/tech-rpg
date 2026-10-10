/**
 * Ground tiles (32×32): animated water + shore autotile, dirt path autotile, wooden floor, rift
 * ground, tall grass, flowers.
 *
 * Terrain autotiles use the "terrain-3x3+inner" layout (5×3 tiles per block):
 *   cols 0-2 × rows 0-2 : NW N NE / W C E / SW S SE  (an island of terrain on transparent ground)
 *   cols 3-4 × rows 0-1 : inner corners (ground notch in the NW, NE / SW, SE corner)
 *   cols 3-4 × row 2    : plain centre variants
 * Outside the terrain is transparent so the tiles layer over any ground tile.
 */
import type { Rng } from "../../../src/core/math/rng";
import { mix, type Color, type RGB } from "../png";
import type { GeneratedAsset, PaletteModule } from "../types";
import { asset, Canvas, clamp, fbm, hash2, noise, rampPick } from "./lib";

const T = 32;
const LAYOUT = { layout: "terrain-3x3+inner", blockCols: 5, blockRows: 3 } as const;

type SdfFn = (x: number, y: number) => number;

/** Signed distance (negative inside the terrain) of a rounded box occupying the 3×3 block. */
function roundedBox(u: number, v: number, inset: number, r: number, size = 96) {
  const c = size / 2;
  const h = c - inset;
  const px = Math.abs(u - c) - (h - r);
  const py = Math.abs(v - c) - (h - r);
  return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - r;
}

/** Signed distance (negative = terrain) inside a notch tile where the ground occupies one corner. */
function notch(up: number, vp: number, inset: number, r: number) {
  const px = up - (inset - r);
  const py = vp - (inset - r);
  const land = Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - r;
  return -land;
}

/**
 * Build the 13 masks of a terrain autotile. Edge perturbation uses 1-D noise periodic on 32 px of
 * the tile-local coordinate, so every edge tile repeats seamlessly.
 */
function terrainSdfs(inset: number, r: number, amp: number, seed: number): SdfFn[][] {
  const n1 = (t: number) => noise(t, 0, 8, seed, T) - 0.5;
  const wob = (lx: number, ly: number) => amp * (n1(lx) + n1(ly + 13));
  const grid: SdfFn[][] = [];
  for (let row = 0; row < 3; row++) {
    grid[row] = [];
    for (let col = 0; col < 5; col++) {
      let f: SdfFn;
      if (col < 3) f = (x, y) => roundedBox(col * T + x + 0.5, row * T + y + 0.5, inset, r) + wob(x, y);
      else if (row < 2) {
        const flipX = col === 4;
        const flipY = row === 1;
        f = (x, y) => {
          const up = flipX ? T - (x + 0.5) : x + 0.5;
          const vp = flipY ? T - (y + 0.5) : y + 0.5;
          return notch(up, vp, inset, Math.min(r * 0.45, inset - 1)) + wob(x, y);
        };
      } else f = () => -99;
      grid[row]![col] = f;
    }
  }
  return grid;
}

// ---- water ----------------------------------------------------------------------------------

function waterPixel(W: readonly Color[], x: number, y: number, frame: number, seed: number): RGB {
  const lx = ((x % T) + T) % T;
  const ly = ((y % T) + T) % T;
  // slow drifting tone (period 32 so it tiles; drifts 8 px per frame → loops over 4 frames)
  const n = fbm(lx + frame * 8, ly + frame * 0, 16, seed, T, 2);
  const n2 = noise(lx - frame * 8, ly, 8, seed + 7, T);
  const t = 0.42 + (n - 0.5) * 0.4 + (n2 - 0.5) * 0.12;
  let col = rampPick(W.slice(1, 4), t, lx, ly, 0.35);
  // wave crests: short horizontal dashes that grow/shrink over the 4 frames
  for (let k = 0; k < 6; k++) {
    const cx = Math.floor(hash2(k, 1, seed) * T);
    const cy = Math.floor(hash2(k, 2, seed) * T);
    const phase = Math.floor(hash2(k, 3, seed) * 4);
    const stage = (frame + phase) % 4;
    const half = [0, 1, 2, 1][stage]!;
    if (half === 0) continue;
    let dy = ly - cy;
    let dx = lx - cx;
    if (dx > T / 2) dx -= T;
    if (dx < -T / 2) dx += T;
    if (dy > T / 2) dy -= T;
    if (dy < -T / 2) dy += T;
    const adx = Math.abs(dx);
    // a small crest: bright centre, mid-tone tips curving down one pixel
    if (dy === 0 && adx < half) col = rgbOf(stage === 2 && adx === 0 ? W[6]! : W[5]!);
    else if (dy === 0 && adx === half) col = rgbOf(W[4]!);
    else if (dy === 1 && adx === half + 1 && half === 2) col = rgbOf(W[4]!);
    else if (dy === 1 && adx < half) col = mix(col, W[1]!, 0.4);
  }
  return col;
}

function drawTerrainWater(P: PaletteModule, frame: number, seed: number, sdfs: SdfFn[][], lily: boolean): Canvas {
  const W = P.WORLD_RAMPS.water;
  const D = P.WORLD_RAMPS.dirt;
  const G = P.WORLD_RAMPS.grass;
  const c = new Canvas(5 * T, 3 * T);
  const foamW = [1.4, 2.2, 1.8, 1.0][frame]!;
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++) {
      const sdf = sdfs[row]![col]!;
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const d = sdf(x, y);
          const px = col * T + x;
          const py = row * T + y;
          if (d >= 2.6) continue;
          if (d >= 1.6) {
            c.set(px, py, G[1]!, 200);
            continue;
          }
          if (d >= 0) {
            c.set(px, py, d < 0.8 ? D[0]! : D[1]!);
            continue;
          }
          // water: darker band under a north bank (the bank's vertical face / shadow)
          const above1 = sdf(x, y - 1) >= 0;
          const above3 = sdf(x, y - 3) >= 0;
          let colr = waterPixel(W, x, y, frame, seed);
          const foam = -d < foamW + (hash2(x, y, seed + frame) - 0.5) * 0.8;
          if (above1) colr = rgbOf(D[0]!);
          else if (above3) colr = mix(colr, W[0]!, 0.55);
          else if (foam) colr = rgbOf(-d < foamW * 0.5 ? W[6]! : W[5]!);
          c.set(px, py, colr);
        }
    }
  if (lily) drawLilies(c, 4 * T, 2 * T, P, seed);
  return c;
}

const rgbOf = (c: Color): RGB => mix(c, c, 0);

function drawLilies(c: Canvas, ox: number, oy: number, P: PaletteModule, seed: number) {
  const L = P.WORLD_RAMPS.leaf;
  const pads: [number, number, number][] = [
    [9, 10, 4],
    [22, 19, 3],
    [12, 24, 3],
  ];
  pads.forEach(([cx, cy, r], i) => {
    c.forEllipse(ox + cx, oy + cy, r + 0.5, r * 0.75 + 0.3, (x, y, nx, ny) => {
      const notchCut = ny < 0 && Math.abs(nx) < 0.18;
      if (notchCut) return;
      const edge = nx * nx + ny * ny > 0.6;
      c.set(x, y, edge ? L[1]! : ny < -0.2 && nx < 0 ? L[4]! : L[3]!);
    });
    if (i === 0) {
      c.set(ox + cx + 1, oy + cy - 1, P.WORLD_RAMPS.flowers[3]);
      c.set(ox + cx + 2, oy + cy - 1, P.WORLD_RAMPS.flowers[1]);
      c.set(ox + cx + 1, oy + cy - 2, P.WORLD_RAMPS.flowers[1]);
    }
  });
  void seed;
}

// ---- dirt path ------------------------------------------------------------------------------

function dirtPixel(P: PaletteModule, x: number, y: number, seed: number): RGB {
  const D = P.WORLD_RAMPS.dirt;
  const n = fbm(x, y, 8, seed, T, 2);
  const h = hash2(x, y, seed + 3);
  if (h < 0.035) return rgbOf(D[1]!);
  if (h > 0.975) return rgbOf(D[4]!);
  return rampPick(D.slice(2, 5), 0.5 + (n - 0.5) * 0.38, x, y, 0.25);
}

function drawPebbles(c: Canvas, ox: number, oy: number, P: PaletteModule, seed: number, inside: (x: number, y: number) => boolean) {
  const S = P.WORLD_RAMPS.stone;
  const D = P.WORLD_RAMPS.dirt;
  for (let k = 0; k < 5; k++) {
    const x = 2 + Math.floor(hash2(k, 11, seed) * 28);
    const y = 2 + Math.floor(hash2(k, 12, seed) * 28);
    if (!inside(x, y) || !inside(x + 1, y + 1)) continue;
    const big = hash2(k, 13, seed) > 0.6;
    c.set(ox + x, oy + y + 1, D[0]!);
    c.set(ox + x, oy + y, S[4]!);
    if (big) {
      c.set(ox + x + 1, oy + y, S[3]!);
      c.set(ox + x + 1, oy + y + 1, D[0]!);
      c.set(ox + x, oy + y - 1, S[5]!);
    }
  }
  for (let k = 0; k < 10; k++) {
    const x = Math.floor(hash2(k, 21, seed) * 32);
    const y = Math.floor(hash2(k, 22, seed) * 32);
    if (inside(x, y)) c.set(ox + x, oy + y, hash2(k, 23, seed) > 0.5 ? D[4]! : D[1]!);
  }
}

function drawTerrainDirt(P: PaletteModule, seed: number, sdfs: SdfFn[][]): Canvas {
  const D = P.WORLD_RAMPS.dirt;
  const G = P.WORLD_RAMPS.grass;
  const c = new Canvas(5 * T, 3 * T);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++) {
      const sdf = sdfs[row]![col]!;
      const tileSeed = seed + (col === 4 && row === 2 ? 50 : col === 3 && row === 2 ? 40 : 0);
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const d = sdf(x, y);
          const px = col * T + x;
          const py = row * T + y;
          if (d >= 1) continue;
          if (d >= 0) {
            c.set(px, py, G[1]!, 170);
            continue;
          }
          // the path sits slightly lower: shaded lip under a north edge, light lip on south edges
          if (sdf(x, y - 1) >= 0 || sdf(x - 1, y) >= 0) c.set(px, py, D[1]!);
          else if (sdf(x, y - 2) >= 0) c.set(px, py, mix(dirtPixel(P, x, y, tileSeed), D[1]!, 0.5));
          else if (sdf(x, y + 1) >= 0 || sdf(x + 1, y) >= 0) c.set(px, py, D[3]!);
          else c.set(px, py, dirtPixel(P, x, y, tileSeed));
        }
      drawPebbles(c, col * T, row * T, P, tileSeed + row * 7 + col, (x, y) => sdf(x, y) < -2);
      // grass blades poking over the edge
      for (let k = 0; k < 14; k++) {
        const x = Math.floor(hash2(k, 31 + col, seed + row) * 32);
        const y = Math.floor(hash2(k, 41 + col, seed + row) * 32);
        const d = sdf(x, y);
        if (d < -2.5 || d > 0.5) continue;
        const h = 2 + Math.floor(hash2(k, 51, seed) * 2);
        for (let i = 0; i < h; i++) c.set(col * T + x, row * T + y - i, i === h - 1 ? G[5]! : G[3]!);
        c.set(col * T + x, row * T + y + 1, G[1]!);
      }
    }
  return c;
}

// ---- wooden floor ---------------------------------------------------------------------------

function woodFloor(P: PaletteModule, variant: number): Canvas {
  const Wd = P.WORLD_RAMPS.wood;
  const c = new Canvas(T, T);
  const plankH = 8;
  for (let y = 0; y < T; y++) {
    const plank = Math.floor(y / plankH);
    const yy = y % plankH;
    const joint = (plank * 13 + variant * 7 + 5) % T;
    const joint2 = (joint + 16 + ((plank + variant) % 2) * 3) % T;
    const tone = hash2(plank, variant, 99) * 0.25;
    for (let x = 0; x < T; x++) {
      const segment = x >= joint && x < joint2 ? 1 : 0;
      const grain = noise(x * 0.35, y * 2.2 + plank * 40 + segment * 9, 3, variant + plank * 3 + segment) - 0.5;
      let t = 0.5 + tone - segment * 0.12 + grain * 0.35;
      if (yy === 0) t = 0.95; // lit top edge
      if (yy === plankH - 1) t = -0.2; // seam shadow
      if (yy === plankH - 2) t -= 0.15;
      let colr = rampPick(Wd.slice(1), t, x, y, 0.3);
      if ((x === joint || x === joint2) && yy < plankH - 1) colr = rgbOf(Wd[0]!);
      if ((x === joint + 1 || x === joint2 + 1) && yy < plankH - 1 && yy > 0) colr = rgbOf(Wd[4]!);
      c.set(x, y, colr);
    }
    // nails near joints
    if (yy === 3) {
      for (const jx of [joint, joint2]) {
        c.set((jx + 2) % T, y, Wd[0]!);
        c.set((jx + T - 2) % T, y, Wd[0]!);
      }
    }
  }
  // a knot
  const kx = 6 + variant * 11;
  const ky = 3 + ((variant * 9) % 3) * 8;
  c.set(kx, ky, Wd[1]!);
  c.set(kx + 1, ky, Wd[2]!);
  return c;
}

// ---- rift ground ----------------------------------------------------------------------------

function riftGround(P: PaletteModule, variant: number): Canvas {
  const R = P.WORLD_RAMPS.rift;
  const Gl = P.WORLD_RAMPS.riftGlow;
  const c = new Canvas(T, T);
  const seed = 300 + variant * 17;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = fbm(x, y, 16, seed, T, 3);
      // flagstone-ish cells via worley-like ridges from two noises
      const ridge = Math.abs(noise(x, y, 8, seed + 5, T) - 0.5);
      let t = 0.35 + (n - 0.5) * 0.8;
      if (ridge < 0.03) t = -0.1;
      else if (ridge < 0.06) t -= 0.18;
      c.set(x, y, rampPick(R.slice(0, 5), t, x, y, 0.45));
    }
  // glowing fissure (a random walk), brighter in the middle
  if (variant > 0) {
    let x = 4 + variant * 6;
    let y = 3;
    const len = 18 + variant * 4;
    for (let i = 0; i < len; i++) {
      const glow = i > 3 && i < len - 3 ? Gl[1]! : Gl[0]!;
      c.set(x, y, glow);
      if (i > 5 && i < len - 6) c.set(x + 1, y, Gl[0]!);
      if (i === Math.floor(len / 2)) c.set(x, y, Gl[2]!);
      y++;
      x += Math.floor(hash2(i, variant, seed) * 3) - 1;
      x = Math.max(1, Math.min(T - 3, x));
    }
  }
  // faint motes
  for (let k = 0; k < 4; k++) {
    const x = Math.floor(hash2(k, 61, seed) * 32);
    const y = Math.floor(hash2(k, 62, seed) * 32);
    c.set(x, y, mix(R[4]!, Gl[0]!, 0.5));
  }
  return c;
}

// ---- tall grass & flowers --------------------------------------------------------------------

function tallGrass(P: PaletteModule, rng: Rng, frames: number): Canvas[] {
  const G = P.WORLD_RAMPS.grass;
  const blades = Array.from({ length: 26 }, () => ({
    x: rng.int(3, 28),
    base: rng.int(20, 30),
    h: rng.int(8, 15),
    lean: rng.range(-0.18, 0.18),
    tone: rng.int(2, 4),
    phase: rng.next() * Math.PI * 2,
  })).sort((a, b) => a.base - b.base);
  return Array.from({ length: frames }, (_, f) => {
    const c = new Canvas(T, T);
    // base clump shadow
    c.forEllipse(16, 27, 13, 3.5, (x, y) => c.set(x, y, G[1]!, 150));
    for (const b of blades) {
      const sway = Math.sin((f / frames) * Math.PI * 2 + b.phase) * 1.4;
      for (let i = 0; i < b.h; i++) {
        const t = i / b.h;
        const x = Math.round(b.x + b.lean * i + sway * t * t);
        const y = b.base - i;
        const shade = i === b.h - 1 ? G[4]! : t > 0.65 ? G[Math.min(4, b.tone + 1)]! : t > 0.3 ? G[b.tone]! : G[Math.max(1, b.tone - 1)]!;
        c.set(x, y, shade);
        if (i < b.h * 0.4) c.set(x + 1, y, G[Math.max(0, b.tone - 2)]!);
      }
    }
    c.outline(G[0]!, {});
    return c;
  });
}

function flowerPatch(P: PaletteModule, rng: Rng, variant: number): Canvas {
  const G = P.WORLD_RAMPS.grass;
  const F = P.WORLD_RAMPS.flowers;
  const c = new Canvas(T, T);
  const main = F[variant % F.length]!;
  const alt = F[(variant + 2) % F.length]!;
  const clusters = [
    [rng.int(7, 12), rng.int(8, 14)],
    [rng.int(19, 25), rng.int(17, 24)],
    ...(variant % 2 ? [[rng.int(6, 11), rng.int(21, 26)] as const] : []),
  ] as const;
  const flowers: [number, number, Color][] = [];
  for (const [cx, cy] of clusters) {
    // leafy base
    for (let k = 0; k < 7; k++) {
      const x = cx + rng.int(-4, 4);
      const y = cy + rng.int(0, 3);
      c.set(x, y, G[2]!);
      c.set(x, y - 1, G[4]!);
      c.set(x + (k % 2 ? 1 : -1), y - 2, G[5]!);
    }
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) flowers.push([cx + rng.int(-4, 4), cy + rng.int(-3, 1), rng.chance(0.75) ? main : alt]);
  }
  flowers.sort((a, b) => a[1] - b[1]);
  for (const [x, y, col] of flowers) {
    const light = mix(col, "#ffffff", 0.4);
    const dark = mix(col, G[0]!, 0.5);
    c.set(x, y + 2, G[0]!, 140); // tiny shadow
    c.set(x + 1, y + 2, G[0]!, 140);
    c.set(x, y - 1, light);
    c.set(x - 1, y, light);
    c.set(x + 1, y, col);
    c.set(x, y + 1, dark);
    c.set(x + 1, y + 1, dark);
    c.set(x - 1, y + 1, col);
    c.set(x, y, variant % 2 ? "#f6e08a" : "#c7863a");
  }
  return c;
}

export function tiles(rng: Rng, P: PaletteModule): GeneratedAsset[] {
  const out: GeneratedAsset[] = [];

  // water: plain animated tile + shore autotile (4 animation frames, blocks laid side by side)
  const waterSdf = terrainSdfs(9, 18, 2.4, 11);
  const blocks = [0, 1, 2, 3].map((f) => drawTerrainWater(P, f, 21, waterSdf, true));
  const waterStrip = Canvas.strip(blocks.map((b) => b.crop(T, T, T, T)));
  out.push(asset("tiles/water.png", "tile", waterStrip, { w: T, h: T, frames: 4 }, { anim: "loop", fps: 4 }));
  out.push(
    asset("tiles/water-shore.png", "tileset", Canvas.strip(blocks), { w: T, h: T, frames: 60 }, {
      ...LAYOUT,
      animFrames: 4,
      blockWidth: 160,
      fps: 4,
    }),
  );

  const dirtSdf = terrainSdfs(7, 16, 3.2, 33);
  out.push(asset("tiles/dirt-path.png", "tileset", drawTerrainDirt(P, 5, dirtSdf), { w: T, h: T, frames: 15 }, { ...LAYOUT }));

  out.push(asset("tiles/wood-floor.png", "tileset", Canvas.strip([0, 1, 2].map((v) => woodFloor(P, v))), { w: T, h: T, frames: 3 }));
  out.push(asset("tiles/rift-ground.png", "tileset", Canvas.strip([0, 1, 2, 3].map((v) => riftGround(P, v))), { w: T, h: T, frames: 4 }));
  out.push(asset("tiles/tall-grass.png", "tile", Canvas.strip(tallGrass(P, rng, 4)), { w: T, h: T, frames: 4 }, { anim: "loop", fps: 3 }));
  out.push(asset("tiles/flowers.png", "tile", Canvas.strip([0, 1, 2, 3, 4].map((v) => flowerPatch(P, rng, v))), { w: T, h: T, frames: 5 }));
  void clamp;
  return out;
}
