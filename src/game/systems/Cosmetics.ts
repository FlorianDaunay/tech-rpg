import Phaser from "phaser";
import { hex } from "@/config/palette";
import type { Actor } from "@/core/combat/actor";
import { findCosmetic } from "@/core/economy/defs";
import { DEPTH_LIGHT } from "./Lighting";

/** Seconds between two trail motes while walking. */
const TRAIL_EVERY = 0.045;
const TRAIL_LIFE = 700;
/** Sprites are drawn from their centre: the feet are this far below (px). */
const FEET_Y = 13;
/** Height of the trinket above a pet's feet (px). */
const TRINKET_Y = -22;

/**
 * Worn cosmetics drawn on top of the world: footstep trails behind players and a trinket on their
 * pet. Colours come from cosmetic content; the lantern colour is the Lighting system's job.
 */
export class Cosmetics {
  private readonly trailClock = new Map<string, number>();
  private readonly trinkets = new Map<string, { g: Phaser.GameObjects.Graphics; id: string }>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** `pos` = where each actor is drawn this frame (interpolated). */
  update(actors: Record<string, Actor>, pos: (id: string) => { x: number; y: number } | null, dt: number): void {
    for (const a of Object.values(actors)) {
      if (a.kind !== "player" || !a.moving || a.action.kind === "dead") continue;
      const trail = a.cosmetics?.trail ? findCosmetic(a.cosmetics.trail) : undefined;
      if (!trail) continue;
      const t = (this.trailClock.get(a.id) ?? 0) + dt;
      if (t < TRAIL_EVERY) {
        this.trailClock.set(a.id, t);
        continue;
      }
      this.trailClock.set(a.id, 0);
      const p = pos(a.id);
      if (p) this.mote(p.x, p.y + FEET_Y, trail.color);
    }

    const seen = new Set<string>();
    for (const pet of Object.values(actors)) {
      if (pet.kind !== "pet" || !pet.owner || pet.action.kind === "dead") continue;
      const id = actors[pet.owner]?.cosmetics?.pet;
      const def = id ? findCosmetic(id) : undefined;
      const p = pos(pet.id);
      if (!def || !id || !p) continue;
      seen.add(pet.id);
      let t = this.trinkets.get(pet.id);
      if (!t || t.id !== id) {
        t?.g.destroy();
        t = { g: this.drawTrinket(def.shape ?? "bow", def.color), id };
        this.trinkets.set(pet.id, t);
      }
      t.g.setPosition(Math.round(p.x), Math.round(p.y + TRINKET_Y)).setDepth(p.y + 1);
    }
    for (const [petId, t] of this.trinkets)
      if (!seen.has(petId)) {
        t.g.destroy();
        this.trinkets.delete(petId);
      }
  }

  private mote(x: number, y: number, color: string): void {
    // Motes glow: drawn above the night (like magic), in their true colour.
    const size = Phaser.Math.Between(2, 4);
    const dot = this.scene.add
      .rectangle(x + Phaser.Math.Between(-5, 5), y + Phaser.Math.Between(-2, 2), size, size, hex(color))
      .setDepth(DEPTH_LIGHT + 2)
      .setAlpha(0.95);
    this.scene.tweens.add({ targets: dot, y: dot.y - Phaser.Math.Between(3, 8), alpha: 0, duration: TRAIL_LIFE, ease: "Sine.easeOut", onComplete: () => dot.destroy() });
  }

  /** Tiny pixel shapes, centred on (0, 0). */
  private drawTrinket(shape: "bow" | "crown" | "scarf" | "bell", color: string): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    const c = hex(color);
    g.fillStyle(c, 1);
    if (shape === "bow") {
      g.fillTriangle(-4, -2, -4, 2, 0, 0).fillTriangle(4, -2, 4, 2, 0, 0).fillRect(-1, -1, 2, 2);
    } else if (shape === "crown") {
      g.fillRect(-3, 0, 6, 2).fillTriangle(-3, 0, -3, -3, -1, 0).fillTriangle(-1, 0, 0, -4, 1, 0).fillTriangle(1, 0, 3, -3, 3, 0);
    } else if (shape === "scarf") {
      g.fillRect(-4, 4, 8, 2).fillRect(2, 6, 2, 3);
    } else {
      g.fillCircle(0, 0, 2).fillRect(-1, -3, 2, 1);
    }
    return g;
  }

  destroy(): void {
    for (const t of this.trinkets.values()) t.g.destroy();
    this.trinkets.clear();
  }
}
