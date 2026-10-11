import Phaser from "phaser";
import { ARENA_COLORS, hex } from "@/config/palette";
import type { Arena } from "@/core/sim/state";
import { DEPTH_GROUND } from "../world/renderMap";

/** Px between two pillars along the ring. */
const SPACING = 11;
const RISE_MS = 450;
const TEXTURE = "arena/pillar";
const PILLAR = { w: 7, h: 24 };

/** One ember-crystal pillar, generated once per game (a canvas texture, not a DynamicTexture). */
function ensurePillarTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURE)) return;
  const g = scene.make.graphics({}, false);
  const { w, h } = PILLAR;
  // Dark outline, ember body, bright core, pointed top.
  g.fillStyle(hex(ARENA_COLORS.outline), 1).fillRect(0, 3, w, h - 3).fillRect(1, 1, w - 2, 2).fillRect(2, 0, w - 4, 1);
  g.fillStyle(hex(ARENA_COLORS.pillar), 1).fillRect(1, 3, w - 2, h - 4).fillRect(2, 1, w - 4, 2);
  g.fillStyle(hex(ARENA_COLORS.core), 1).fillRect(3, 2, 1, h - 6);
  g.fillStyle(hex(ARENA_COLORS.tip), 1).fillRect(3, 0, 1, 2);
  g.generateTexture(TEXTURE, w, h);
  g.destroy();
}

/**
 * Sealed boss arenas: a ring of ember pillars (each y-sorted like any standing object, so the wall
 * wraps around characters and trees) over a glowing ground circle. Rises when the fight starts,
 * sinks when it ends.
 */
export class ArenaWalls {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly pillars = new Map<string, Phaser.GameObjects.Image[]>();
  /** Per boss: when the wall started rising (ms), or falling (negative ms). */
  private readonly since = new Map<string, number>();

  constructor(private readonly scene: Phaser.Scene) {
    ensurePillarTexture(scene);
    // Just above the ground tile layers, below every object and character.
    this.ground = scene.add.graphics().setDepth(DEPTH_GROUND + 50);
  }

  /** Wall raised / lowered: start its animation. */
  toggle(boss: string, sealed: boolean): void {
    this.since.set(boss, sealed ? this.scene.time.now : -this.scene.time.now);
  }

  update(arenas: readonly Arena[]): void {
    const now = this.scene.time.now;
    this.ground.clear();
    // Arenas gone from the sim (boss dead and despawned) leave no pillars behind.
    for (const [boss, list] of this.pillars) if (!arenas.some((r) => r.boss === boss)) for (const img of list) img.setVisible(false);
    for (const r of arenas) {
      const t = this.since.get(r.boss);
      // 0..1 height: rising after a seal, sinking after it opens.
      const k = r.sealed ? Math.min(1, (now - (t !== undefined && t >= 0 ? t : now - RISE_MS)) / RISE_MS) : t !== undefined && t < 0 ? Math.max(0, 1 - (now + t) / RISE_MS) : 0;
      const ring = this.ring(r);
      for (const [i, img] of ring.entries()) {
        img.setVisible(k > 0);
        if (k <= 0) continue;
        const flicker = 0.85 + 0.15 * Math.sin(now / 110 + (i >> 1) * 1.9);
        // Even = pillar, odd = its halo.
        if (i % 2 === 0) img.setScale(1, k * flicker);
        else img.setScale(1.6, 1.1 * k).setAlpha(0.08 + 0.06 * flicker);
      }
      if (k <= 0) continue;
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      this.ground.lineStyle(6, hex(ARENA_COLORS.glow), (0.12 + 0.1 * pulse) * k).strokeCircle(r.x, r.y, r.radius);
      this.ground.lineStyle(2, hex(ARENA_COLORS.pillar), 0.55 * k).strokeCircle(r.x, r.y, r.radius);
    }
  }

  /** The pillars of an arena, created once. */
  private ring(r: Arena): Phaser.GameObjects.Image[] {
    let list = this.pillars.get(r.boss);
    if (list) return list;
    const n = Math.max(12, Math.round((Math.PI * 2 * r.radius) / SPACING));
    // Two images per pillar: the pillar, then its glow.
    list = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const x = Math.round(r.x + Math.cos(ang) * r.radius);
      const y = Math.round(r.y + Math.sin(ang) * r.radius);
      list.push(this.scene.add.image(x, y, TEXTURE).setOrigin(0.5, 1).setDepth(y).setVisible(false));
      // A soft additive halo so the wall glows in the dark zones.
      list.push(this.scene.add.image(x, y - PILLAR.h / 2, TEXTURE).setOrigin(0.5, 0.5).setScale(2.2, 1.3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25).setDepth(y + 0.1).setVisible(false));
    }
    this.pillars.set(r.boss, list);
    return list;
  }

  destroy(): void {
    this.ground.destroy();
    for (const list of this.pillars.values()) for (const img of list) img.destroy();
    this.pillars.clear();
  }
}
