import Phaser from "phaser";
import { COMBAT_COLORS, hex } from "@/config/palette";
import type { Actor } from "@/core/combat/actor";
import type { Facing } from "@/core/math/vec";

/** Pipoya sheets: 3 columns × 4 rows, rows ordered down, left, right, up. Walk cycle 0-1-2-1. */
const ROWS: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };
const FEET_OFFSET = 14; // sprite origin above the feet (frame is 32px tall, feet near the bottom)
const FLASH_MS = 70;

function lerpColor(a: number, b: number, k: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function ensureCharacterAnims(scene: Phaser.Scene, sheet: string): void {
  for (const [facing, row] of Object.entries(ROWS)) {
    const key = `${sheet}:walk-${facing}`;
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: [0, 1, 2, 1].map((c) => ({ key: sheet, frame: row * 3 + c })),
      frameRate: 8,
      repeat: -1,
    });
  }
}

/**
 * Renders one simulated actor: sprite, soft shadow, block glint, enemy health bar; y-sorted.
 * Holds no game rules: the scene feeds it the (interpolated) position and the actor state each frame.
 */
export class ActorView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly guard: Phaser.GameObjects.Graphics;
  private flashUntil = 0;
  private dying = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sheet: string,
    x: number,
    y: number,
    private readonly showBar: boolean
  ) {
    ensureCharacterAnims(scene, sheet);
    this.shadow = scene.add.image(x, y, "shadow").setAlpha(0.35);
    this.sprite = scene.add.sprite(x, y - FEET_OFFSET, sheet, ROWS.down * 3 + 1);
    this.bar = scene.add.graphics().setVisible(false);
    this.guard = scene.add.graphics().setVisible(false);
  }

  /** White flash on hit. */
  flash(): void {
    this.flashUntil = this.scene.time.now + FLASH_MS;
  }

  update(x: number, y: number, a: Actor): void {
    const act = a.action;
    const now = this.scene.time.now;
    let ox = 0;
    let oy = 0;
    // Telegraph shake during an enemy windup; recoil wobble when hurt/staggered.
    if (act.kind === "attack" && a.kind === "enemy" && !act.started) ox = Math.sin(now / 22) * 0.8;
    if (act.kind === "stagger") ox = Math.sin(now / 30) * 1.2;
    if (act.kind === "dodge") oy = -Math.sin((act.t / 0.34) * Math.PI) * 3;

    this.shadow.setPosition(x, y + 1).setDepth(y - 1);
    this.sprite.setPosition(Math.round(x + ox), Math.round(y - FEET_OFFSET + oy)).setDepth(y);

    if (act.kind === "dead") {
      if (!this.dying) {
        this.dying = true;
        this.sprite.stop();
        this.sprite.setFrame(ROWS[a.facing] * 3 + 1);
        this.scene.tweens.add({ targets: this.sprite, alpha: 0, angle: a.facing === "left" ? -90 : 90, duration: 700, ease: "Quad.easeIn" });
        this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 700 });
      }
      this.bar.setVisible(false);
      this.guard.setVisible(false);
      return;
    }
    if (this.dying) {
      // Respawned.
      this.dying = false;
      this.scene.tweens.killTweensOf([this.sprite, this.shadow]);
      this.sprite.setAlpha(1).setAngle(0);
      this.shadow.setAlpha(0.35);
    }

    if (a.moving) this.sprite.play(`${this.sheet}:walk-${a.facing}`, true);
    else {
      this.sprite.stop();
      // Attacks show the stride frame: reads as a lunge.
      const col = act.kind === "attack" && act.started ? 0 : 1;
      this.sprite.setFrame(ROWS[a.facing] * 3 + col);
    }

    // Tint: hit flash > enemy windup glow > i-frames shimmer.
    if (now < this.flashUntil) this.sprite.setTint(hex(COMBAT_COLORS.hitFlash)).setTintMode(Phaser.TintModes.FILL);
    else if (act.kind === "attack" && a.kind === "enemy" && !act.started) {
      const k = Math.min(1, act.t / 0.5);
      this.sprite.setTint(lerpColor(0xffffff, hex(COMBAT_COLORS.telegraph), k * 0.7)).setTintMode(Phaser.TintModes.MULTIPLY);
    } else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.sprite.setAlpha(a.iframes > 0 && act.kind !== "dodge" ? 0.55 + 0.45 * Math.round((now / 60) % 1) : act.kind === "dodge" ? 0.7 : 1);

    this.drawGuard(x, y, a);
    this.drawBar(x, y, a);
  }

  private drawGuard(x: number, y: number, a: Actor): void {
    const g = this.guard;
    if (a.blockSince === null) return void g.setVisible(false);
    const angle = Math.atan2(a.aim.y, a.aim.x);
    g.clear().setVisible(true).setDepth(y + 0.5);
    g.lineStyle(2, hex(COMBAT_COLORS.parry), 0.85);
    g.beginPath();
    g.arc(x, y - 8, 11, angle - 0.9, angle + 0.9);
    g.strokePath();
  }

  private drawBar(x: number, y: number, a: Actor): void {
    const g = this.bar;
    if (!this.showBar || a.hp >= a.stats.maxHp) return void g.setVisible(false);
    const w = 16;
    const left = Math.round(x - w / 2);
    const top = Math.round(y - 32);
    g.clear().setVisible(true).setDepth(100000);
    g.fillStyle(hex(COMBAT_COLORS.hpBarBack), 0.9).fillRect(left - 1, top - 1, w + 2, 4);
    g.fillStyle(hex(COMBAT_COLORS.hpBar), 1).fillRect(left, top, Math.max(1, Math.round((w * a.hp) / a.stats.maxHp)), 2);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.sprite, this.shadow]);
    this.sprite.destroy();
    this.shadow.destroy();
    this.bar.destroy();
    this.guard.destroy();
  }
}
