/**
 * Zone art for the Ashen Graveyard, Deep Mines, Fallen Citadel and Hollow Rift.
 * Tiles (32×32): ash ground, cave floor, flagstone, cave-wall autotile, void autotile.
 * Props: tombstones, crypt, bones, mine beam, crystals, minecart, pillars, rubble, banner,
 * brazier, rift crystals, rift spire. Same style rules as nature/buildings: top-left light,
 * 3-5 shades per material, dark non-black outline.
 */
import type { Rng } from "../../../src/core/math/rng";
import { mix, type Color } from "../png";
import type { GeneratedAsset, PaletteModule } from "../types";
import { asset, Canvas, clamp, fbm, groundShadow, hash2, noise, rampPick, sphereLight } from "./lib";
import { LAYOUT, T, terrainSdfs, type SdfFn } from "./tiles";

type Ramp = readonly Color[];

/** Outline every transparent pixel next to an opaque one (ignores semi-transparent shadows). */
function outlineOpaque(c: Canvas, color: Color) {
  const pts: [number, number][] = [];
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      if (c.alpha(x, y) === 255) continue;
      if ([c.alpha(x - 1, y), c.alpha(x + 1, y), c.alpha(x, y - 1), c.alpha(x, y + 1)].some((a) => a === 255)) pts.push([x, y]);
    }
  for (const [x, y] of pts) c.set(x, y, color);
}

/** A box shaded as a slab: lit top/left edges, dark right/bottom edges. */
function slab(c: Canvas, x0: number, y0: number, w: number, h: number, R: Ramp, seed: number, tone = 0) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const n = noise(x, y, 3, seed) - 0.5;
      let t = 0.55 + n * 0.3 + tone;
      if (y === y0 || x === x0) t += 0.3;
      if (y === y0 + h - 1 || x === x0 + w - 1) t -= 0.35;
      c.set(x, y, rampPick(R, t, x, y, 0.2));
    }
}

// ---- ground tiles -------------------------------------------------------------------------

/** Frostfell snow: soft drifts, a few sparkles, now and then a frozen grass tuft or an old track. */
function snowGround(P: PaletteModule, v: number) {
  const S = P.WORLD_RAMPS.snow;
  return groundTile(S.slice(2, 6), v, 900, (c, s) => {
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(hash2(k, 1, s) * 31);
      const y = Math.floor(hash2(k, 2, s) * 31);
      c.set(x, y, hash2(k, 3, s) > 0.4 ? S[5]! : P.WORLD_RAMPS.ice[4]!);
    }
    if (v % 3 === 1) {
      const G = P.WORLD_RAMPS.deadwood;
      const x = 5 + Math.floor(hash2(8, 1, s) * 20);
      const y = 12 + Math.floor(hash2(8, 2, s) * 14);
      for (let i = 0; i < 3; i++) {
        c.set(x + i * 2 - 2, y - (i % 2), G[3]!);
        c.set(x + i * 2 - 2, y - 1 - (i % 2), S[5]!);
      }
    }
    if (v % 4 === 3) {
      // two old footprints, half filled
      const x = 8 + Math.floor(hash2(7, 1, s) * 14);
      const y = 6 + Math.floor(hash2(7, 2, s) * 14);
      for (const [dx, dy] of [[0, 0], [4, 6]] as const) {
        c.set(x + dx, y + dy, S[2]!);
        c.set(x + dx + 1, y + dy, S[2]!);
        c.set(x + dx, y + dy + 1, S[1]!);
      }
    }
  }, 14);
}

/** Frozen lake: walkable glassy ice with pale cracks. */
function lakeIce(P: PaletteModule, v: number) {
  const I = P.WORLD_RAMPS.ice;
  const c = groundTile(I.slice(2, 5), v, 950, () => undefined, 16);
  const s = 950 + v * 31;
  // a crack: a short random walk
  let x = Math.floor(hash2(1, v, s) * 28) + 2;
  let y = Math.floor(hash2(2, v, s) * 28) + 2;
  for (let k = 0; k < 14; k++) {
    c.set(x, y, I[5]!);
    x += Math.round(hash2(k, 3, s) * 2 - 1);
    y += Math.round(hash2(k, 4, s) * 2 - 1);
  }
  return c;
}

function groundTile(R: Ramp, variant: number, seed: number, specks: (c: Canvas, s: number) => void, cell = 12): Canvas {
  const c = new Canvas(T, T);
  const s = seed + variant * 31;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const n = fbm(x, y, cell, s, T, 3);
      c.set(x, y, rampPick(R, 0.45 + (n - 0.5) * 0.6, x, y, 0.35));
    }
  specks(c, s);
  return c;
}

function ashGround(P: PaletteModule, v: number) {
  const A = P.WORLD_RAMPS.ash;
  return groundTile(A.slice(1, 5), v, 700, (c, s) => {
    for (let k = 0; k < 6; k++) {
      const x = Math.floor(hash2(k, 1, s) * 31);
      const y = Math.floor(hash2(k, 2, s) * 31);
      c.set(x, y, hash2(k, 3, s) > 0.5 ? A[0]! : A[5]!);
    }
    if (v % 3 === 1) {
      // a pale bone fragment
      const x = 6 + Math.floor(hash2(9, 1, s) * 18);
      const y = 6 + Math.floor(hash2(9, 2, s) * 18);
      c.set(x, y, P.WORLD_RAMPS.plaster[3]);
      c.set(x + 1, y, P.WORLD_RAMPS.plaster[2]);
      c.set(x + 2, y + 1, P.WORLD_RAMPS.plaster[3]);
    }
    if (v % 4 === 2) {
      // a dead grass tuft
      const G = P.WORLD_RAMPS.deadwood;
      const x = 4 + Math.floor(hash2(8, 1, s) * 22);
      const y = 10 + Math.floor(hash2(8, 2, s) * 16);
      for (let i = 0; i < 3; i++) {
        c.set(x + i * 2 - 2, y - i % 2, G[3]!);
        c.set(x + i * 2 - 2, y - 1 - (i % 2), G[2]!);
      }
    }
  });
}

function caveFloor(P: PaletteModule, v: number) {
  const S = P.WORLD_RAMPS.stone;
  // Earthy and darker than the grey walls, so tunnels read clearly against rock.
  const D = P.WORLD_RAMPS.dirt;
  return groundTile([P.WORLD_RAMPS.shadow[0], D[0]!, D[1]!, mix(D[1]!, S[1]!, 0.5)], v, 800, (c, s) => {
    for (let k = 0; k < 9; k++) {
      const x = Math.floor(hash2(k, 4, s) * 31);
      const y = Math.floor(hash2(k, 5, s) * 31);
      c.set(x, y + 1, P.WORLD_RAMPS.shadow[0]);
      c.set(x, y, S[2]!);
    }
  }, 8);
}

function flagstone(P: PaletteModule, v: number): Canvas {
  const S = P.WORLD_RAMPS.stone;
  const L = P.WORLD_RAMPS.leaf;
  const c = new Canvas(T, T);
  const s = 900 + v * 17;
  // 2×2 slabs per tile, rows offset by half a slab on odd variants
  const off = v % 2 ? 8 : 0;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const row = Math.floor(y / 16);
      const xx = (x + (row % 2 ? off : 0)) % T;
      const col = Math.floor(xx / 16);
      const lx = xx % 16;
      const ly = y % 16;
      const tone = hash2(row, col, s) * 0.3 - 0.15;
      const n = noise(x, y, 4, s) - 0.5;
      let t = 0.5 + tone + n * 0.3;
      if (lx === 0 || ly === 0) t = -0.1; // mortar
      else if (lx === 1 || ly === 1) t += 0.25; // lit edge
      else if (lx === 15 || ly === 15) t -= 0.25;
      c.set(x, y, rampPick(S.slice(1, 5), t, x, y, 0.2));
    }
  if (v >= 2) {
    // crack + moss in the joints
    let x = 4 + v * 5;
    let y = 3;
    for (let i = 0; i < 9; i++) {
      c.set(x % T, y, S[0]!);
      y += 1;
      x += Math.floor(hash2(i, v, s) * 3) - 1;
    }
    for (let k = 0; k < 10; k++) {
      const mx = Math.floor(hash2(k, 7, s) * 32);
      const my = hash2(k, 8, s) > 0.5 ? 16 : 0;
      c.set(mx, my, L[2]!);
      if (k % 3 === 0) c.set(mx, my + 1, L[3]!);
    }
  }
  return c;
}

// ---- wall autotiles ------------------------------------------------------------------------

/** Rock mass: lit top surface, a darker cliff face along south edges, cracks. */
function drawCaveWall(P: PaletteModule, sdfs: SdfFn[][], seed: number, S: Ramp = P.WORLD_RAMPS.stone, foot: Color = P.WORLD_RAMPS.shadow[0], top: Ramp = S.slice(0, 4)): Canvas {
  const c = new Canvas(5 * T, 3 * T);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++) {
      const sdf = sdfs[row]![col]!;
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const d = sdf(x, y);
          const px = col * T + x;
          const py = row * T + y;
          if (d >= 1.2) continue;
          if (d >= 0) {
            c.set(px, py, foot, 150); // contact shadow on the floor
            continue;
          }
          // Face: within 8 px above a south edge (the wall "drops" to the floor).
          let face = 0;
          for (let k = 1; k <= 8; k++) if (sdf(x, y + k) >= 0) face = face || k;
          const n = fbm(px, py, 8, seed, 0, 2) - 0.5;
          const shadowRamp = [foot, S[0]!, S[1]!];
          if (d > -1.2) c.set(px, py, foot);
          else if (face) {
            // Cliff face: dark, with horizontal strata, darkest at the foot.
            const strata = Math.sin((py + n * 6) * 0.9) * 0.1;
            c.set(px, py, rampPick(shadowRamp, 0.75 - (9 - face) * 0.06 + strata + n * 0.3, px, py, 0.25));
          } else {
            // Top of the rock mass: lumpy (cellular-ish noise), lit rim along north/west edges.
            const lump = Math.abs(noise(px, py, 6, seed + 3) - 0.5) < 0.06 ? -0.35 : 0;
            const rim = sdf(x, y - 2) >= 0 || sdf(x - 2, y) >= 0;
            c.set(px, py, rampPick(top, 0.42 + n * 0.6 + lump + (rim ? 0.35 : 0), px, py, 0.3));
          }
        }
    }
  return c;
}

/** Abyss: near-black void with faint stars, glowing purple rim where it meets the ground. */
function drawVoid(P: PaletteModule, sdfs: SdfFn[][], seed: number): Canvas {
  const R = P.WORLD_RAMPS.rift;
  const G = P.WORLD_RAMPS.riftGlow;
  const c = new Canvas(5 * T, 3 * T);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++) {
      const sdf = sdfs[row]![col]!;
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const d = sdf(x, y);
          const px = col * T + x;
          const py = row * T + y;
          if (d >= 1.5) continue;
          if (d >= 0) {
            c.set(px, py, G[0]!, 120);
            continue;
          }
          if (d > -1.3) c.set(px, py, G[1]!);
          else if (d > -2.6) c.set(px, py, G[0]!);
          else if (sdf(x, y - 3) >= 0) c.set(px, py, R[2]!); // the ledge face
          else {
            const star = hash2(px, py, seed) > 0.985;
            c.set(px, py, star ? (hash2(py, px, seed) > 0.5 ? G[1]! : R[4]!) : rampPick([R[0]!, R[1]!], 0.4 + (noise(px, py, 10, seed) - 0.5) * 0.6, px, py, 0.4));
          }
        }
    }
  return c;
}

// ---- graveyard props ----------------------------------------------------------------------

function tombstone(P: PaletteModule, rng: Rng, v: number): Canvas {
  const c = new Canvas(32, 32);
  const S = P.WORLD_RAMPS.stone;
  groundShadow(c, 16, 28, 9, 2.5, P.WORLD_RAMPS.shadow[0]);
  const seed = rng.int(0, 999);
  if (v === 0) {
    // rounded headstone
    for (let y = 10; y < 29; y++)
      for (let x = 10; x < 22; x++) {
        const top = y < 15 ? Math.hypot(x + 0.5 - 16, y + 0.5 - 15) > 6 : false;
        if (top) continue;
        let t = 0.55 + (noise(x, y, 3, seed) - 0.5) * 0.3;
        if (x < 12) t += 0.25;
        if (x > 19) t -= 0.3;
        c.set(x, y, rampPick(S.slice(1), t, x, y, 0.2));
      }
    c.line(13, 16, 18, 16, S[1]!);
    c.line(13, 18, 18, 18, S[1]!);
    c.line(14, 20, 17, 20, S[1]!);
  } else if (v === 1) {
    // stone cross
    slab(c, 14, 9, 4, 20, S.slice(1), seed);
    slab(c, 10, 13, 12, 4, S.slice(1), seed + 1);
  } else {
    // leaning slab with moss
    for (let y = 11; y < 29; y++) {
      const lean = Math.floor((29 - y) / 6);
      for (let x = 10 + lean; x < 21 + lean; x++) {
        let t = 0.5 + (noise(x, y, 3, seed) - 0.5) * 0.35;
        if (x === 10 + lean) t += 0.3;
        if (x === 20 + lean) t -= 0.3;
        if (y === 11) t += 0.2;
        c.set(x, y, rampPick(S.slice(1), t, x, y, 0.2));
      }
    }
    const L = P.WORLD_RAMPS.leaf;
    for (let k = 0; k < 14; k++) {
      const x = 11 + rng.int(0, 10);
      const y = rng.chance(0.5) ? 12 + rng.int(0, 2) : 26 + rng.int(0, 2);
      if (c.alpha(x, y) === 255) c.set(x, y, k % 2 ? L[2]! : L[3]!);
    }
  }
  outlineOpaque(c, S[0]!);
  return c;
}

function crypt(P: PaletteModule): Canvas {
  const W = 96;
  const H = 96;
  const c = new Canvas(W, H);
  const S = P.WORLD_RAMPS.stone;
  groundShadow(c, 48, 90, 42, 5, P.WORLD_RAMPS.shadow[0], 0.4);
  // body
  slab(c, 12, 40, 72, 50, S.slice(1), 3);
  // blocks
  for (let y = 44; y < 90; y += 6) for (let x = 12 + ((y / 6) % 2) * 6; x < 84; x += 12) c.line(x, y, x, y + 5, S[1]!);
  for (let y = 46; y < 90; y += 6) c.line(13, y, 82, y, S[1]!);
  // pediment roof
  for (let y = 18; y < 42; y++) {
    const half = ((y - 18) / 24) * 46 + 4;
    for (let x = Math.floor(48 - half); x < Math.ceil(48 + half); x++) {
      let t = 0.6 + (noise(x, y, 3, 9) - 0.5) * 0.3 - (x - 48) / 120;
      if (y >= 38) t -= 0.35;
      c.set(x, y, rampPick(S.slice(1), t, x, y, 0.2));
    }
  }
  c.line(4, 41, 92, 41, S[0]!);
  // pillars
  for (const px of [20, 70]) slab(c, px, 44, 7, 46, S.slice(2), 5, 0.05);
  // dark doorway with a faint hollow glow at the bottom
  for (let y = 56; y < 90; y++)
    for (let x = 38; x < 58; x++) {
      const arch = y < 62 && Math.hypot(x + 0.5 - 48, y + 0.5 - 62) > 10;
      if (arch) continue;
      c.set(x, y, y > 84 ? mix(P.WORLD_RAMPS.rift[1], P.WORLD_RAMPS.riftGlow[0], 0.25) : P.WORLD_RAMPS.rift[0]);
    }
  // skull emblem on the pediment
  c.ellipse(48, 30, 3, 3, P.WORLD_RAMPS.plaster[3]);
  c.set(47, 30, S[0]!);
  c.set(49, 30, S[0]!);
  outlineOpaque(c, S[0]!);
  return c;
}

function bones(P: PaletteModule, v: number): Canvas {
  const c = new Canvas(32, 32);
  const B = P.WORLD_RAMPS.plaster;
  const bone = (x0: number, y0: number, x1: number, y1: number) => {
    c.line(x0, y0, x1, y1, B[3]!);
    c.line(x0, y0 + 1, x1, y1 + 1, B[1]!);
    for (const [x, y] of [[x0, y0], [x1, y1]] as const) {
      c.set(x - 1, y, B[4]!);
      c.set(x + 1, y, B[3]!);
    }
  };
  if (v === 0) {
    // skull
    c.forEllipse(15, 18, 5, 4.5, (x, y, nx, ny) => c.set(x, y, rampPick(B.slice(1), sphereLight(nx, ny) + 0.1, x, y, 0.2)));
    c.rect(13, 21, 5, 2, B[2]!);
    c.set(13, 18, P.WORLD_RAMPS.shadow[0]);
    c.set(14, 18, P.WORLD_RAMPS.shadow[0]);
    c.set(17, 18, P.WORLD_RAMPS.shadow[0]);
    c.set(16, 18, P.WORLD_RAMPS.shadow[0]);
    bone(20, 24, 27, 21);
  } else {
    bone(6, 22, 14, 25);
    bone(12, 19, 22, 18);
    bone(18, 25, 26, 23);
  }
  outlineOpaque(c, B[0]!);
  return c;
}

// ---- mine props -----------------------------------------------------------------------------

function mineBeam(P: PaletteModule): Canvas {
  const c = new Canvas(64, 64);
  const Wd = P.WORLD_RAMPS.wood;
  slab(c, 6, 14, 6, 48, Wd.slice(1), 11);
  slab(c, 52, 14, 6, 48, Wd.slice(1), 12);
  slab(c, 2, 8, 60, 7, Wd.slice(1), 13, 0.1);
  // iron brackets
  const I = P.WORLD_RAMPS.iron;
  for (const x of [5, 51]) c.rect(x, 14, 8, 2, I[3]!);
  outlineOpaque(c, Wd[0]!);
  return c;
}

function crystal(P: PaletteModule, rng: Rng, v: number, R: Ramp): Canvas {
  const c = new Canvas(32, 32);
  groundShadow(c, 16, 27, 10, 2.5, P.WORLD_RAMPS.shadow[0]);
  const shards = v === 0 ? [[16, 27, 4, 18, 0]] : v === 1 ? [[13, 27, 3, 13, -0.25], [19, 27, 4, 17, 0.15]] : [[10, 27, 3, 10, -0.35], [16, 27, 4, 19, 0], [22, 27, 3, 12, 0.3]];
  for (const [bx, by, w, h, lean] of shards as number[][]) {
    for (let i = 0; i < h!; i++) {
      const t = i / h!;
      const half = Math.max(0.5, w! * (1 - t * t));
      const cx = bx! + lean! * i;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const u = (x - (cx - half)) / (2 * half);
        const tone = u < 0.4 ? 0.85 : u < 0.6 ? 0.6 : 0.3;
        c.set(x, by! - i, rampPick(R.slice(1), tone + t * 0.15, x, by! - i, 0.15));
      }
    }
    c.set(Math.round(bx! + lean! * (h! - 2)), by! - h! + 2, R[R.length - 1]!);
  }
  void rng;
  outlineOpaque(c, R[0]!);
  return c;
}

function minecart(P: PaletteModule): Canvas {
  const c = new Canvas(32, 32);
  const I = P.WORLD_RAMPS.iron;
  const Wd = P.WORLD_RAMPS.wood;
  groundShadow(c, 16, 27, 12, 2.5, P.WORLD_RAMPS.shadow[0]);
  slab(c, 5, 13, 22, 11, Wd.slice(1), 21);
  c.rect(5, 13, 22, 2, I[3]!);
  c.rect(5, 22, 22, 2, I[2]!);
  // ore heap
  c.forEllipse(16, 13, 9, 4, (x, y, nx, ny) => {
    if (ny > 0.2) return;
    const crystalBit = hash2(x, y, 5) > 0.85;
    c.set(x, y, crystalBit ? P.WORLD_RAMPS.crystal[4] : rampPick(P.WORLD_RAMPS.stone.slice(1, 4), sphereLight(nx, ny), x, y, 0.2));
  });
  for (const wx of [9, 23]) c.forEllipse(wx, 25, 2.6, 2.6, (x, y, nx, ny) => c.set(x, y, nx * nx + ny * ny < 0.3 ? I[4]! : I[1]!));
  outlineOpaque(c, I[0]!);
  return c;
}

// ---- citadel props --------------------------------------------------------------------------

function pillar(P: PaletteModule, broken: boolean): Canvas {
  const c = new Canvas(32, 64);
  const S = P.WORLD_RAMPS.stone;
  groundShadow(c, 16, 60, 11, 3, P.WORLD_RAMPS.shadow[0]);
  const top = broken ? 34 : 8;
  // base and capital
  slab(c, 7, 54, 18, 7, S.slice(1), 31);
  if (!broken) slab(c, 7, top, 18, 6, S.slice(1), 32, 0.1);
  // shaft with flutes
  for (let y = top + (broken ? 0 : 6); y < 54; y++)
    for (let x = 10; x < 22; x++) {
      if (broken && y < top + 4 && hash2(x, 3, 7) * 5 > y - top) continue; // jagged break
      const u = (x - 10) / 12;
      let t = 0.85 - u * 0.7 + (noise(x, y, 3, 33) - 0.5) * 0.2;
      if ((x - 10) % 4 === 3) t -= 0.18;
      c.set(x, y, rampPick(S.slice(1), t, x, y, 0.15));
    }
  outlineOpaque(c, S[0]!);
  return c;
}

function rubble(P: PaletteModule, rng: Rng, v: number): Canvas {
  const c = new Canvas(32, 32);
  const S = P.WORLD_RAMPS.stone;
  groundShadow(c, 16, 26, 12, 3, P.WORLD_RAMPS.shadow[0]);
  const n = 3 + v;
  for (let i = 0; i < n; i++) {
    const w = rng.int(5, 9);
    const h = rng.int(3, 6);
    slab(c, rng.int(4, 26 - w), rng.int(14, 26 - h), w, h, S.slice(1), rng.int(0, 99), rng.range(-0.1, 0.1));
  }
  outlineOpaque(c, S[0]!);
  return c;
}

function banner(P: PaletteModule): Canvas {
  const c = new Canvas(32, 64);
  const Cl = P.WORLD_RAMPS.cloth;
  const I = P.WORLD_RAMPS.iron;
  groundShadow(c, 16, 61, 6, 2, P.WORLD_RAMPS.shadow[0]);
  c.rect(15, 6, 2, 56, I[2]!);
  c.rect(15, 6, 1, 56, I[3]!);
  c.rect(8, 8, 16, 2, I[3]!);
  // torn cloth
  for (let y = 10; y < 44; y++)
    for (let x = 9; x < 23; x++) {
      const tear = y > 34 && hash2(x, 1, 3) * 10 < y - 34;
      if (tear) continue;
      const fold = Math.sin(x * 0.9) * 0.15;
      c.set(x, y, rampPick(Cl.slice(1), 0.55 + fold - (x - 9) / 40, x, y, 0.2));
    }
  // faded sun emblem
  const F = P.WORLD_RAMPS.flame;
  c.ellipse(16, 22, 3, 3, F[3]!);
  for (const [dx, dy] of [[0, -5], [0, 5], [-5, 0], [5, 0], [-4, -4], [4, -4], [-4, 4], [4, 4]] as const) c.set(16 + dx, 22 + dy, F[2]!);
  outlineOpaque(c, Cl[0]!);
  return c;
}

function brazier(P: PaletteModule): Canvas {
  const c = new Canvas(32, 32);
  const I = P.WORLD_RAMPS.iron;
  const F = P.WORLD_RAMPS.flame;
  groundShadow(c, 16, 28, 8, 2, P.WORLD_RAMPS.shadow[0]);
  // legs + bowl
  c.line(11, 27, 14, 20, I[2]!);
  c.line(21, 27, 18, 20, I[2]!);
  c.forEllipse(16, 18, 8, 3.5, (x, y, nx, ny) => c.set(x, y, ny < 0 ? I[1]! : rampPick(I.slice(1), sphereLight(nx, ny), x, y, 0.2)));
  // flames (static; the light flickers at runtime)
  for (let y = 4; y < 17; y++)
    for (let x = 9; x < 24; x++) {
      const dx = (x + 0.5 - 16) / 6.5;
      const t = (17 - y) / 13;
      const w = 1 - t * t;
      if (Math.abs(dx) > w + (noise(x, y, 3, 4) - 0.5) * 0.5) continue;
      c.set(x, y, rampPick(F.slice(1), 1 - t * 0.9 - Math.abs(dx) * 0.4, x, y, 0.2));
    }
  outlineOpaque(c, I[0]!);
  return c;
}

// ---- chest ----------------------------------------------------------------------------------

/**
 * Treasure chest, 2 frames: closed, then open (lid thrown back, gold glinting inside). Wood planks
 * with flame-gold bands (the flame ramp's warm end), iron corners, a lock plate.
 */
function chest(P: PaletteModule, open: boolean): Canvas {
  const c = new Canvas(32, 32);
  const W = P.WORLD_RAMPS.wood;
  const G = P.WORLD_RAMPS.gold.slice(1);
  const I = P.WORLD_RAMPS.iron;
  groundShadow(c, 16, 27, 11, 2.5, P.WORLD_RAMPS.shadow[0]);
  const x0 = 6;
  const x1 = 25; // inclusive
  const bodyTop = 17;
  const bodyBottom = 26;
  const band = (x: number) => x === 10 || x === 11 || x === 20 || x === 21;
  // Body: horizontal planks, lit from the top-left.
  for (let y = bodyTop; y <= bodyBottom; y++)
    for (let x = x0; x <= x1; x++) {
      const plank = (y - bodyTop) % 4 === 3;
      let t = 0.55 - (x - x0) / (x1 - x0) * 0.25 + (noise(x, y, 2, 11) - 0.5) * 0.25;
      if (plank) t -= 0.3;
      if (y === bodyBottom) t -= 0.25;
      c.set(x, y, band(x) ? rampPick(G, 0.6 - (x % 2) * 0.3 - (y === bodyBottom ? 0.3 : 0), x, y, 0.1) : rampPick(W.slice(1), t, x, y, 0.2));
    }
  // Iron corners.
  for (const cx of [x0, x1]) for (let y = bodyBottom - 2; y <= bodyBottom; y++) c.set(cx, y, I[3]!);
  if (!open) {
    // Rounded lid: a half-cylinder, brightest along its upper third.
    for (let y = 10; y < bodyTop; y++)
      for (let x = x0; x <= x1; x++) {
        const v = (y - 10) / (bodyTop - 10); // 0 top .. 1 seam
        const inset = y === 10 ? 2 : y === 11 ? 1 : 0;
        if (x < x0 + inset || x > x1 - inset) continue;
        let t = 0.95 - Math.abs(v - 0.3) * 1.1 - (x - x0) / (x1 - x0) * 0.2 + (noise(x, y, 2, 12) - 0.5) * 0.2;
        c.set(x, y, band(x) ? rampPick(G, t + 0.1, x, y, 0.1) : rampPick(W.slice(1), t, x, y, 0.2));
      }
    // Seam shadow and lock plate.
    for (let x = x0; x <= x1; x++) c.set(x, bodyTop, rampPick(W, 0.15, x, bodyTop, 0));
    c.rect(14, 15, 4, 5, G[1]!);
    c.rect(14, 15, 4, 1, G[3]!);
    c.rect(14, 15, 1, 5, G[2]!);
    c.set(15, 17, I[0]!);
    c.set(16, 17, I[0]!);
    c.set(15, 18, I[1]!);
  } else {
    // Lid thrown back: its inner face, slanted away (narrower at the top), dim but warmed from below.
    for (let y = 3; y <= 11; y++) {
      const inset = Math.round((11 - y) * 0.25) + (y === 3 ? 1 : 0);
      for (let x = x0 + inset; x <= x1 - inset; x++) {
        const glow = clamp((y - 6) / 6) * 0.3;
        const rim = y === 11 || y === 3;
        const t = rim ? 0.55 : 0.12 + (noise(x, y, 2, 13) - 0.5) * 0.15 + ((y - 3) % 3 === 2 ? -0.05 : 0);
        c.set(x, y, band(x) ? rampPick(G, (rim ? 0.6 : 0.25) + glow, x, y, 0.1) : mix(rampPick(W, t, x, y, 0.15), G[2]!, glow));
      }
    }
    // Lock plate hanging from the lid's rim.
    c.rect(14, 9, 4, 3, G[1]!);
    c.rect(14, 9, 4, 1, G[3]!);
    // Back edge of the box, then the dark cavity with a heap of gold catching the light.
    for (let x = x0; x <= x1; x++) c.set(x, 12, rampPick(W.slice(1), 0.85, x, 12, 0.1));
    for (let y = 13; y < bodyTop; y++) for (let x = x0; x <= x1; x++) c.set(x, y, x === x0 || x === x1 ? rampPick(W.slice(1), 0.6, x, y, 0) : W[0]!);
    for (let x = x0 + 1; x <= x1 - 1; x++) {
      const top = Math.round(bodyTop - 1 - 2.6 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI) - hash2(x, 3, 5) * 0.8);
      for (let y = top; y < bodyTop; y++) c.set(x, y, rampPick(G, 0.95 - (y - top) * 0.22 + (hash2(x, y, 9) - 0.5) * 0.3, x, y, 0.15));
    }
    for (const [sx, sy] of [[12, 14], [18, 13], [21, 15]] as const) c.set(sx, sy, G[3]!);
    c.set(16, 13, "#ffffff");
    // Front edge of the box, lit.
    for (let x = x0; x <= x1; x++) c.set(x, bodyTop, band(x) ? G[3]! : rampPick(W.slice(1), 0.9, x, bodyTop, 0.1));
  }
  outlineOpaque(c, W[0]!);
  return c;
}

// ---- rift props -----------------------------------------------------------------------------

function riftSpire(P: PaletteModule): Canvas {
  const c = new Canvas(64, 64);
  const R = P.WORLD_RAMPS.rift;
  const G = P.WORLD_RAMPS.riftGlow;
  groundShadow(c, 32, 59, 14, 3.5, P.WORLD_RAMPS.shadow[0], 0.45);
  const spikes = [[32, 60, 9, 54, 0.02], [24, 60, 5, 30, -0.18], [41, 60, 6, 36, 0.16]];
  for (const [bx, by, w, h, lean] of spikes) {
    for (let i = 0; i < h!; i++) {
      const t = i / h!;
      const half = Math.max(0.5, w! * (1 - t));
      const cx = bx! + lean! * i;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const u = (x - (cx - half)) / (2 * half);
        c.set(x, by! - i, rampPick(R.slice(1), (u < 0.45 ? 0.7 : 0.25) + t * 0.15, x, by! - i, 0.2));
      }
    }
  }
  // glowing veins
  let x = 31;
  for (let y = 56; y > 14; y--) {
    if (c.alpha(x, y) === 255) c.set(x, y, y % 9 === 0 ? G[2]! : G[1]!);
    x += Math.floor(hash2(y, 2, 9) * 3) - 1;
    x = clamp(x, 28, 35);
  }
  outlineOpaque(c, R[0]!);
  return c;
}

export function zones(rng: Rng, P: PaletteModule): GeneratedAsset[] {
  const out: GeneratedAsset[] = [];
  const strip = (cs: Canvas[]) => Canvas.strip(cs);
  out.push(asset("tiles/ash-ground.png", "tileset", strip([0, 1, 2, 3, 4, 5, 6, 7].map((v) => ashGround(P, v))), { w: T, h: T, frames: 8 }));
  out.push(asset("tiles/cave-floor.png", "tileset", strip([0, 1, 2, 3, 4, 5].map((v) => caveFloor(P, v))), { w: T, h: T, frames: 6 }));
  out.push(asset("tiles/flagstone.png", "tileset", strip([0, 1, 2, 3].map((v) => flagstone(P, v))), { w: T, h: T, frames: 4 }));
  out.push(asset("tiles/cave-wall.png", "tileset", drawCaveWall(P, terrainSdfs(4, 10, 3.5, 77), 78), { w: T, h: T, frames: 15 }, { ...LAYOUT }));
  out.push(asset("tiles/snow-ground.png", "tileset", strip([0, 1, 2, 3, 4, 5, 6, 7].map((v) => snowGround(P, v))), { w: T, h: T, frames: 8 }));
  out.push(asset("tiles/lake-ice.png", "tileset", strip([0, 1, 2, 3].map((v) => lakeIce(P, v))), { w: T, h: T, frames: 4 }));
  out.push(asset("tiles/ice-wall.png", "tileset", drawCaveWall(P, terrainSdfs(4, 12, 3, 131), 132, P.WORLD_RAMPS.ice, P.WORLD_RAMPS.snow[0], P.WORLD_RAMPS.snow.slice(2, 6)), { w: T, h: T, frames: 15 }, { ...LAYOUT }));
  out.push(asset("tiles/void.png", "tileset", drawVoid(P, terrainSdfs(6, 14, 3, 91), 92), { w: T, h: T, frames: 15 }, { ...LAYOUT }));

  out.push(asset("props/tombstone.png", "prop", strip([0, 1, 2].map((v) => tombstone(P, rng, v))), { w: 32, h: 32, frames: 3 }));
  out.push(asset("props/crypt.png", "prop", crypt(P), undefined, { anchorX: 0.5, anchorY: 1, footprintTiles: [3, 2], building: true }));
  out.push(asset("props/bones.png", "prop", strip([0, 1].map((v) => bones(P, v))), { w: 32, h: 32, frames: 2 }));
  out.push(asset("props/mine-beam.png", "prop", mineBeam(P), undefined, { anchorX: 0.5, anchorY: 1 }));
  out.push(asset("props/crystal.png", "prop", strip([0, 1, 2].map((v) => crystal(P, rng, v, P.WORLD_RAMPS.crystal))), { w: 32, h: 32, frames: 3 }));
  out.push(asset("props/minecart.png", "prop", minecart(P)));
  out.push(asset("props/pillar.png", "prop", strip([pillar(P, false), pillar(P, true)]), { w: 32, h: 64, frames: 2 }, { anchorX: 0.5, anchorY: 1 }));
  out.push(asset("props/rubble.png", "prop", strip([0, 1, 2].map((v) => rubble(P, rng, v))), { w: 32, h: 32, frames: 3 }));
  out.push(asset("props/banner.png", "prop", banner(P), undefined, { anchorX: 0.5, anchorY: 1 }));
  out.push(asset("props/brazier.png", "prop", brazier(P)));
  out.push(asset("props/chest.png", "prop", strip([chest(P, false), chest(P, true)]), { w: 32, h: 32, frames: 2 }));
  const riftR = [P.WORLD_RAMPS.rift[0], P.WORLD_RAMPS.rift[2], P.WORLD_RAMPS.rift[4], P.WORLD_RAMPS.riftGlow[0], P.WORLD_RAMPS.riftGlow[1], P.WORLD_RAMPS.riftGlow[2]];
  out.push(asset("props/rift-crystal.png", "prop", strip([0, 1, 2].map((v) => crystal(P, rng, v, riftR))), { w: 32, h: 32, frames: 3 }));
  out.push(asset("props/rift-spire.png", "prop", riftSpire(P), undefined, { anchorX: 0.5, anchorY: 0.95 }));
  return out;
}
