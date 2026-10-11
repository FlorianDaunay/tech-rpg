import Phaser from "phaser";
import { hex, PROJECTILE_RAMPS } from "@/config/palette";
import type { Element } from "@/core/combat/defs";
import type { Move, ProjectileLook } from "@/core/combat/moves";

/**
 * Projectile art, drawn once per (look, element) into small textures pointing right (+x): flame
 * bolts, ice shards, storm sparks, hollow orbs, arrows, webs. The view rotates them along their
 * velocity and leaves a trail of motes in the element's colours.
 */

type Ramp = readonly [string, string, string, string, string];
type Palette = keyof typeof PROJECTILE_RAMPS;

const DEFAULT_LOOK: Record<Palette, ProjectileLook> = { ember: "bolt", frost: "shard", storm: "spark", hollow: "orb", none: "orb" };

export function projectileStyle(move: Move): { look: ProjectileLook; palette: Palette } {
  const palette: Palette = (move.element as Element | undefined) ?? "none";
  return { look: move.projectile?.look ?? DEFAULT_LOOK[palette], palette };
}

export const MOTE = "proj/mote";

/** Texture key for a style (drawn on first use). */
export function ensureProjectileTexture(scene: Phaser.Scene, look: ProjectileLook, palette: Palette): string {
  const key = `proj/${look}-${palette}`;
  if (!scene.textures.exists(MOTE)) {
    const m = scene.make.graphics({}, false);
    m.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2).generateTexture(MOTE, 2, 2);
    m.destroy();
  }
  if (scene.textures.exists(key)) return key;
  const r = PROJECTILE_RAMPS[palette] as Ramp;
  const g = scene.make.graphics({}, false);
  const px = (x: number, y: number, c: string, w = 1, h = 1) => g.fillStyle(hex(c), 1).fillRect(x, y, w, h);
  let w = 16;
  let h = 10;
  switch (look) {
    case "bolt": {
      // Teardrop flame: long licking tail on the left, white-hot head on the right.
      w = 18;
      h = 9;
      for (let x = 0; x < 14; x++) {
        const t = x / 13;
        const half = Math.round(0.5 + t * 3.2);
        px(x, 4 - half, t < 0.35 ? r[1] : r[2], 1, half * 2 + 1);
      }
      px(13, 1, r[2], 3, 7);
      px(14, 2, r[3], 3, 5);
      px(15, 3, r[4], 2, 3);
      px(3, 2, r[1]);
      px(6, 6, r[2]);
      px(8, 1, r[3]);
      break;
    }
    case "shard": {
      // Ice crystal: a long diamond with a bright facet line.
      w = 16;
      h = 7;
      for (let x = 0; x < 16; x++) {
        const half = Math.round(3 * (1 - Math.abs(x - 10) / (x < 10 ? 10 : 6)));
        if (half >= 0) px(x, 3 - half, x < 4 ? r[1] : r[2], 1, half * 2 + 1);
      }
      px(3, 3, r[3], 11, 1);
      px(9, 2, r[4], 4, 1);
      px(15, 3, r[4]);
      break;
    }
    case "spark": {
      // Forked lightning: a jagged white core with violet edges.
      w = 16;
      h = 11;
      const ys = [5, 3, 6, 2, 7, 4, 8, 5, 3, 5, 6, 4, 5, 5, 5, 5];
      ys.forEach((y, x) => {
        px(x, y - 1, r[2], 1, 3);
        px(x, y, x > 11 ? r[4] : r[3]);
      });
      px(5, 8, r[2]);
      px(6, 9, r[3]);
      px(9, 1, r[3]);
      px(13, 3, r[4], 3, 5);
      break;
    }
    case "orb": {
      // Dark core, bright rim, small highlight: reads on any ground.
      w = 12;
      h = 12;
      g.fillStyle(hex(r[2]), 1).fillCircle(6, 6, 5.5);
      g.fillStyle(hex(r[0]), 1).fillCircle(6, 6, 3.5);
      g.fillStyle(hex(r[1]), 1).fillCircle(6, 6, 2);
      px(8, 3, r[4], 2, 1);
      px(9, 4, r[3]);
      break;
    }
    case "arrow": {
      w = 16;
      h = 5;
      px(2, 2, r[2], 11, 1);
      px(12, 1, r[3], 1, 3);
      px(13, 0, r[3], 1, 5);
      px(14, 1, r[4], 1, 3);
      px(15, 2, r[4]);
      px(0, 0, r[1], 3, 1);
      px(0, 4, r[1], 3, 1);
      px(1, 1, r[3], 2, 1);
      px(1, 3, r[3], 2, 1);
      break;
    }
    case "web": {
      w = 13;
      h = 13;
      g.lineStyle(1, hex(r[3]), 1);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 4;
        g.lineBetween(6.5 - Math.cos(a) * 6, 6.5 - Math.sin(a) * 6, 6.5 + Math.cos(a) * 6, 6.5 + Math.sin(a) * 6);
      }
      g.lineStyle(1, hex(r[2]), 1).strokeCircle(6.5, 6.5, 2.5).strokeCircle(6.5, 6.5, 5);
      px(6, 6, r[4]);
      break;
    }
  }
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** Trail mote colours for a palette (Phaser tints). */
export const trailTints = (palette: Palette) => {
  const r = PROJECTILE_RAMPS[palette] as Ramp;
  return [hex(r[2]), hex(r[3]), hex(r[4])];
};
