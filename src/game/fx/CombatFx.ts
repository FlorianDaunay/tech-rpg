import Phaser from "phaser";
import { COMBAT_COLORS, hex } from "@/config/palette";
import type { Actor } from "@/core/combat/actor";
import type { SimEvent } from "@/core/combat/events";
import { getMove, type Move } from "@/core/combat/moves";
import type { Projectile } from "@/core/combat/step";
import { audio, type SfxHandle } from "@/game/audio";
import { useSettings } from "@/store/settings";

/** Freeze-frame length per hit weight (ms). Short: the game must stay responsive. */
const HIT_STOP = { light: 45, medium: 70, heavy: 110 } as const;
const SHAKE = { light: 0.0015, medium: 0.003, heavy: 0.006 } as const;
const SLASH = { light: "vfx/slash-s", medium: "vfx/slash-m", heavy: "vfx/slash-l" } as const;

export interface FxHost {
  scene: Phaser.Scene;
  localId: string;
  actor(id: string): Actor | undefined;
  flash(id: string): void;
  /** Freeze the simulation for `ms` (hit-stop). */
  hitStop(ms: number): void;
  /** Run the simulation at `scale` speed for `ms` (perfect-parry slow-mo). */
  slowMo(scale: number, ms: number): void;
}

/**
 * Turns sim events into juice: sound, hit-stop, flashes, slashes, sparks, damage numbers, shake,
 * telegraphs. Pure presentation: nothing here changes the simulation.
 */
export class CombatFx {
  private readonly scene: Phaser.Scene;
  private charges = new Map<string, SfxHandle>();
  private projectiles = new Map<string, Phaser.GameObjects.Arc>();

  constructor(private readonly host: FxHost) {
    this.scene = host.scene;
    for (const key of ["vfx/slash-s", "vfx/slash-m", "vfx/slash-l", "vfx/impact-spark", "vfx/dust-puff", "vfx/burst-hollow"]) {
      if (this.scene.anims.exists(key) || !this.scene.textures.exists(key)) continue;
      const frames = this.scene.textures.get(key).frameTotal - 1;
      this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }), frameRate: 20 });
    }
  }

  handle(events: SimEvent[]): void {
    for (const ev of events) this.one(ev);
  }

  private one(ev: SimEvent): void {
    const h = this.host;
    switch (ev.type) {
      case "attack": {
        const a = h.actor(ev.id);
        if (a?.kind === "enemy") {
          this.telegraph(a, getMove(ev.move), ev.windup);
          audio.sfx("telegraph", { x: a.x, y: a.y, volume: 0.6 });
        }
        break;
      }
      case "charge": {
        const a = h.actor(ev.id);
        const handle = audio.sfx("swing-charge", { x: a?.x, y: a?.y, duration: 0.9 });
        if (handle) this.charges.set(ev.id, handle);
        break;
      }
      case "swing": {
        this.charges.get(ev.id)?.stop(0.05);
        this.charges.delete(ev.id);
        const move = getMove(ev.move);
        if (move.projectile) break;
        audio.sfx(ev.weight === "heavy" ? "swing-heavy" : "swing-light", { x: ev.x, y: ev.y });
        this.slash(ev.x, ev.y - 8, ev.dir, move);
        break;
      }
      case "hit": {
        h.flash(ev.target);
        const local = ev.target === h.localId;
        if (ev.blocked) {
          audio.sfx("block", { x: ev.x, y: ev.y });
          this.spark(ev.x, ev.y - 10, COMBAT_COLORS.blocked);
        } else {
          const target = h.actor(ev.target);
          const armored = target ? target.stats.defense >= 15 : false;
          audio.sfx(ev.crit ? "hit-crit" : armored ? "hit-armor" : "hit-flesh", { x: ev.x, y: ev.y });
          if (local) audio.sfx("hurt", { volume: 0.8 });
          this.spark(ev.x, ev.y - 10, ev.crit ? COMBAT_COLORS.crit : COMBAT_COLORS.slash);
        }
        this.number(ev.x, ev.y - 22, ev.amount, ev.blocked ? COMBAT_COLORS.blocked : local ? COMBAT_COLORS.damageTaken : ev.crit ? COMBAT_COLORS.crit : COMBAT_COLORS.damage, ev.crit);
        const involvesLocal = local || ev.attacker === h.localId;
        if (involvesLocal) {
          h.hitStop(HIT_STOP[ev.weight] * (ev.crit ? 1.5 : 1) * (ev.blocked ? 0.6 : 1));
          this.shake(SHAKE[ev.weight] * (local ? 1.4 : 1));
        }
        break;
      }
      case "parry":
        audio.sfx("perfect-parry", { x: ev.x, y: ev.y });
        this.spark(ev.x, ev.y - 10, COMBAT_COLORS.parry, 1.8);
        this.ring(ev.x, ev.y - 8, COMBAT_COLORS.parry);
        if (ev.target === h.localId) {
          h.hitStop(120);
          h.slowMo(0.35, 650);
          this.shake(0.004);
          this.scene.cameras.main.flash(90, 157, 231, 255, false);
        }
        break;
      case "guard-break":
      case "stagger": {
        const a = h.actor(ev.id);
        if (a) audio.sfx("parry", { x: a.x, y: a.y, volume: 0.7 });
        break;
      }
      case "dodge": {
        const a = h.actor(ev.id);
        if (!a) break;
        audio.sfx("dodge", { x: a.x, y: a.y });
        this.puff(a.x, a.y);
        break;
      }
      case "death": {
        const a = h.actor(ev.id);
        if (!a) break;
        audio.sfx(a.kind === "player" ? "death" : "enemy-die", { x: a.x, y: a.y });
        if (a.kind === "enemy") this.burst(a.x, a.y - 10);
        break;
      }
      case "respawn": {
        const a = h.actor(ev.id);
        if (a) audio.sfx("portal", { x: a.x, y: a.y, volume: 0.6 });
        break;
      }
      case "projectile":
        audio.sfx("projectile", { x: ev.x, y: ev.y, volume: 0.7 });
        break;
      case "projectile-end": {
        this.projectiles.get(ev.id)?.destroy();
        this.projectiles.delete(ev.id);
        this.spark(ev.x, ev.y, COMBAT_COLORS.enemyBolt, 0.8);
        break;
      }
      case "despawn":
        break;
    }
  }

  /** Stops charge risers whose actor stopped charging without swinging (dodged, got hit). */
  syncCharges(): void {
    for (const [id, handle] of this.charges) {
      const a = this.host.actor(id);
      if (a?.action.kind === "charge") continue;
      if (a?.action.kind === "attack") continue; // the swing event stops it
      handle.stop(0.08);
      this.charges.delete(id);
    }
  }

  /** Projectile visuals follow the sim's list (created lazily, removed on projectile-end). */
  syncProjectiles(list: Projectile[]): void {
    for (const p of list) {
      let view = this.projectiles.get(p.id);
      if (!view) {
        view = this.scene.add.circle(p.x, p.y, p.radius, hex(COMBAT_COLORS.enemyBolt)).setStrokeStyle(1, hex(COMBAT_COLORS.enemyBoltRim));
        this.scene.tweens.add({ targets: view, scale: 1.35, yoyo: true, repeat: -1, duration: 120 });
        this.projectiles.set(p.id, view);
      }
      view.setPosition(p.x, p.y).setDepth(p.y + 6);
    }
  }

  private telegraph(a: Actor, move: Move, windup: number): void {
    const color = hex(COMBAT_COLORS.telegraph);
    let img: Phaser.GameObjects.Image;
    if (move.projectile) return; // ranged: the glowing windup tint is the tell
    if (move.hitbox.kind === "circle") {
      const r = move.hitbox.radius;
      img = this.scene.add.image(a.x + a.aim.x * move.hitbox.offset, a.y + a.aim.y * move.hitbox.offset, "vfx/telegraph-circle-fill");
      img.setDisplaySize(r * 2, r * 2);
    } else {
      // Cone art is 60° wide, origin at its tip, pointing right.
      img = this.scene.add.image(a.x, a.y, "vfx/telegraph-cone").setOrigin(1 / 64, 0.5);
      const range = move.hitbox.range + (move.lunge > 0 ? 10 : 0);
      img.setScale(range / 63, Math.max(0.6, move.hitbox.angle / 60) * (range / 63));
      img.setRotation(Math.atan2(a.aim.y, a.aim.x));
    }
    img.setTint(color).setAlpha(0.15).setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: img,
      alpha: 0.55,
      duration: windup * 1000,
      ease: "Quad.easeIn",
      onComplete: () => this.scene.tweens.add({ targets: img, alpha: 0, duration: 120, onComplete: () => img.destroy() }),
    });
  }

  private slash(x: number, y: number, dir: { x: number; y: number }, move: Move): void {
    const key = SLASH[move.weight];
    if (!this.scene.textures.exists(key)) return;
    const reach = move.hitbox.kind === "arc" ? move.hitbox.range * 0.45 : move.hitbox.offset;
    const s = this.scene.add.sprite(x + dir.x * reach, y + dir.y * reach, key).setRotation(Math.atan2(dir.y, dir.x));
    s.setTint(hex(COMBAT_COLORS.slash)).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 20);
    if (move.hitbox.kind === "circle") s.setScale((move.hitbox.radius * 2) / s.width);
    s.play(key);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  private spark(x: number, y: number, color: string, scale = 1): void {
    if (!this.scene.textures.exists("vfx/impact-spark")) return;
    const s = this.scene.add.sprite(x, y, "vfx/impact-spark").setTint(hex(color)).setBlendMode(Phaser.BlendModes.ADD);
    s.setScale(scale).setDepth(y + 40).setRotation(Math.random() * Math.PI);
    s.play("vfx/impact-spark");
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  private puff(x: number, y: number): void {
    if (!this.scene.textures.exists("vfx/dust-puff")) return;
    const s = this.scene.add.sprite(x, y - 4, "vfx/dust-puff").setAlpha(0.8).setDepth(y - 2);
    s.play("vfx/dust-puff");
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  private burst(x: number, y: number): void {
    if (!this.scene.textures.exists("vfx/burst-hollow")) return;
    const s = this.scene.add.sprite(x, y, "vfx/burst-hollow").setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 30);
    s.play("vfx/burst-hollow");
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  private ring(x: number, y: number, color: string): void {
    const c = this.scene.add.circle(x, y, 6).setStrokeStyle(2, hex(color)).setDepth(y + 50);
    this.scene.tweens.add({ targets: c, scale: 4, alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => c.destroy() });
  }

  /** Floating damage number. Rendered at device resolution so it stays crisp under camera zoom. */
  private number(x: number, y: number, amount: number, color: string, crit: boolean): void {
    const cam = this.scene.cameras.main;
    const text = this.scene.add
      .text(x + (Math.random() - 0.5) * 8, y, String(amount), {
        fontFamily: "Silkscreen, monospace",
        fontSize: crit ? "10px" : "8px",
        color,
        stroke: "#14100c",
        strokeThickness: 2,
        resolution: Math.max(1, cam.zoom * (window.devicePixelRatio || 1)),
      })
      .setOrigin(0.5, 1)
      .setDepth(100001);
    if (crit) text.setScale(1.6);
    this.scene.tweens.add({ targets: text, scale: 1, duration: 140, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: text, y: y - 14, alpha: 0, delay: 250, duration: 450, ease: "Quad.easeIn", onComplete: () => text.destroy() });
  }

  private shake(intensity: number): void {
    const k = useSettings.getState().screenShake;
    if (k > 0) this.scene.cameras.main.shake(90, intensity * k);
  }

  destroy(): void {
    this.charges.forEach((c) => c.stop(0.05));
    this.charges.clear();
    this.projectiles.forEach((p) => p.destroy());
    this.projectiles.clear();
  }
}
