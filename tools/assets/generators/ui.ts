/**
 * In-canvas UI sprites: item frame per rarity, skill-slot ring, virtual joystick base/knob.
 * (The React HUD may draw its own SVG versions; these are for in-world/Phaser use.)
 */
import type { Rng } from "../../../src/core/math/rng";
import { mix } from "../png";
import type { GeneratedAsset, PaletteModule } from "../types";
import { asset, Canvas } from "./lib";
import type { Rarity } from "../../../src/config/palette";

const SLOT_BG = "#1c1a24";
const SLOT_EDGE = "#100e16";

function itemFrame(P: PaletteModule, rarity: Rarity): Canvas {
  const c = new Canvas(32, 32);
  const base = P.RARITY_COLORS[rarity];
  const light = mix(base, "#ffffff", 0.45);
  const dark = mix(base, SLOT_EDGE, 0.55);
  const tier = Object.keys(P.RARITY_COLORS).indexOf(rarity);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      // rounded corners
      const cx = Math.min(x, 31 - x);
      const cy = Math.min(y, 31 - y);
      if (cx + cy < 2) continue;
      const ring = Math.min(cx, cy);
      if (ring === 0 || (cx + cy === 2)) c.set(x, y, SLOT_EDGE);
      else if (ring === 1) c.set(x, y, x + y < 31 ? light : dark);
      else if (ring === 2) c.set(x, y, x + y < 31 ? base : mix(base, SLOT_EDGE, 0.3));
      else if (ring === 3) c.set(x, y, SLOT_EDGE, 230);
      else {
        // interior: dark, with a soft rarity-coloured vignette from the bottom
        const glow = Math.max(0, (y - 14) / 18) * (0.12 + tier * 0.05);
        c.set(x, y, mix(SLOT_BG, base, glow), 225);
      }
    }
  // inner top-left highlight line
  for (let i = 5; i < 27; i++) c.set(i, 4, mix(SLOT_BG, "#ffffff", 0.08), 230);
  // corner studs / gems for higher rarities
  if (tier >= 2) {
    for (const [x, y] of [
      [3, 3],
      [28, 3],
      [3, 28],
      [28, 28],
    ] as const) {
      c.set(x, y, light);
      c.set(x + (x < 16 ? 1 : -1), y, base);
      c.set(x, y + (y < 16 ? 1 : -1), base);
    }
  }
  if (tier >= 3) {
    // top gem
    c.set(15, 0, SLOT_EDGE);
    c.set(16, 0, SLOT_EDGE);
    c.set(14, 1, SLOT_EDGE);
    c.set(17, 1, SLOT_EDGE);
    c.set(15, 1, light);
    c.set(16, 1, base);
    c.set(15, 2, base);
    c.set(16, 2, dark);
  }
  if (tier >= 4) {
    // legendary: sparkle pixels in the corners of the interior
    for (const [x, y] of [
      [6, 7],
      [25, 24],
    ] as const) {
      c.set(x, y, light, 200);
      c.set(x - 1, y, base, 120);
      c.set(x + 1, y, base, 120);
      c.set(x, y - 1, base, 120);
      c.set(x, y + 1, base, 120);
    }
  }
  return c;
}

function skillRing(P: PaletteModule): Canvas {
  const S = 48;
  const c = new Canvas(S, S);
  const M = P.WORLD_RAMPS.metal;
  const ember = P.ELEMENT_COLORS.ember;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - 24;
      const dy = y + 0.5 - 24;
      const d = Math.hypot(dx, dy);
      if (d > 23.5) continue;
      const lit = (-dx - dy) / (d || 1); // top-left light on the bevel
      if (d > 22.5) c.set(x, y, SLOT_EDGE);
      else if (d > 19.5) c.set(x, y, lit > 0.4 ? M[4]! : lit > -0.4 ? M[3]! : M[2]!);
      else if (d > 18.5) c.set(x, y, lit > 0 ? M[1]! : M[3]!);
      else if (d > 17.5) c.set(x, y, SLOT_EDGE);
      else c.set(x, y, SLOT_BG, 200);
    }
  // ember notch at the top (cooldown start marker)
  for (const [x, y, col] of [
    [23, 1, ember],
    [24, 1, ember],
    [22, 2, ember],
    [25, 2, ember],
    [23, 2, mix(ember, "#ffffff", 0.5)],
    [24, 2, mix(ember, "#ffffff", 0.5)],
    [23, 3, ember],
    [24, 3, ember],
  ] as const)
    c.set(x, y, col);
  return c;
}

function joystickBase(): Canvas {
  const S = 96;
  const c = new Canvas(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - 48, y + 0.5 - 48);
      if (d > 47.5) continue;
      let a = 0.14;
      if (d > 45) a = 0.75;
      else if (d > 43.5) a = 0.3;
      // direction ticks
      const ang = Math.atan2(y - 48 + 0.5, x - 48 + 0.5);
      const q = Math.abs(((ang / (Math.PI / 2)) % 1 + 1) % 1 - 0.5);
      if (d > 36 && d < 41 && q > 0.47) a = 0.6;
      c.set(x, y, "#ffffff", 255 * a);
    }
  return c;
}

function joystickKnob(): Canvas {
  const S = 48;
  const c = new Canvas(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - 24;
      const dy = y + 0.5 - 24;
      const d = Math.hypot(dx, dy);
      if (d > 23.5) continue;
      let a = 0.5;
      let v = 235;
      if (d > 21.5) {
        a = 0.85;
        v = 255;
      } else if (Math.hypot(dx + 6, dy + 6) < 7) {
        a = 0.62;
        v = 255;
      }
      c.set(x, y, [v, v, v], 255 * a);
    }
  return c;
}

export function ui(_rng: Rng, P: PaletteModule): GeneratedAsset[] {
  const out: GeneratedAsset[] = [];
  for (const rarity of Object.keys(P.RARITY_COLORS) as Rarity[])
    out.push(asset(`ui/item-frame-${rarity}.png`, "ui", itemFrame(P, rarity), undefined, { rarity }));
  out.push(asset("ui/skill-slot.png", "ui", skillRing(P)));
  out.push(asset("ui/joystick-base.png", "ui", joystickBase(), undefined, { tint: "runtime" }));
  out.push(asset("ui/joystick-knob.png", "ui", joystickKnob(), undefined, { tint: "runtime" }));
  return out;
}
