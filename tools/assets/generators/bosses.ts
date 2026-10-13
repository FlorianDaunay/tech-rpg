/**
 * Bosses drawn from scratch to match the Pipoya boss sheets (96×96 frames, feet near y 88, 3 idle
 * frames played 0-1-2-1). Their look, measured on Vaelgor: ~28 colours, flat cel shading (3–4 tones
 * per material, hard-edged shadows, no gradients or dithering), and one dark red line colour used
 * both as the outline and to draw anatomy inside the shapes.
 */
import type { Rng } from "../../../src/core/math/rng";
import type { Color } from "../png";
import type { GeneratedAsset, PaletteModule } from "../types";
import { asset, Canvas } from "./lib";

const S = 96;
type Pt = readonly [number, number];

/** A material: shadow, base, light, highlight. */
type Tones = readonly [Color, Color, Color, Color];

/** A part's footprint, built from ellipses and polygons. */
class Mask {
  readonly bits = new Uint8Array(S * S);
  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < S && y < S && this.bits[y * S + x] === 1;
  }
  private put(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < S && y < S) this.bits[y * S + x] = 1;
  }
  ell(cx: number, cy: number, rx: number, ry: number): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.put(x, y);
    return this;
  }
  poly(pts: readonly Pt[]): this {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = 0; x < S; x++) {
        let hit = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]!;
          const [xj, yj] = pts[j]!;
          if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) hit = !hit;
        }
        if (hit) this.put(x, y);
      }
    return this;
  }
}

/** Hand-placed strokes inside a part (only where the part is). */
class Detail {
  constructor(
    readonly c: Canvas,
    readonly m: Mask
  ) {}
  px(x: number, y: number, col: Color) {
    if (this.m.has(x, y)) this.c.set(x, y, col);
  }
  stroke(pts: readonly Pt[], col: Color) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) this.px(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), col);
    }
  }
}

/**
 * Figure built part by part (back to front). Each part is cel-shaded from its own silhouette (light
 * from the top-left: a light band along top-left edges, a shadow band along bottom-right edges) and
 * outlined in the line colour before the next part goes over it.
 */
class Figure {
  readonly c = new Canvas(S, S);
  constructor(readonly line: Color) {}

  part(mask: Mask, t: Tones, opts: { shadow?: number; light?: number; hi?: boolean; outline?: boolean; details?: (d: Detail) => void } = {}): void {
    const layer = new Canvas(S, S);
    const sh = opts.shadow ?? 2;
    const li = opts.light ?? 2;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!mask.has(x, y)) continue;
        let tone = 1;
        if (!mask.has(x + sh, y + 1) || !mask.has(x + 1, y + sh)) tone = 0;
        else if (!mask.has(x - li, y - li) || !mask.has(x - li, y)) tone = 2;
        if (opts.hi && tone === 2 && !mask.has(x - 1, y - 1) && mask.has(x + 2, y + 2)) tone = 3;
        layer.set(x, y, t[tone]!);
      }
    opts.details?.(new Detail(layer, mask));
    if (opts.outline !== false) layer.outline(this.line);
    this.c.blit(layer, 0, 0);
  }
}

/** Mirror around the sprite's vertical axis. */
const m = (x: number) => S - 1 - x;
const SIDES = [(x: number) => x, m] as const;
const shift = (pts: readonly Pt[], dy: number): Pt[] => pts.map(([x, y]) => [x, y + dy]);
/** Points placed on one side (X = identity or mirror), moved down by dy. */
const at = (X: (x: number) => number, pts: readonly Pt[], dy = 0): Pt[] => pts.map(([x, y]) => [X(x), y + dy]);

// ---- Grukk, the Goblin King -------------------------------------------------------------------

function goblinKing(frame: number): Canvas {
  // Pipoya-like saturated tones, 4 per material.
  const LINE = "#3c0707";
  const SKIN: Tones = ["#2e4a17", "#4f7a24", "#72a332", "#a3cf52"];
  const IRON: Tones = ["#33303f", "#55536a", "#8583a0", "#c4c2d8"];
  const GOLD: Tones = ["#764a00", "#ad8100", "#e3b700", "#fffc00"];
  const BLADE: Tones = ["#45346b", "#7564a8", "#b5aadf", "#ffffff"];
  const FUR: Tones = ["#2b1a14", "#4a2e20", "#6e4630", "#93643f"];
  const CLOTH: Tones = ["#5a0c12", "#8c1a1e", "#bf2f26", "#e3593d"];
  const BONE: Tones = ["#7a6a50", "#b2a280", "#e2d6b6", "#fff9ea"];
  const LEATHER: Tones = ["#3a2010", "#5e3a1c", "#80542c", "#a0723e"];
  const EYE = { glow: "#ff8000", core: "#fffc00" };
  const MOUTH: Tones = ["#2a0303", "#2a0303", "#7c1414", "#7c1414"];

  // Idle: the upper body heaves (0, 1, 1 px), the eyes pulse.
  const b = [0, 1, 1][frame]!;
  const bright = frame !== 0;
  const f = new Figure(LINE);

  // Fur cloak behind the shoulders, ragged hem.
  {
    const hem: Pt[] = [];
    for (let i = 0; i <= 14; i++) hem.push([12 + i * 5.14, 78 + (i % 2 ? 6 : 0) + (i % 3 === 0 ? -2 : 0)]);
    f.part(new Mask().poly([[30, 30 + b], [66, 30 + b], [84, 52], ...[...hem].reverse(), [12, 52]]), FUR, {
      shadow: 3,
      details: (d) => {
        for (let x = 16; x < 82; x += 5) d.stroke([[x, 56], [x + 2, 74]], FUR[0]); // fur strands
      },
    });
  }

  for (const X of SIDES) {
    // Scimitar held low, point out toward the ground; serrated back.
    const blade = at(X, [[17, 70], [12, 74], [7, 80], [4, 88], [7, 86], [9, 84], [11, 86], [13, 80], [16, 80], [18, 75], [21, 71]], b);
    f.part(new Mask().poly(blade), BLADE, { shadow: 1, hi: true, details: (d) => d.stroke([[X(17), 72 + b], [X(11), 79 + b], [X(7), 86 + b]], BLADE[0]) });

    // Crouched leg: thick thigh bowed out, armoured shin, clawed foot.
    f.part(new Mask().poly(at(X, [[44, 64], [37, 62], [24, 69], [21, 77], [27, 80], [34, 75], [44, 72]])), SKIN, {
      hi: true,
      details: (d) => d.stroke([[X(38), 66], [X(28), 73]], SKIN[0]),
    });
    f.part(new Mask().poly(at(X, [[21, 76], [30, 76], [32, 85], [22, 86]])), IRON, { hi: true, details: (d) => d.stroke([[X(23), 80], [X(30), 80]], IRON[0]) });
    f.part(new Mask().poly(at(X, [[18, 85], [34, 85], [35, 89], [17, 89]])), SKIN, { shadow: 1 });
    for (const cx of [17, 21, 25]) f.part(new Mask().poly(at(X, [[cx, 88], [cx + 2, 88], [cx - 1, 91]])), BONE, { shadow: 1, light: 1 });
  }

  // Loincloth and belt with a skull.
  f.part(new Mask().poly([[40, 64 + b], [56, 64 + b], [55, 82], [51, 79], [48, 83], [45, 79], [41, 82]]), CLOTH, {
    details: (d) => {
      d.stroke([[44, 67 + b], [44, 78]], CLOTH[0]);
      d.stroke([[52, 67 + b], [52, 78]], CLOTH[0]);
    },
  });
  f.part(new Mask().poly([[35, 60 + b], [61, 60 + b], [60, 65 + b], [36, 65 + b]]), LEATHER, { shadow: 1 });
  f.part(new Mask().ell(48, 62.5 + b, 3.5, 3.2), BONE, {
    shadow: 1,
    details: (d) => {
      d.px(47, 62 + b, LINE);
      d.px(49, 62 + b, LINE);
      d.px(48, 64 + b, LINE);
    },
  });

  // Torso: a V of muscle — broad chest, narrow waist; pecs and abs drawn in line colour.
  f.part(new Mask().poly(shift([[30, 38], [66, 38], [65, 46], [60, 54], [57, 61], [39, 61], [36, 54], [31, 46]], b)), SKIN, {
    hi: true,
    details: (d) => {
      const y = (v: number) => v + b;
      d.stroke([[48, y(41)], [48, y(60)]], LINE);
      for (const X of SIDES) {
        d.stroke([[X(34), y(46)], [X(38), y(50)], [X(44), y(51)], [X(47), y(49)]], LINE); // pectorals
        d.stroke([[X(36), y(47)], [X(40), y(49)], [X(45), y(49)]], SKIN[0]);
        d.stroke([[X(42), y(52)], [X(43), y(59)]], SKIN[0]);
        d.stroke([[X(38), y(53)], [X(40), y(59)]], LINE); // obliques
      }
      for (const r of [54, 57]) {
        d.stroke([[43, y(r)], [47, y(r)]], LINE); // abs
        d.stroke([[49, y(r)], [53, y(r)]], LINE);
      }
      for (const [x, yy] of [[39, 43], [41, 43], [55, 43]] as const) d.px(x, y(yy), SKIN[3]);
    },
  });

  for (const X of SIDES) {
    const P = (pts: readonly Pt[]) => pts.map(([x, y]) => [X(x), y + b] as Pt);
    // Arm: huge, bent, the fist gripping the scimitar.
    f.part(new Mask().poly(P([[33, 37], [24, 37], [15, 46], [13, 55], [20, 58], [26, 50], [33, 46]])), SKIN, {
      hi: true,
      details: (d) => {
        d.stroke(P([[26, 41], [20, 47], [19, 53]]), LINE); // biceps
        d.stroke(P([[28, 44], [23, 50]]), SKIN[0]);
      },
    });
    f.part(new Mask().poly(P([[12, 53], [21, 55], [22, 64], [13, 64]])), SKIN, { hi: true });
    // Spiked iron bracer.
    f.part(new Mask().poly(P([[12, 57], [22, 58], [22, 62], [12, 62]])), IRON, { shadow: 1, details: (d) => d.stroke(P([[13, 59], [21, 60]]), IRON[0]) });
    f.part(new Mask().poly(P([[11, 58], [12, 61], [7, 60]])), IRON, { shadow: 1, light: 1 });
    // Fist clenched around the grip, knuckles drawn in.
    f.part(new Mask().poly(P([[12, 63], [23, 63], [24, 66], [22, 69], [13, 69], [11, 66]])), SKIN, {
      hi: true,
      details: (d) => {
        for (const k of [15, 18, 21]) d.stroke(P([[k, 63], [k, 65]]), LINE);
        d.stroke(P([[13, 67], [22, 67]]), SKIN[0]);
      },
    });
    // Gold crossguard where the blade leaves the fist.
    f.part(new Mask().poly(P([[10, 69], [25, 69], [24, 71], [11, 71]])), GOLD, { shadow: 1, light: 1, hi: true });
    // Spiked pauldron.
    for (const spike of [[[22, 36], [26, 35], [17, 25]], [[28, 34], [32, 34], [28, 23]]] as const) f.part(new Mask().poly(P(spike)), IRON, { shadow: 1, light: 1, hi: true });
    f.part(new Mask().ell(X(28), 39 + b, 8.5, 5), IRON, {
      hi: true,
      details: (d) => {
        d.stroke(P([[21, 41], [35, 41]]), GOLD[1]);
        d.px(X(28), 38 + b, GOLD[2]);
      },
    });
  }

  // Bone necklace of fangs.
  for (let i = 0; i < 7; i++) {
    const x = 37 + i * 3.5;
    const y = 40 + b + Math.round(Math.abs(i - 3) * -0.5 + 1.5);
    f.part(new Mask().poly([[x - 1.2, y], [x + 1.6, y], [x + 0.2, y + 4]]), BONE, { shadow: 1, light: 1 });
  }

  // Ears: long, swept back and up, a gold ring in each.
  for (const X of SIDES)
    f.part(new Mask().poly(at(X, [[39, 24], [12, 13], [19, 21], [24, 27], [39, 31]], b)), SKIN, {
      hi: true,
      details: (d) => {
        d.stroke([[X(36), 26 + b], [X(20), 18 + b], [X(26), 25 + b]], SKIN[0]);
        d.px(X(25), 28 + b, GOLD[3]);
        d.px(X(25), 29 + b, GOLD[1]);
      },
    });

  // Head: low between the shoulders, heavy jaw, slit eyes under a V brow, a scar.
  const y = (v: number) => v + b;
  f.part(new Mask().ell(48, y(25), 10.5, 9).poly(shift([[37, 27], [59, 27], [57, 39], [48, 42], [39, 39]], b)), SKIN, {
    hi: true,
    details: (d) => {
      for (const X of SIDES) {
        d.stroke([[X(38), y(23)], [X(42), y(24)], [X(46), y(27)]], LINE);
        d.stroke([[X(39), y(22)], [X(44), y(24)]], SKIN[3]);
        d.stroke([[X(39), y(26)], [X(45), y(28)]], LINE);
        d.px(X(41), y(27), EYE.glow);
        d.px(X(42), y(27), bright ? EYE.core : EYE.glow);
        d.px(X(43), y(27), EYE.glow);
        d.px(X(44), y(28), EYE.glow);
        d.stroke([[X(42), y(30)], [X(41), y(35)]], SKIN[0]); // cheek folds
      }
      d.stroke([[46, y(31)], [50, y(31)]], SKIN[0]);
      d.px(46, y(32), LINE);
      d.px(50, y(32), LINE);
      d.stroke([[53, y(18)], [56, y(25)]], LINE);
      d.px(54, y(19), SKIN[3]);
    },
  });

  // Snarl: open mouth, jagged fangs, tusks rising from the underbite.
  f.part(new Mask().poly(shift([[41, 34], [55, 34], [53, 39], [43, 39]], b)), MOUTH, {
    shadow: 1,
    light: 1,
    details: (d) => {
      for (const x of [42, 45, 48, 51, 54]) d.px(x, y(34), BONE[3]);
      for (const x of [42, 45, 51, 54]) d.px(x, y(35), BONE[2]);
      for (const x of [44, 52]) d.px(x, y(38), BONE[2]);
    },
  });
  for (const X of SIDES) f.part(new Mask().poly(at(X, [[40, 40], [43, 39], [40, 31]], b)), BONE, { shadow: 1, light: 1, hi: true });

  // Crude jagged crown.
  const y0 = y(15);
  f.part(new Mask().poly([[38, y0], [58, y0], [57, y0 + 4], [39, y0 + 4]]), GOLD, {
    shadow: 1,
    light: 1,
    details: (d) => {
      for (const x of [42, 48, 54]) {
        d.px(x, y0 + 2, CLOTH[2]);
        d.px(x + 1, y0 + 2, CLOTH[0]);
        d.px(x, y0 + 1, CLOTH[3]);
      }
    },
  });
  for (const [x, h, lean] of [[39, 6, -2], [43, 8, -1], [48, 11, 0], [53, 8, 1], [57, 6, 2]] as const)
    f.part(new Mask().poly([[x - 2.2, y0 + 1], [x + 2.2, y0 + 1], [x + lean, y0 - h]]), GOLD, { shadow: 1, light: 1, hi: true });

  return f.c;
}

export function bosses(_rng: Rng, _P: PaletteModule): GeneratedAsset[] {
  const frames = [0, 1, 2].map((fr) => goblinKing(fr));
  return [asset("bosses/goblin-king.png", "boss", Canvas.strip(frames), { w: S, h: S, frames: 3 }, { generator: "bosses", boss: "grukk" })];
}
