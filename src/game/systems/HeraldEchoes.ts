import Phaser from "phaser";
import { hex, LIGHT_COLORS } from "@/config/palette";
import type { Actor } from "@/core/combat/actor";
import { getEnemy } from "@/core/combat/defs";
import type { Spawner } from "@/core/sim/state";
import { DEPTH_LIGHT } from "./Lighting";

const SIGIL = "vfx/aoe-sigil";
const GLOW = "vfx/light-soft";
const SIZE = 54;

interface Echo {
  sigil: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  motes: Phaser.GameObjects.Particles.ParticleEmitter;
}

/**
 * Where a slain Herald stood, a faint turning rune circle stays: standing on it and interacting
 * calls the Herald back for a rematch (see core `rematchTarget`). Drawn above the darkness.
 */
export class HeraldEchoes {
  private readonly echoes = new Map<string, Echo>();

  constructor(private readonly scene: Phaser.Scene) {}

  update(spawners: readonly Spawner[], actors: Record<string, Actor>): void {
    const color = hex(LIGHT_COLORS.rift);
    const now = this.scene.time.now;
    const live = new Set<string>();
    for (const sp of spawners) {
      if (sp.actor || sp.every !== "never" || !getEnemy(sp.enemy).boss) continue;
      // A client's spawner list can lag behind: no echo under a Herald that is already back.
      if (Object.values(actors).some((a) => a.type === sp.enemy && a.action.kind !== "dead" && Math.hypot(a.x - sp.x, a.y - sp.y) < 120)) continue;
      live.add(sp.key);
      let e = this.echoes.get(sp.key);
      if (!e) {
        const add = (key: string) => this.scene.add.image(sp.x, sp.y, key).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_LIGHT + 1);
        const glow = add(GLOW).setDisplaySize(SIZE * 1.6, SIZE * 1.6);
        const sigil = add(SIGIL).setDisplaySize(SIZE, SIZE);
        const motes = this.scene.add
          .particles(sp.x, sp.y, "arena/mote", {
            x: { min: -SIZE / 3, max: SIZE / 3 },
            y: { min: -6, max: 6 },
            speedY: { min: -14, max: -6 },
            lifespan: 1600,
            frequency: 260,
            alpha: { start: 0.8, end: 0 },
            scale: { start: 1, end: 0.5 },
            tint: color,
            blendMode: Phaser.BlendModes.ADD,
          })
          .setDepth(DEPTH_LIGHT + 1);
        e = { sigil, glow, motes };
        this.echoes.set(sp.key, e);
      }
      const breath = 0.5 + 0.5 * Math.sin(now / 700);
      e.sigil.setAngle(now / 90).setAlpha(0.3 + 0.25 * breath);
      e.glow.setAlpha(0.18 + 0.12 * breath);
    }
    for (const [key, e] of this.echoes) {
      if (live.has(key)) continue;
      e.sigil.destroy();
      e.glow.destroy();
      e.motes.destroy();
      this.echoes.delete(key);
    }
  }

  destroy(): void {
    for (const e of this.echoes.values()) (e.sigil.destroy(), e.glow.destroy(), e.motes.destroy());
    this.echoes.clear();
  }
}
