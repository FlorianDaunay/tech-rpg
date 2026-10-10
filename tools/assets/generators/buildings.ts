/**
 * Cinderhold buildings in 3/4 top-down view: village houses (2), forge, lantern shrine,
 * market stall, well. Sizes are multiples of 32 (tile grid); meta.footprint gives the
 * collision footprint in tiles from the bottom of the image.
 */
import type { Rng } from "../../../src/core/math/rng";
import { mix, type Color } from "../png";
import type { GeneratedAsset, PaletteModule } from "../types";
import { asset, Canvas, clamp, hash2, noise, rampPick, sphereLight } from "./lib";

type Ramp = readonly Color[];

function shade(c: Canvas, x: number, y: number, to: Color, t: number) {
  if (c.alpha(x, y) === 0) return;
  const [r, g, b] = c.get(x, y);
  c.set(x, y, mix([r, g, b], to, t), c.alpha(x, y));
}

/** Shingled roof seen from the front-above: rows of staggered tiles, light at the ridge. */
function shingleRoof(c: Canvas, x0: number, y0: number, w: number, h: number, R: Ramp, seed: number, rowH = 5, tileW = 6) {
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / rowH);
    const yy = y % rowH;
    const off = (row % 2) * (tileW / 2);
    for (let x = 0; x < w; x++) {
      const xx = (x + off) % tileW;
      const grad = 1 - y / h; // ridge (top) brighter
      const jitter = (hash2(Math.floor((x + off) / tileW), row, seed) - 0.5) * 0.18;
      let t = 0.25 + grad * 0.5 + jitter;
      if (yy === rowH - 1) t = 0.02; // shadow line under each row
      else if (yy === 0) t += 0.18;
      if (xx === 0 && yy < rowH - 1) t -= 0.18; // tile gap
      if (x === 0 || x === w - 1) t = 0;
      c.set(x0 + x, y0 + y, rampPick(R, t, x0 + x, y0 + y, 0.25));
    }
  }
  // ridge cap
  for (let x = 0; x < w; x++) {
    c.set(x0 + x, y0, R[R.length - 1]!);
    c.set(x0 + x, y0 + 1, R[R.length - 2]!);
    if (x % 4 === 0) c.set(x0 + x, y0 + 1, R[R.length - 3]!);
  }
}

/** Brick/stone wall with mortar lines and lit top-left bevel per block. */
function stoneWall(c: Canvas, x0: number, y0: number, w: number, h: number, S: Ramp, seed: number, bw = 8, bh = 5) {
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / bh);
    const yy = y % bh;
    const off = (row % 2) * Math.floor(bw / 2) + Math.floor(hash2(row, 0, seed) * 3);
    for (let x = 0; x < w; x++) {
      const xx = (x + off) % bw;
      const bid = Math.floor((x + off) / bw);
      const tone = (hash2(bid, row, seed) - 0.5) * 0.3;
      let t = 0.5 + tone + (noise(x0 + x, y0 + y, 2, seed) - 0.5) * 0.15;
      if (yy === bh - 1 || xx === bw - 1) t = 0;
      else if (yy === 0 || xx === 0) t += 0.3;
      else if (yy === bh - 2 || xx === bw - 2) t -= 0.12;
      c.set(x0 + x, y0 + y, rampPick(S, t, x0 + x, y0 + y, 0.2));
    }
  }
}

/** Plaster wall with timber framing. */
function timberWall(c: Canvas, x0: number, y0: number, w: number, h: number, Pl: Ramp, Wd: Ramp, posts: number[], seed: number, braces = false) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = noise(x0 + x, y0 + y, 3, seed) - 0.5;
      c.set(x0 + x, y0 + y, rampPick(Pl.slice(1), 0.62 + n * 0.25 - (y / h) * 0.15, x0 + x, y0 + y, 0.3));
    }
  const beam = (bx: number, by: number, bw: number, bh: number) => {
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const edgeL = x === 0 || y === 0;
        const edgeR = x === bw - 1 || y === bh - 1;
        c.set(bx + x, by + y, edgeL ? Wd[3]! : edgeR ? Wd[1]! : Wd[2]!);
      }
  };
  beam(x0, y0, w, 3);
  beam(x0, y0 + h - 3, w, 3);
  for (const px of posts) beam(x0 + px, y0, 3, h);
  // diagonal braces between the first posts
  if (braces && posts.length >= 2) {
    const a = x0 + posts[0]! + 3;
    const b = x0 + posts[1]!;
    for (let i = 0; i < b - a; i++) {
      const y = y0 + h - 4 - Math.round((i * (h - 7)) / (b - a));
      c.set(a + i, y, Wd[2]!);
      c.set(a + i, y + 1, Wd[1]!);
    }
  }
}

function glowWindow(c: Canvas, P: PaletteModule, x: number, y: number, w: number, h: number, shutters = true) {
  const Wd = P.WORLD_RAMPS.wood;
  const F = P.WORLD_RAMPS.flame;
  // frame
  c.rect(x - 1, y - 1, w + 2, h + 2, Wd[1]!);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      // warm light, brighter lower-centre (a hearth inside)
      const dx = (i + 0.5) / w - 0.5;
      const dy = (j + 0.5) / h - 0.7;
      const t = 1 - Math.hypot(dx * 1.4, dy) * 1.3;
      c.set(x + i, y + j, rampPick(F.slice(1, 5), t, x + i, y + j, 0.4));
    }
  // mullions
  const mx = x + Math.floor(w / 2);
  const my = y + Math.floor(h / 2);
  for (let j = 0; j < h; j++) c.set(mx, y + j, Wd[1]!);
  for (let i = 0; i < w; i++) c.set(x + i, my, Wd[1]!);
  // sill
  c.rect(x - 2, y + h + 1, w + 4, 2, Wd[3]!);
  for (let i = 0; i < w + 4; i++) c.set(x - 2 + i, y + h + 2, Wd[1]!);
  if (shutters) {
    for (const sx of [x - 4, x + w + 1]) {
      for (let j = -1; j < h + 1; j++) {
        c.set(sx, y + j, Wd[3]!);
        c.set(sx + 1, y + j, Wd[2]!);
        c.set(sx + 2, y + j, j % 3 === 0 ? Wd[1]! : Wd[2]!);
      }
    }
  }
}

function door(c: Canvas, P: PaletteModule, x: number, y: number, w: number, h: number) {
  const Wd = P.WORLD_RAMPS.wood;
  const S = P.WORLD_RAMPS.stone;
  // stone surround
  c.rect(x - 2, y - 2, w + 4, h + 2, S[2]!);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const plank = i % 4 === 3;
      const arch = j < 3 && (i < 2 - j || i > w - 3 + j);
      if (arch) {
        c.set(x + i, y + j, S[2]!);
        continue;
      }
      const t = 0.55 - i / w / 3 + (hash2(Math.floor(i / 4), 0, 5) - 0.5) * 0.15;
      c.set(x + i, y + j, plank ? Wd[1]! : rampPick(Wd.slice(1, 5), t, x + i, y + j, 0.2));
    }
  // iron bands + handle
  for (const by of [y + 4, y + h - 5]) for (let i = 0; i < w; i++) c.set(x + i, by, P.WORLD_RAMPS.metal[1]!);
  c.set(x + w - 3, y + Math.floor(h / 2), P.WORLD_RAMPS.flame[3]!);
  c.set(x + w - 3, y + Math.floor(h / 2) + 1, P.WORLD_RAMPS.metal[1]!);
  // step
  c.rect(x - 3, y + h, w + 6, 2, S[4]!);
  c.rect(x - 3, y + h + 2, w + 6, 1, S[1]!);
}

function chimney(c: Canvas, P: PaletteModule, x: number, y: number, w: number, h: number) {
  const S = P.WORLD_RAMPS.stone;
  stoneWall(c, x, y, w, h, S.slice(1), 77, 5, 4);
  c.rect(x - 1, y, w + 2, 2, S[4]!);
  c.rect(x, y + 2, w, 1, S[1]!);
  // warm glow inside the flue
  c.rect(x + 1, y - 1, w - 2, 1, P.WORLD_RAMPS.flame[1]!);
}

function finishBuilding(c: Canvas, P: PaletteModule, groundY: number, x0: number, x1: number) {
  // contact shadow on the ground
  for (let x = x0 + 2; x < x1 + 3; x++) for (let k = 0; k < 3; k++) if (c.alpha(x, groundY + k) === 0) c.blend(x, groundY + k, P.WORLD_RAMPS.shadow[0], 0.35 - k * 0.08);
  c.outline(P.WORLD_RAMPS.outline[0], { threshold: 255 });
}

function eavesShadow(c: Canvas, x0: number, y: number, w: number, P: PaletteModule, depth = 3) {
  for (let k = 0; k < depth; k++) for (let x = x0; x < x0 + w; x++) shade(c, x, y + k, P.WORLD_RAMPS.outline[0], 0.45 - k * 0.12);
}

function roofEdge(c: Canvas, x0: number, y: number, w: number, R: Ramp) {
  // fascia board under the roof
  for (let x = x0; x < x0 + w; x++) {
    c.set(x, y, R[0]!);
    c.set(x, y + 1, R[1]!);
  }
}

function house(P: PaletteModule, variant: number): Canvas {
  const W = P.WORLD_RAMPS;
  if (variant === 0) {
    const c = new Canvas(96, 96);
    // walls
    const wallTop = 52;
    timberWall(c, 8, wallTop, 80, 36, W.plaster, W.wood, [0, 25, 52, 77], 3);
    stoneWall(c, 8, 86, 80, 6, W.stone.slice(1), 9, 7, 3);
    eavesShadow(c, 8, wallTop, 80, P, 4);
    glowWindow(c, P, 17, 63, 10, 10);
    glowWindow(c, P, 68, 63, 10, 10);
    door(c, P, 42, 68, 12, 19);
    // roof
    chimney(c, P, 66, 4, 10, 18);
    shingleRoof(c, 3, 14, 90, 37, W.roofRed, 11);
    roofEdge(c, 3, 50, 90, W.roofRed);
    // flower box under the left window
    for (let i = 0; i < 12; i++) {
      c.set(16 + i, 76, W.wood[2]!);
      if (i % 2 === 0) c.set(16 + i, 75, i % 4 ? W.flowers[1] : W.flowers[0]);
      else c.set(16 + i, 75, W.leaf[3]!);
    }
    finishBuilding(c, P, 92, 8, 88);
    return c;
  }
  const c = new Canvas(128, 128);
  const wallTop = 70;
  stoneWall(c, 10, wallTop, 108, 52, W.stone.slice(1), 21, 9, 5);
  eavesShadow(c, 10, wallTop, 108, P, 5);
  // corner quoins
  for (const qx of [10, 112])
    for (let y = wallTop; y < wallTop + 52; y += 5) {
      c.rect(qx, y, 6, 4, W.stone[4]!);
      c.rect(qx, y + 4, 6, 1, W.stone[1]!);
    }
  glowWindow(c, P, 24, 84, 12, 12);
  glowWindow(c, P, 88, 84, 12, 12);
  door(c, P, 56, 96, 14, 23);
  // lantern by the door
  c.rect(74, 92, 3, 4, W.metal[1]!);
  c.rect(74, 96, 3, 3, W.flame[4]!);
  c.set(75, 97, "#ffffff");
  // slate roof with a dormer
  chimney(c, P, 22, 6, 12, 22);
  shingleRoof(c, 4, 16, 120, 53, W.roofSlate, 31, 6, 7);
  roofEdge(c, 4, 68, 120, W.roofSlate);
  // dormer
  const dx = 50;
  const dy = 26;
  stoneWall(c, dx + 4, dy + 12, 20, 16, W.plaster.slice(1), 5, 6, 4);
  glowWindow(c, P, dx + 9, dy + 16, 10, 8, false);
  for (let j = 0; j < 14; j++) {
    const half = Math.round((j / 13) * 16);
    for (let i = -half; i <= half; i++) {
      const x = dx + 14 + i;
      const y = dy + j;
      const lit = i < 0;
      const edge = Math.abs(i) >= half - 1;
      c.set(x, y, edge ? W.roofSlate[0]! : rampPick(W.roofSlate.slice(1), lit ? 0.75 : 0.35, x, y, 0.2));
    }
  }
  finishBuilding(c, P, 122, 10, 118);
  return c;
}

function forge(P: PaletteModule): Canvas {
  const W = P.WORLD_RAMPS;
  const c = new Canvas(128, 96);
  // stone furnace tower on the right
  stoneWall(c, 86, 6, 34, 82, W.stone.slice(0, 5), 41, 7, 5);
  c.rect(84, 4, 38, 3, W.stone[4]!);
  c.rect(84, 7, 38, 1, W.stone[1]!);
  // glowing furnace mouth
  for (let j = 0; j < 18; j++)
    for (let i = 0; i < 18; i++) {
      const x = 94 + i;
      const y = 62 + j;
      const arch = j < 6 && Math.hypot(i - 8.5, j - 6) > 9;
      if (arch) continue;
      const t = 1 - Math.hypot((i - 8.5) / 10, (j - 14) / 9);
      c.set(x, y, rampPick(W.flame, t + 0.1, x, y, 0.4));
    }
  for (let i = 0; i < 18; i++) c.set(94 + i, 80, W.stone[1]!);
  // flue glow at the top
  c.rect(90, 2, 26, 2, W.flame[2]!);
  c.rect(94, 1, 18, 1, W.flame[3]!);
  // timber shed with an open front on the left
  timberWall(c, 6, 46, 80, 42, W.plaster, W.wood, [0, 77], 13);
  // open front: dark interior lit by the forge
  for (let j = 0; j < 34; j++)
    for (let i = 0; i < 66; i++) {
      const x = 13 + i;
      const y = 52 + j;
      const glow = clamp(1 - Math.hypot((i - 66) / 70, (j - 30) / 40));
      c.set(x, y, rampPick([W.outline[0], W.wood[0], W.wood[1], W.flame[0], W.flame[1]], glow * 0.95, x, y, 0.45));
    }
  // posts in front of the opening
  for (const px of [12, 44, 77]) {
    c.rect(px, 50, 4, 38, W.wood[2]!);
    c.rect(px, 50, 1, 38, W.wood[4]!);
    c.rect(px + 3, 50, 1, 38, W.wood[1]!);
  }
  // tool rack silhouettes inside
  for (const [tx, len] of [
    [22, 10],
    [27, 12],
    [32, 9],
  ] as const) {
    c.rect(tx, 56, 1, len, W.metal[2]!);
    c.rect(tx - 1, 56 + len, 3, 2, W.metal[3]!);
  }
  c.rect(19, 55, 18, 1, W.wood[3]!);
  // roof
  shingleRoof(c, 2, 18, 86, 28, W.roofRed, 51);
  roofEdge(c, 2, 45, 86, W.roofRed);
  eavesShadow(c, 6, 47, 80, P, 3);
  // anvil in front
  const M = W.metal;
  c.rect(52, 74, 18, 4, M[3]!);
  c.rect(52, 74, 18, 1, M[5]!);
  c.rect(48, 75, 4, 2, M[3]!);
  c.rect(58, 78, 6, 4, M[2]!);
  c.rect(55, 82, 12, 3, M[1]!);
  c.rect(69, 75, 1, 3, M[1]!);
  // glowing ingot on the anvil
  c.rect(58, 73, 5, 1, W.flame[3]!);
  c.set(60, 73, W.flame[4]!);
  // water barrel
  for (let j = 0; j < 11; j++)
    for (let i = 0; i < 10; i++) {
      const u = (i + 0.5) / 10;
      const t = 0.85 - u * 0.7;
      c.set(20 + i, 77 + j, j === 2 || j === 8 ? M[1]! : rampPick(W.wood.slice(1, 5), t, 20 + i, 77 + j, 0.2));
    }
  c.rect(21, 76, 8, 2, W.water[3]!);
  c.set(22, 76, W.water[5]!);
  finishBuilding(c, P, 88, 6, 120);
  return c;
}

function lanternShrine(P: PaletteModule): Canvas {
  const W = P.WORLD_RAMPS;
  const c = new Canvas(96, 128);
  const S = W.stone;
  // dais: two stacked ellipse steps
  const step = (cy: number, rx: number, ry: number, h: number) => {
    for (let k = h; k >= 0; k--)
      c.forEllipse(48, cy + k, rx, ry, (x, y, nx, ny) => {
        if (k > 0) {
          // side wall
          const t = 0.55 - nx * 0.35;
          c.set(x, y, rampPick(S.slice(1, 4), t, x, y, 0.3));
        } else {
          const t = 0.62 + sphereLight(nx * 0.6, ny * 0.6) * 0.35;
          const rim = nx * nx + ny * ny > 0.85;
          c.set(x, y, rim ? S[5]! : rampPick(S.slice(2), t, x, y, 0.25));
        }
      });
  };
  step(110, 44, 12, 6);
  step(102, 32, 9, 5);
  // rune ring on the top step
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const x = Math.round(48 + Math.cos(ang) * 24);
    const y = Math.round(102 + Math.sin(ang) * 6.5);
    c.set(x, y, a % 2 ? W.flame[2]! : S[1]!);
  }
  // pillar
  for (let y = 40; y < 102; y++)
    for (let x = 41; x < 55; x++) {
      const u = (x + 0.5 - 41) / 14;
      const fluting = (x - 41) % 4 === 3;
      let t = 0.9 - u * 0.75;
      if (fluting) t -= 0.18;
      c.set(x, y, rampPick(S.slice(1), t, x, y, 0.2));
    }
  // capital and base mouldings
  for (const [y, w, h] of [
    [36, 22, 4],
    [40, 18, 2],
    [96, 18, 2],
    [98, 22, 4],
  ] as const) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const x = 48 - w / 2 + i;
        c.set(x, y + j, j === 0 ? S[5]! : j === h - 1 ? S[1]! : rampPick(S.slice(2), 0.8 - i / w / 1.5, x, y + j, 0.2));
      }
  }
  // lantern cage (iron) with the last flame
  const M = W.metal;
  const F = W.flame;
  const lx = 36;
  const ly = 10;
  const lw = 24;
  const lh = 26;
  for (let j = 0; j < lh; j++)
    for (let i = 0; i < lw; i++) {
      const x = lx + i;
      const y = ly + j;
      const t = 1 - Math.hypot((i + 0.5 - lw / 2) / (lw * 0.55), (j + 0.5 - lh * 0.62) / (lh * 0.6));
      c.set(x, y, rampPick(F, t * 1.25, x, y, 0.4));
    }
  // flame tongue
  for (let j = 0; j < 12; j++) {
    const half = Math.max(0, Math.round((j / 11) * 4 - (j > 9 ? 2 : 0)));
    for (let i = -half; i <= half; i++) c.set(48 + i, ly + 8 + j, j > 3 && Math.abs(i) < half ? "#ffffff" : F[4]!);
  }
  // cage bars
  for (const bx of [lx, lx + 8, lx + 15, lx + lw - 1]) for (let j = 0; j < lh; j++) c.set(bx, ly + j, bx === lx ? M[3]! : M[1]!);
  for (const by of [ly, ly + lh - 1]) for (let i = -2; i < lw + 2; i++) c.set(lx + i, by, M[2]!);
  // lantern roof (pointed cap)
  for (let j = 0; j < 9; j++) {
    const half = 3 + j * 1.6;
    for (let i = -Math.round(half); i <= Math.round(half); i++) {
      const x = 48 + i;
      const y = ly - 9 + j;
      c.set(x, y, i < 0 ? M[3]! : M[1]!);
      if (j === 8) c.set(x, y, M[0]!);
    }
  }
  c.set(48, ly - 10, F[3]!);
  c.set(48, ly - 11, M[4]!);
  // base of the lantern
  c.rect(lx - 2, ly + lh, lw + 4, 3, M[2]!);
  c.rect(lx - 2, ly + lh, lw + 4, 1, M[4]!);
  // hanging ember banners
  for (const [bx, dir] of [
    [31, -1],
    [61, 1],
  ] as const) {
    for (let j = 0; j < 22; j++)
      for (let i = 0; i < 6; i++) {
        const x = bx + i - 3 + dir * Math.round(Math.sin(j / 5));
        const y = 44 + j;
        if (j > 18 && (i === 2 || i === 3) && j > 19) continue;
        c.set(x, y, i === 0 ? W.cloth[3]! : i === 5 ? W.cloth[1]! : W.cloth[2]!);
      }
    c.rect(bx - 4, 43, 8, 1, M[2]!);
    c.set(bx, 52, W.flame[3]!);
    c.set(bx - 1, 53, W.flame[2]!);
    c.set(bx + 1, 53, W.flame[2]!);
    c.set(bx, 54, W.flame[2]!);
  }
  // outline (except emissive flame, which stays soft-edged inside the cage anyway)
  c.outline(W.outline[0], { threshold: 255 });
  return c;
}

function marketStall(P: PaletteModule, rng: Rng): Canvas {
  const W = P.WORLD_RAMPS;
  const c = new Canvas(96, 64);
  // posts
  for (const px of [8, 85]) {
    c.rect(px, 14, 3, 46, W.wood[2]!);
    c.rect(px, 14, 1, 46, W.wood[4]!);
  }
  // counter
  for (let j = 0; j < 18; j++)
    for (let i = 0; i < 84; i++) {
      const x = 6 + i;
      const y = 42 + j;
      const plank = i % 7 === 6;
      const t = j < 3 ? 0.9 : 0.45 - (j / 18) * 0.25 + (hash2(Math.floor(i / 7), 3, 7) - 0.5) * 0.2;
      c.set(x, y, plank && j >= 3 ? W.wood[1]! : rampPick(W.wood.slice(1), t, x, y, 0.2));
    }
  c.rect(6, 45, 84, 1, W.wood[1]!);
  // goods: apples crate, cloth bolts, jars
  const crate = (x: number, y: number, fill: readonly Color[]) => {
    c.rect(x, y, 16, 8, W.wood[2]!);
    c.rect(x, y, 16, 1, W.wood[4]!);
    c.rect(x, y + 7, 16, 1, W.wood[1]!);
    for (let k = 0; k < 9; k++) {
      const fx = x + 2 + (k % 5) * 3 - (k >= 5 ? -1 : 0);
      const fy = y - 2 + (k >= 5 ? -2 : 0);
      c.set(fx, fy, fill[1]!);
      c.set(fx + 1, fy, fill[0]!);
      c.set(fx, fy + 1, fill[0]!);
      c.set(fx + 1, fy + 1, fill[0]!);
      c.set(fx, fy - 0, fill[2]!);
    }
  };
  crate(12, 34, ["#8a2a22", "#c8463a", "#f08a6a"]);
  crate(66, 34, ["#8a6a1a", "#d6a63a", "#f6d880"]);
  // cloth bolts
  const cloths = [W.clothBlue, W.cloth, W.roofSlate] as const;
  cloths.forEach((cr, k) => {
    const x = 34 + k * 9;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 8; i++) c.set(x + i, 35 + j, i < 2 ? cr[3]! : i > 5 ? cr[1]! : cr[2]!);
    c.rect(x, 35, 8, 1, cr[3]!);
  });
  void rng;
  // awning with stripes and scalloped edge
  const stripeA = ["#7a2a22", "#a8402e", "#c85a3e"];
  const stripeB = ["#9b8f78", "#d8cdb2", "#f0e8d2"];
  for (let j = 0; j < 22; j++)
    for (let i = 0; i < 92; i++) {
      const x = 2 + i;
      const y = 6 + j;
      const persp = Math.round(((21 - j) / 21) * 4); // top recedes
      if (i < persp || i > 91 - persp) continue;
      const stripe = Math.floor((i - 46) / 8 + 100) % 2 === 0 ? stripeA : stripeB;
      const t = j < 2 ? 2 : j > 17 ? 0 : 1;
      c.set(x, y, stripe[t]!);
    }
  for (let i = 0; i < 92; i++) {
    const scallop = Math.round(Math.sin(((i % 8) / 8) * Math.PI) * 3);
    const stripe = Math.floor((i - 46) / 8 + 100) % 2 === 0 ? stripeA : stripeB;
    for (let k = 0; k < scallop; k++) c.set(2 + i, 28 + k, stripe[k === scallop - 1 ? 0 : 1]!);
  }
  // shadow under the awning
  for (let i = 10; i < 85; i++) for (let k = 0; k < 4; k++) shade(c, i, 31 + k, W.outline[0], 0.4 - k * 0.1);
  // hanging sign
  c.rect(42, 31, 12, 7, W.wood[3]!);
  c.rect(42, 37, 12, 1, W.wood[1]!);
  c.set(46, 33, W.flame[3]!);
  c.set(47, 34, W.flame[3]!);
  c.set(48, 33, W.flame[3]!);
  c.set(49, 34, W.flame[3]!);
  c.outline(W.outline[0], { threshold: 255 });
  for (let x = 8; x < 92; x++) for (let k = 0; k < 2; k++) if (c.alpha(x, 61 + k) === 0) c.blend(x, 61 + k, W.shadow[0], 0.3);
  return c;
}

function well(P: PaletteModule): Canvas {
  const W = P.WORLD_RAMPS;
  const c = new Canvas(64, 64);
  const S = W.stone;
  // cylinder wall
  for (let y = 40; y < 56; y++)
    c.forEllipse(32, y, 20, 7, (x, yy, nx) => {
      const row = Math.floor((y - 40) / 4);
      const brick = (x + (row % 2) * 3) % 6 === 0 || (y - 40) % 4 === 3;
      const t = 0.7 - nx * 0.4;
      c.set(x, yy, brick ? S[1]! : rampPick(S.slice(1, 5), t, x, yy, 0.3));
    });
  // rim (top ellipse) + dark water
  c.forEllipse(32, 40, 20, 7, (x, y, nx, ny) => {
    const r = nx * nx + ny * ny;
    if (r > 0.5) c.set(x, y, ny < 0 ? S[5]! : S[4]!);
    else c.set(x, y, r > 0.38 ? S[1]! : ny < -0.1 ? W.water[0]! : W.water[1]!);
  });
  c.set(28, 40, W.water[4]!);
  c.set(29, 40, W.water[3]!);
  // posts + crossbeam + small roof
  for (const px of [12, 49]) {
    c.rect(px, 14, 3, 30, W.wood[2]!);
    c.rect(px, 14, 1, 30, W.wood[4]!);
    c.rect(px + 2, 14, 1, 30, W.wood[1]!);
  }
  c.rect(12, 20, 40, 3, W.wood[3]!);
  c.rect(12, 22, 40, 1, W.wood[1]!);
  // rope + bucket
  c.rect(32, 23, 1, 9, W.plaster[2]!);
  c.rect(29, 32, 7, 6, W.wood[2]!);
  c.rect(29, 32, 7, 1, W.metal[2]!);
  c.rect(29, 36, 7, 1, W.metal[1]!);
  c.rect(29, 32, 1, 6, W.wood[3]!);
  // gable roof
  for (let j = 0; j < 14; j++) {
    const half = 6 + j * 1.4;
    for (let i = -Math.round(half); i <= Math.round(half); i++) {
      const x = 32 + i;
      const y = 3 + j;
      const edge = Math.abs(i) >= Math.round(half) - 1 || j === 13;
      const t = i < 0 ? 0.8 : 0.35;
      c.set(x, y, edge ? W.roofRed[1]! : rampPick(W.roofRed.slice(1), t - (j % 3 === 2 ? 0.25 : 0), x, y, 0.2));
    }
  }
  c.outline(W.outline[0], { threshold: 255 });
  for (let x = 12; x < 54; x++) for (let k = 0; k < 3; k++) if (c.alpha(x, 56 + k) === 0) c.blend(x, 56 + k, W.shadow[0], 0.3 - k * 0.08);
  return c;
}

export function buildings(rng: Rng, P: PaletteModule): GeneratedAsset[] {
  const b = (name: string, cv: Canvas, footprint: [number, number]) =>
    asset(`props/${name}.png`, "prop", cv, undefined, { anchorX: 0.5, anchorY: 1, footprintTiles: footprint, building: true });
  return [
    b("house-1", house(P, 0), [3, 2]),
    b("house-2", house(P, 1), [4, 2]),
    b("forge", forge(P), [4, 2]),
    b("lantern-shrine", lanternShrine(P), [3, 1]),
    b("market-stall", marketStall(P, rng), [3, 1]),
    b("well", well(P), [2, 1]),
  ];
}
