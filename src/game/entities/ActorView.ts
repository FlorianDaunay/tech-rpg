import Phaser from "phaser";
import { COMBAT_COLORS, ELEMENT_COLORS, hex } from "@/config/palette";
import type { Actor } from "@/core/combat/actor";
import { ELEMENTS, getStatus } from "@/core/combat/defs";
import { DEPTH_LIGHT } from "../systems/Lighting";
import type { Facing } from "@/core/math/vec";

/** Pipoya sheets: 3 columns × 4 rows, rows ordered down, left, right, up. Walk cycle 0-1-2-1. */
const ROWS: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };
const FEET_OFFSET = 14; // sprite origin above the feet (frame is 32px tall, feet near the bottom)
/** Boss sheets (96×96, 3 idle frames, no facings): origin above the feet, shadow scale. */
const BIG = { feet: 38, shadow: 3.2 };

/** Boss sheets: one row, idle loop 0-1-2-1. */
export function ensureBossAnim(scene: Phaser.Scene, sheet: string): void {
  const key = `${sheet}:idle`;
  if (scene.anims.exists(key)) return;
  scene.anims.create({ key, frames: [0, 1, 2, 1].map((frame) => ({ key: sheet, frame })), frameRate: 5, repeat: -1 });
}
const FLASH_MS = 70;
/** Element glyph strip (frames in ELEMENTS order) and the soft light used for the feet aura. */
const ICONS = "vfx/element-icons";
const AURA = "vfx/light-soft";
/** Icon pitch (px) and how long before a status ends its icon starts blinking (s). */
const ICON_STEP = 10;
const EXPIRING = 0.7;

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
  /** Elemental statuses: glyphs over the head (stack pips under them) and a tinted glow at the feet. */
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly aura: Phaser.GameObjects.Image;
  /** Name tag (other players online), created on first use. */
  private tag: Phaser.GameObjects.Text | null = null;
  private flashUntil = 0;
  private dying = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly sheet: string,
    x: number,
    y: number,
    private readonly showBar: boolean,
    /** Boss sheet: idle loop, big shadow, no overhead bar (the HUD shows a boss bar). */
    private readonly big = false
  ) {
    if (big) ensureBossAnim(scene, sheet);
    else ensureCharacterAnims(scene, sheet);
    this.shadow = scene.add.image(x, y, "shadow").setAlpha(0.35).setScale(big ? BIG.shadow : 1);
    this.sprite = big ? scene.add.sprite(x, y - BIG.feet, sheet, 0).play(`${sheet}:idle`) : scene.add.sprite(x, y - FEET_OFFSET, sheet, ROWS.down * 3 + 1);
    this.bar = scene.add.graphics().setVisible(false);
    this.guard = scene.add.graphics().setVisible(false);
    this.pips = scene.add.graphics().setVisible(false).setDepth(DEPTH_LIGHT + 2);
    this.aura = scene.add.image(x, y, AURA).setVisible(false).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_LIGHT + 1);
  }

  /** Name over the head (null hides it). Cheap to call every frame. */
  setName(name: string | null): void {
    if (!name) return void this.tag?.setVisible(false);
    if (!this.tag) {
      const cam = this.scene.cameras.main;
      this.tag = this.scene.add
        .text(0, 0, name, { fontFamily: "Silkscreen, monospace", fontSize: "7px", color: COMBAT_COLORS.allyName, stroke: COMBAT_COLORS.textStroke, strokeThickness: 2, resolution: Math.max(1, cam.zoom * (window.devicePixelRatio || 1)) })
        .setOrigin(0.5, 1)
        .setDepth(100001);
    }
    if (this.tag.text !== name) this.tag.setText(name);
    this.tag.setVisible(true);
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
    this.tag?.setPosition(Math.round(x), Math.round(y - 35)).setAlpha(act.kind === "dead" ? 0.5 : 1);
    this.drawStatuses(x, y, a, now);
    if (this.big) return this.updateBig(x + ox * 2, y, a, now);
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

  /** Bosses: idle loop always, bob when moving, glow while winding up, slow dissolve on death. */
  private updateBig(x: number, y: number, a: Actor, now: number): void {
    const act = a.action;
    const bob = a.moving ? Math.sin(now / 90) * 1.5 : Math.sin(now / 400);
    this.sprite.setPosition(Math.round(x), Math.round(y - BIG.feet + bob)).setDepth(y);
    if (a.aim.x) this.sprite.setFlipX(a.aim.x < 0);
    if (act.kind === "dead") {
      if (!this.dying) {
        this.dying = true;
        this.sprite.stop();
        this.scene.tweens.add({ targets: this.sprite, alpha: 0, scaleY: 0.6, duration: 1800, ease: "Quad.easeIn" });
        this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 1800 });
      }
      return;
    }
    if (now < this.flashUntil) this.sprite.setTint(hex(COMBAT_COLORS.hitFlash)).setTintMode(Phaser.TintModes.FILL);
    else if (act.kind === "attack" && !act.started) {
      const k = Math.min(1, act.t / 0.6);
      this.sprite.setTint(lerpColor(0xffffff, hex(COMBAT_COLORS.telegraph), k * 0.8)).setTintMode(Phaser.TintModes.MULTIPLY);
    } else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.sprite.setAlpha(a.iframes > 0 ? 0.7 + 0.3 * Math.round((now / 80) % 1) : 1);
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

  /**
   * One glyph per elemental status, element-coloured, above the head (above the darkness so it reads
   * at night); pips under it count stacks; it blinks just before running out. The feet glow takes
   * the colour of the newest one, so an afflicted enemy reads at a glance even in a crowd.
   */
  private drawStatuses(x: number, y: number, a: Actor, now: number): void {
    const shown = a.action.kind === "dead" || !this.scene.textures.exists(ICONS) ? [] : a.statuses.flatMap((st) => {
      const def = getStatus(st.id);
      return def.element ? [{ st, def, element: def.element }] : [];
    });
    while (this.icons.length < shown.length) this.icons.push(this.scene.add.image(0, 0, ICONS, 0).setDepth(DEPTH_LIGHT + 2));
    const top = Math.round(y - (this.big ? 92 : 40));
    const left = Math.round(x - ((shown.length - 1) * ICON_STEP) / 2);
    const pips = this.pips.clear().setVisible(shown.length > 0);
    this.icons.forEach((icon, i) => {
      const s = shown[i];
      if (!s) return void icon.setVisible(false);
      const remaining = s.def.duration - s.st.t;
      const blink = remaining < EXPIRING && Math.floor(now / 90) % 2 === 0;
      const ix = left + i * ICON_STEP;
      const color = hex(ELEMENT_COLORS[s.element]);
      // Pop in on apply/re-apply (t restarts at 0).
      const pop = s.st.t < 0.15 ? 1 + (0.15 - s.st.t) * 4 : 1;
      icon.setVisible(true).setFrame(ELEMENTS.indexOf(s.element)).setTint(color).setPosition(ix, top).setScale(pop).setAlpha(blink ? 0.35 : 1);
      if (s.def.maxStacks > 1)
        for (let k = 0; k < s.st.stacks; k++) pips.fillStyle(color, blink ? 0.35 : 1).fillRect(ix - s.def.maxStacks + 2 * k, top + 6, 1, 1);
    });
    const newest = shown.reduce<(typeof shown)[number] | undefined>((best, s) => (!best || s.st.t < best.st.t ? s : best), undefined);
    if (!newest) return void this.aura.setVisible(false);
    const breath = 0.75 + 0.25 * Math.sin(now / 160);
    const size = this.big ? 90 : 34;
    this.aura
      .setVisible(true)
      .setTint(hex(ELEMENT_COLORS[newest.element]))
      .setPosition(x, y - 2)
      .setDisplaySize(size, size * 0.45)
      .setAlpha(0.45 * breath);
  }

  private drawBar(x: number, y: number, a: Actor): void {
    const g = this.bar;
    if (!this.showBar || a.hp >= a.stats.maxHp) return void g.setVisible(false);
    const w = 16;
    const left = Math.round(x - w / 2);
    const top = Math.round(y - 32);
    g.clear().setVisible(true).setDepth(100000);
    g.fillStyle(hex(COMBAT_COLORS.hpBarBack), 0.9).fillRect(left - 1, top - 1, w + 2, 4);
    g.fillStyle(hex(a.kind === "player" ? COMBAT_COLORS.allyHpBar : COMBAT_COLORS.hpBar), 1).fillRect(left, top, Math.max(1, Math.round((w * a.hp) / a.stats.maxHp)), 2);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.sprite, this.shadow]);
    this.sprite.destroy();
    this.shadow.destroy();
    this.bar.destroy();
    this.guard.destroy();
    this.tag?.destroy();
    this.icons.forEach((i) => i.destroy());
    this.pips.destroy();
    this.aura.destroy();
  }
}
