import Phaser from "phaser";
import { ARENA_COLORS, hex } from "@/config/palette";
import type { GameMap } from "@/core/world/map";
import { DEPTH_LIGHT } from "./Lighting";

const FADE_MS = 600;

/**
 * Sealed portals (their wardens still stand): a shimmering veil over the opening, with drifting
 * motes. It thins away when the portal opens.
 */
export class SealBarriers {
  private readonly g: Phaser.GameObjects.Graphics;
  /** Portal id → when it opened (ms), while fading out. */
  private readonly opened = new Map<string, number>();

  constructor(private readonly scene: Phaser.Scene, private readonly map: GameMap) {
    // Above the darkness: the veil is its own light.
    this.g = scene.add.graphics().setDepth(DEPTH_LIGHT + 2).setBlendMode(Phaser.BlendModes.ADD);
  }

  open(portal: string): void {
    this.opened.set(portal, this.scene.time.now);
  }

  update(sealed: readonly string[]): void {
    const now = this.scene.time.now;
    const g = this.g.clear();
    for (const p of this.map.portals) {
      const since = this.opened.get(p.id);
      const fade = since === undefined ? 1 : 1 - (now - since) / FADE_MS;
      if (!sealed.includes(p.id) && since === undefined) continue;
      if (fade <= 0) continue;
      const pulse = 0.55 + 0.2 * Math.sin(now / 260);
      g.fillStyle(hex(ARENA_COLORS.seal), 0.35 * pulse * fade).fillRect(p.x, p.y, p.w, p.h);
      // Rune lattice.
      for (let y = p.y + 4; y < p.y + p.h; y += 8) g.fillStyle(hex(ARENA_COLORS.seal), 0.35 * fade).fillRect(p.x, y + Math.round(Math.sin(now / 300 + y) * 1), p.w, 1);
      g.lineStyle(2, hex(ARENA_COLORS.sealEdge), (0.6 + 0.3 * pulse) * fade).strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
      // Vertical light streaks drifting up through the veil.
      for (let i = 0; i < 10; i++) {
        const x = p.x + ((i * 7 + 3) % Math.max(1, p.w - 2)) + 1;
        const k = ((now / 900 + i * 0.37) % 1 + 1) % 1;
        const y = p.y + p.h - k * p.h;
        g.fillStyle(hex(ARENA_COLORS.sealEdge), (1 - k) * 0.9 * fade).fillRect(Math.round(x), Math.round(y), 1, 3);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
