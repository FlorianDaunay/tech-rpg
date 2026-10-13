/**
 * Nature props: trees (oak, pine, dead) 64×64, bushes, rocks, mushrooms 32×32.
 * Style: sphere-lit clumps (top-left light), 4-5 shades per material, dark non-black outline.
 */
import type { Rng } from "../../../src/core/math/rng";
import { mix, type Color } from "../png";
import type { GeneratedAsset, PaletteModule } from "../types";
import { asset, Canvas, clamp, groundShadow, hash2, noise, rampPick, sphereLight } from "./lib";

type Ramp = readonly Color[];

interface Clump {
  x: number;
  y: number;
  r: number;
  ry?: number;
}

/**
 * Paint a canopy made of clumps. Each clump is lit as a sphere, blended with the light of the
 * whole canopy (so it reads as one mass), and gets a shadowed lower rim to separate it from the
 * clumps behind. Clumps are painted back (top) to front (bottom).
 */
function canopy(c: Canvas, clumps: Clump[], ramp: Ramp, seed: number, box: { cx: number; cy: number; rx: number; ry: number }) {
  const sorted = [...clumps].sort((a, b) => a.y + a.r * 0.3 - (b.y + b.r * 0.3));
  for (const k of sorted) {
    const ry = k.ry ?? k.r * 0.9;
    c.forEllipse(k.x, k.y, k.r, ry, (x, y, nx, ny) => {
      const gx = clamp((x + 0.5 - box.cx) / box.rx, -1, 1);
      const gy = clamp((y + 0.5 - box.cy) / box.ry, -1, 1);
      const g = sphereLight(gx * 0.85, gy * 0.85);
      const l = sphereLight(nx * 0.9, ny * 0.9);
      const leaf = noise(x, y, 2, seed) - 0.5;
      let t = 0.08 + g * 0.62 + l * 0.45 + leaf * 0.2;
      const rim = nx * nx + ny * ny;
      if (rim > 0.62 && ny > 0.15 && nx > -0.6) t -= 0.42; // shadow under each clump
      if (gy > 0.55) t -= 0.12;
      c.set(x, y, rampPick(ramp, t - 0.12, x, y, 0.3));
    });
  }
}

/** Little leaf highlights scattered on the lit side. */
function leafSparkle(c: Canvas, ramp: Ramp, rng: Rng, n: number, box: { cx: number; cy: number; rx: number; ry: number }) {
  for (let i = 0; i < n; i++) {
    const x = Math.round(box.cx + rng.range(-box.rx, box.rx * 0.4));
    const y = Math.round(box.cy + rng.range(-box.ry, box.ry * 0.3));
    if (c.alpha(x, y) === 0 || c.alpha(x + 1, y + 1) === 0 || c.alpha(x - 1, y - 1) === 0) continue;
    c.set(x, y, ramp[ramp.length - 1]!);
    c.set(x + 1, y, ramp[ramp.length - 2]!);
    c.set(x, y + 1, ramp[ramp.length - 3]!);
  }
}

/** Shade a flat-coloured shape as a cylinder: lit pixels next to the top/left edge, dark at right/bottom. */
function edgeShade(c: Canvas, ramp: Ramp, match: (x: number, y: number) => boolean) {
  const pts: [number, number, Color][] = [];
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      if (!match(x, y)) continue;
      const out = (dx: number, dy: number) => !match(x + dx, y + dy);
      if (out(-1, 0) || out(0, -1)) pts.push([x, y, ramp[3]!]);
      else if (out(1, 0) || out(0, 1)) pts.push([x, y, ramp[1]!]);
      else if (out(2, 0)) pts.push([x, y, ramp[1]!]);
    }
  for (const [x, y, col] of pts) c.set(x, y, col);
}

function trunk(c: Canvas, B: Ramp, cx: number, top: number, bottom: number, w: number, seed: number) {
  for (let y = top; y <= bottom; y++) {
    const flare = Math.max(0, y - (bottom - 4)) * 0.9;
    const half = w / 2 + flare;
    for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); x++) {
      const u = (x + 0.5 - (cx - half)) / (2 * half); // 0 left … 1 right
      const grain = noise(x * 2, y * 0.4, 2, seed) - 0.5;
      const t = 0.85 - u * 0.75 + grain * 0.35;
      c.set(x, y, rampPick(B.slice(1), t, x, y, 0.2));
    }
  }
  // roots
  for (const [dx, len] of [
    [-1, 3],
    [1, 3],
  ] as const) {
    for (let i = 0; i < len; i++) {
      const x = Math.round(cx + dx * (w / 2 + 3 + i));
      c.set(x, bottom - (len - 1 - i) * 0 + 0, B[dx < 0 ? 3 : 2]!);
      c.set(x, bottom - 1, B[dx < 0 ? 2 : 1]!);
    }
  }
}

function oak(P: PaletteModule, rng: Rng, variant: number): Canvas {
  const c = new Canvas(64, 64);
  const L = P.WORLD_RAMPS.leaf;
  const B = P.WORLD_RAMPS.bark;
  groundShadow(c, 32, 58, 17, 4.5, P.WORLD_RAMPS.shadow[0]);
  trunk(c, B, 32, 34, 58, 8, 7 + variant);
  // shadow of the canopy on the trunk
  for (let x = 26; x < 39; x++) for (let y = 34; y < 41; y++) if (c.alpha(x, y)) c.set(x, y, mix(c.get(x, y) as unknown as Color, B[0]!, 0.55));
  const box = { cx: 32, cy: 24, rx: 26, ry: 20 };
  const clumps: Clump[] = (variant === 1
    ? [
        { x: 30, y: 11, r: 11 },
        { x: 21, y: 19, r: 11 },
        { x: 42, y: 17, r: 12 },
        { x: 16, y: 30, r: 9 },
        { x: 47, y: 29, r: 10 },
        { x: 27, y: 32, r: 11, ry: 8 },
        { x: 41, y: 33, r: 9, ry: 7 },
        { x: 33, y: 23, r: 13 },
      ]
    : [
    { x: 32, y: 13, r: 13 },
    { x: 19, y: 20, r: 11 },
    { x: 45, y: 19, r: 11 },
    { x: 14, y: 31, r: 9 },
    { x: 50, y: 31, r: 9 },
    { x: 24, y: 33, r: 11, ry: 8 },
    { x: 40, y: 33, r: 11, ry: 8 },
    { x: 32, y: 24, r: 14 },
  ]).map((k) => ({ ...k, x: k.x + rng.int(-1, 1), y: k.y + rng.int(-1, 1) }));
  canopy(c, clumps, L.slice(1), 40 + variant, box);
  leafSparkle(c, L, rng, 9, box);
  c.outline(L[0]!, { threshold: 255 });
  return c;
}

function pine(P: PaletteModule, rng: Rng, snowy = false): Canvas {
  const c = new Canvas(64, 64);
  const Pn = P.WORLD_RAMPS.pine;
  const B = P.WORLD_RAMPS.bark;
  groundShadow(c, 32, 59, 14, 4, P.WORLD_RAMPS.shadow[0]);
  trunk(c, B, 32, 50, 59, 6, 3);
  const tiers = [
    { top: 2, bottom: 19, half: 10 },
    { top: 11, bottom: 31, half: 15 },
    { top: 21, bottom: 43, half: 20 },
    { top: 32, bottom: 54, half: 24 },
  ];
  for (let ti = tiers.length - 1; ti >= 0; ti--) {
    const tr = tiers[ti]!;
    const bottomEdge: [number, number][] = [];
    for (let y = tr.top; y <= tr.bottom; y++) {
      const p = (y - tr.top) / (tr.bottom - tr.top);
      const half = 2 + (tr.half - 2) * Math.pow(p, 0.85);
      for (let x = Math.floor(32 - half); x <= Math.ceil(32 + half); x++) {
        const u = (x + 0.5 - 32) / half; // -1 … 1
        // jagged needle bottom edge
        const zig = (Math.abs(((x + ti * 3) % 6) - 3) / 3) * 3;
        if (y > tr.bottom - zig) continue;
        if (Math.abs(u) > 1) continue;
        const needles = (hash2(x, y >> 1, 77 + ti) - 0.5) * 0.25;
        let t = 0.62 - u * 0.42 - p * 0.28 + needles;
        if (y > tr.bottom - zig - 2) t -= 0.2; // underside of the tier
        c.set(x, y, rampPick(Pn.slice(1), t, x, y, 0.25));
        if (y + 1 > tr.bottom - zig) bottomEdge.push([x, y + 1]);
      }
    }
    // cast shadow of this tier on the tier below
    for (const [x, y] of bottomEdge) {
      if (c.alpha(x, y) === 255) c.set(x, y, Pn[1]!);
      if (c.alpha(x, y + 1) === 255) c.set(x, y + 1, Pn[2]!);
    }
  }
  // snow-less highlights: needle tips on the lit side
  for (let i = 0; i < 16; i++) {
    const tr = tiers[i % 4]!;
    const y = rng.int(tr.top + 4, tr.bottom - 5);
    const x = 32 - rng.int(1, Math.max(2, Math.floor(tr.half * 0.6)));
    if (c.alpha(x, y) && c.alpha(x - 1, y)) {
      c.set(x, y, Pn[4]!);
      c.set(x - 1, y + 1, Pn[3]!);
    }
  }
  if (snowy) snowCaps(c, P, rng);
  c.outline(Pn[0]!, { threshold: 255 });
  return c;
}

/** Snow settled on every upward-facing edge (and on each tier's shoulders), plus a few flecks. */
function snowCaps(c: Canvas, P: PaletteModule, rng: Rng): void {
  const S = P.WORLD_RAMPS.snow;
  const tops: [number, number][] = [];
  for (let y = 1; y < c.height - 8; y++)
    for (let x = 0; x < c.width; x++) if (c.alpha(x, y) === 255 && c.alpha(x, y - 1) === 0) tops.push([x, y]);
  for (const [x, y] of tops) {
    c.set(x, y, S[5]!);
    if (c.alpha(x, y + 1) === 255) c.set(x, y + 1, x < c.width / 2 ? S[4]! : S[3]!);
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.int(12, c.width - 12);
    const y = rng.int(4, c.height - 16);
    if (c.alpha(x, y) === 255 && c.alpha(x + 1, y) === 255) {
      c.set(x, y, S[5]!);
      c.set(x + 1, y, S[4]!);
    }
  }
}

function deadTree(P: PaletteModule, rng: Rng): Canvas {
  const c = new Canvas(64, 64);
  const D = P.WORLD_RAMPS.deadwood;
  groundShadow(c, 32, 59, 13, 3.5, P.WORLD_RAMPS.shadow[0]);
  const base = D[2]!;
  const paint = (x: number, y: number, r: number) => c.ellipse(x, y, r, r, base);
  const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    const steps = Math.ceil(len);
    let px = x;
    let py = y;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      ang += (rng.next() - 0.5) * 0.18;
      px += Math.cos(ang);
      py += Math.sin(ang);
      paint(px, py, Math.max(0.5, w * (1 - t * 0.6)));
    }
    if (depth <= 0) return;
    const forks = depth > 2 ? 2 : rng.int(1, 2);
    for (let f = 0; f < forks; f++) {
      const spread = (f === 0 ? -1 : 1) * rng.range(0.35, 0.7);
      branch(px, py, ang + spread, len * rng.range(0.55, 0.75), Math.max(0.6, w * 0.6), depth - 1);
    }
  };
  // trunk
  branch(32, 60, -Math.PI / 2, 22, 3.6, 0);
  branch(32, 40, -Math.PI / 2 - 0.5, 16, 2.2, 3);
  branch(32, 40, -Math.PI / 2 + 0.45, 18, 2.2, 3);
  branch(32, 46, -Math.PI / 2 + 1.1, 9, 1.4, 1);
  // roots
  for (const dx of [-1, 1]) for (let i = 0; i < 5; i++) c.set(32 + dx * (4 + i), 59 - Math.floor(i / 3), base);
  const isWood = (x: number, y: number) => c.alpha(x, y) > 0 && c.get(x, y)[0] !== 20;
  // keep shadow pixels out of the shading: shadow is semi-transparent, wood is opaque
  edgeShade(c, D, (x, y) => c.alpha(x, y) === 255);
  // bark cracks
  for (let y = 36; y < 58; y += 3) {
    const x = 31 + (y % 2);
    if (c.alpha(x, y) === 255) c.set(x, y, D[1]!);
  }
  // knot hole
  c.set(33, 47, D[0]!);
  c.set(34, 47, D[0]!);
  c.set(33, 48, D[1]!);
  void isWood;
  // outline only around opaque wood (don't outline the soft shadow)
  const pts: [number, number][] = [];
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      if (c.alpha(x, y) === 255) continue;
      const n = [c.alpha(x - 1, y), c.alpha(x + 1, y), c.alpha(x, y - 1), c.alpha(x, y + 1)].some((a) => a === 255);
      if (n) pts.push([x, y]);
    }
  for (const [x, y] of pts) c.set(x, y, D[0]!);
  return c;
}

function bush(P: PaletteModule, rng: Rng, variant: number): Canvas {
  const c = new Canvas(32, 32);
  const L = P.WORLD_RAMPS.leaf;
  groundShadow(c, 16, 27, 13, 3.5, P.WORLD_RAMPS.shadow[0]);
  const box = { cx: 16, cy: 19, rx: 13, ry: 10 };
  const clumps: Clump[] =
    variant === 2
      ? [
          { x: 11, y: 20, r: 7 },
          { x: 21, y: 20, r: 7 },
          { x: 16, y: 16, r: 7 },
          { x: 16, y: 22, r: 7, ry: 5 },
        ]
      : [
          { x: 10, y: 19, r: 7 },
          { x: 22, y: 19, r: 7 },
          { x: 16, y: 14, r: 8 },
          { x: 16, y: 21, r: 9, ry: 6 },
        ];
  canopy(c, clumps, L.slice(1), 90 + variant, box);
  leafSparkle(c, L, rng, 4, box);
  if (variant === 1) {
    // berries
    for (let i = 0; i < 7; i++) {
      const x = rng.int(7, 24);
      const y = rng.int(13, 24);
      if (!c.alpha(x, y) || !c.alpha(x + 1, y + 1)) continue;
      c.set(x, y, "#c23b3b");
      c.set(x + 1, y, "#7a1e2a");
      c.set(x, y - 1, "#f08a7a");
    }
  }
  if (variant === 2) {
    const F = P.WORLD_RAMPS.flowers;
    for (let i = 0; i < 6; i++) {
      const x = rng.int(8, 23);
      const y = rng.int(12, 22);
      if (!c.alpha(x, y)) continue;
      c.set(x, y, "#f7d6e0");
      c.set(x - 1, y, F[1]);
      c.set(x + 1, y, F[1]);
      c.set(x, y - 1, F[1]);
      c.set(x, y + 1, mix(F[1], L[1]!, 0.5));
    }
  }
  c.outline(L[0]!, { threshold: 255 });
  return c;
}

function rock(P: PaletteModule, rng: Rng, variant: number): Canvas {
  const c = new Canvas(32, 32);
  const S = P.WORLD_RAMPS.stone;
  groundShadow(c, 16, 25, 12, 3.5, P.WORLD_RAMPS.shadow[0]);
  const shapes: [number, number, number, number][] =
    variant === 0
      ? [[16, 18, 11, 9]]
      : variant === 1
        ? [[16, 21, 12, 6]]
        : variant === 2
          ? [
              [11, 20, 7, 6],
              [21, 22, 6, 4.5],
              [19, 15, 5, 4.5],
            ]
          : [[16, 19, 10, 8]];
  for (const [cx, cy, rx, ry] of shapes) {
    const seed = rng.int(0, 1000);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const rr = 1 + (noise(ang * 3 + 10, 0, 1, seed) - 0.5) * 0.28;
        const nx = (x + 0.5 - cx) / (rx * rr);
        const ny = (y + 0.5 - cy) / (ry * rr);
        if (nx * nx + ny * ny > 1) continue;
        // faceted look: quantise the normal before lighting
        const qx = Math.round(nx * 2.2) / 2.2;
        const qy = Math.round(ny * 2.2) / 2.2;
        let t = sphereLight(clamp(qx, -0.95, 0.95), clamp(qy, -0.95, 0.95));
        if (ny > 0.55) t -= 0.25;
        c.set(x, y, rampPick(S.slice(1), t * 1.05, x, y, 0.15));
      }
  }
  // cracks
  for (let i = 0; i < 2; i++) {
    let x = rng.int(12, 20);
    let y = rng.int(14, 18);
    for (let k = 0; k < 4; k++) {
      if (c.alpha(x, y) === 255 && c.alpha(x + 1, y + 1) === 255) c.set(x, y, S[1]!);
      x += rng.int(0, 1);
      y += 1;
    }
  }
  if (variant === 3) {
    // moss cap
    const L = P.WORLD_RAMPS.leaf;
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        if (c.alpha(x, y) !== 255) continue;
        const top = c.alpha(x, y - 3) !== 255 || c.alpha(x, y - 2) !== 255;
        if (top && noise(x, y, 3, 5) > 0.35) c.set(x, y, c.alpha(x, y - 1) !== 255 ? L[4]! : L[3]!);
      }
  }
  // outline opaque only (not the shadow)
  const pts: [number, number][] = [];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      if (c.alpha(x, y) === 255) continue;
      if ([c.alpha(x - 1, y), c.alpha(x + 1, y), c.alpha(x, y - 1), c.alpha(x, y + 1)].some((a) => a === 255)) pts.push([x, y]);
    }
  for (const [x, y] of pts) c.set(x, y, S[0]!);
  return c;
}

function mushrooms(P: PaletteModule, rng: Rng, variant: number): Canvas {
  const c = new Canvas(32, 32);
  const cap: Ramp =
    variant === 0 ? P.WORLD_RAMPS.mushroomRed : variant === 1 ? P.WORLD_RAMPS.dirt.slice(0, 4) : ["#1b2f4a", "#2f5f8a", "#4fa3d1", "#9fe6ff"];
  const stem = P.WORLD_RAMPS.plaster;
  groundShadow(c, 16, 25, 11, 3, P.WORLD_RAMPS.shadow[0]);
  const shrooms = [
    { x: 13, base: 25, h: 7, r: 6 },
    { x: 21, base: 26, h: 4, r: 4 },
    { x: 8, base: 26, h: 3, r: 3 },
  ];
  for (const m of shrooms) {
    // stem
    for (let y = m.base - m.h; y <= m.base; y++)
      for (let x = m.x - 1; x <= m.x + 1; x++) c.set(x, y, x === m.x - 1 ? stem[3]! : x === m.x + 1 ? stem[1]! : stem[2]!);
    // cap (half ellipse + rim)
    const cy = m.base - m.h;
    c.forEllipse(m.x, cy, m.r, m.r * 0.75, (x, y, nx, ny) => {
      if (ny > 0.25) return;
      let t = sphereLight(nx * 0.9, ny * 0.9 - 0.1);
      if (ny > 0.05) t -= 0.35;
      c.set(x, y, rampPick(cap.slice(1), t, x, y, 0.2));
    });
    // spots
    if (variant !== 1) {
      const spot = variant === 0 ? "#f3e8d8" : "#e8fbff";
      c.set(m.x - Math.floor(m.r / 2), cy - Math.floor(m.r / 3), spot);
      if (m.r > 3) {
        c.set(m.x + 1, cy - Math.floor(m.r * 0.55), spot);
        c.set(m.x + Math.floor(m.r / 2), cy - 1, spot);
      }
    }
  }
  c.outline(cap[0]!, { threshold: 255 });
  if (variant === 2) {
    // faint glow halo pixels (light source is drawn separately at runtime)
    for (let i = 0; i < 5; i++) {
      const x = rng.int(4, 27);
      const y = rng.int(8, 20);
      if (c.alpha(x, y) === 0) c.set(x, y, "#9fe6ff", 170);
    }
  }
  return c;
}

export function nature(rng: Rng, P: PaletteModule): GeneratedAsset[] {
  const out: GeneratedAsset[] = [];
  const tree = (name: string, cv: Canvas) =>
    asset(`props/tree-${name}.png`, "prop", cv, undefined, { anchorX: 0.5, anchorY: 0.92, collider: "trunk" });
  out.push(tree("oak", oak(P, rng, 0)));
  out.push(tree("oak-2", oak(P, rng, 1)));
  out.push(tree("pine", pine(P, rng)));
  out.push(tree("dead", deadTree(P, rng)));
  out.push(asset("props/bushes.png", "prop", Canvas.strip([0, 1, 2].map((v) => bush(P, rng, v))), { w: 32, h: 32, frames: 3 }));
  out.push(asset("props/rocks.png", "prop", Canvas.strip([0, 1, 2, 3].map((v) => rock(P, rng, v))), { w: 32, h: 32, frames: 4 }));
  out.push(asset("props/mushrooms.png", "prop", Canvas.strip([0, 1, 2].map((v) => mushrooms(P, rng, v))), { w: 32, h: 32, frames: 3 }));
  // Appended last: generators share one rng stream, so new art goes at the end (older assets stay identical).
  out.push(tree("pine-snow", pine(P, rng, true)));
  return out;
}
