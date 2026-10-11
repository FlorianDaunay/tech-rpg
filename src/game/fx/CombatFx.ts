import Phaser from "phaser";
import { DEPTH_LIGHT } from "../systems/Lighting";
import { ensureProjectileTexture, MOTE, projectileStyle, trailTints } from "./projectileArt";
import { COMBAT_COLORS, ELEMENT_COLORS, hex, RARITY_COLORS, type PROJECTILE_RAMPS, type Rarity } from "@/config/palette";
import type { Actor } from "@/core/combat/actor";
import type { SimEvent } from "@/core/combat/events";
import { content } from "@/content/registry";
import { baseOf, getMove, type Element } from "@/core/combat/defs";
import type { Move } from "@/core/combat/moves";
import type { Pickup, Projectile } from "@/core/combat/step";
import { audio, type SfxHandle } from "@/game/audio";
import { getLang, t, type I18nKey } from "@/i18n";
import { useSettings } from "@/store/settings";

/** Freeze-frame length per hit weight (ms). Short: the game must stay responsive. */
const HIT_STOP = { light: 45, medium: 70, heavy: 110 } as const;
const SHAKE = { light: 0.0015, medium: 0.003, heavy: 0.006 } as const;
const SLASH = { light: "vfx/slash-s", medium: "vfx/slash-m", heavy: "vfx/slash-l" } as const;

/** Light colour (palette LIGHT_COLORS key) per element for reaction flashes. */
const ELEMENT_LIGHT = { ember: "torch", frost: "moon", storm: "moon", hollow: "rift" } as const;

const ELEMENT_SFX = { ember: "ember-burst", frost: "frost-shatter", storm: "storm-zap", hollow: "hollow-pulse" } as const;

const statusName = (name: { en: string; fr?: string }) => (getLang() === "fr" ? (name.fr ?? name.en) : name.en);

function itemRarity(key: string): Rarity {
  const id = baseOf(key);
  return (content.swords.find(id) ?? content.shields.find(id) ?? content.items.find(id))?.rarity ?? "common";
}

export interface FxHost {
  scene: Phaser.Scene;
  localId: string;
  actor(id: string): Actor | undefined;
  flash(id: string): void;
  /** Freeze the simulation for `ms` (hit-stop). */
  hitStop(ms: number): void;
  /** Run the simulation at `scale` speed for `ms` (perfect-parry slow-mo). */
  slowMo(scale: number, ms: number): void;
  /** Brief burst of light in the night (reactions, parries). */
  light?(x: number, y: number, radius: number, color: string): void;
}

/**
 * Turns sim events into juice: sound, hit-stop, flashes, slashes, sparks, damage numbers, shake,
 * telegraphs. Pure presentation: nothing here changes the simulation.
 */
export class CombatFx {
  private readonly scene: Phaser.Scene;
  private charges = new Map<string, SfxHandle>();
  private projectiles = new Map<string, { img: Phaser.GameObjects.Image; look: string; palette: keyof typeof PROJECTILE_RAMPS }>();
  /** One trail emitter per projectile palette (motes emitted along each flight). */
  private trails = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private pickups = new Map<string, Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Depth>();

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
        if (move.projectile || move.hazard) break;
        audio.sfx(ev.weight === "heavy" ? "swing-heavy" : "swing-light", { x: ev.x, y: ev.y });
        // Area moves centred on the attacker (Frost Nova, Dawnbreak): a burst instead of a slash.
        const area = move.hitbox.kind === "circle" && move.hitbox.offset === 0 ? move.hitbox.radius : 0;
        if (area >= 40) {
          if (move.element) this.elementBurst(ev.x, ev.y - 6, move.element, area);
          h.light?.(ev.x, ev.y - 6, area * 1.6, move.element ? ELEMENT_LIGHT[move.element] : "lantern");
          if (area >= 80) this.shake(0.008);
        } else this.slash(ev.x, ev.y - 8, ev.dir, move);
        break;
      }
      case "skill": {
        const a = h.actor(ev.id);
        const def = content.skills.find(ev.skill);
        if (!a || !def) break;
        const move = getMove(def.move);
        if (move.element) audio.sfx(ELEMENT_SFX[move.element], { x: a.x, y: a.y, volume: ev.slot === "ultimate" ? 1 : 0.6 });
        if (ev.slot === "ultimate") {
          audio.sfx("swing-charge", { x: a.x, y: a.y });
          this.ring(a.x, a.y - 10, COMBAT_COLORS.levelUp, 3);
        }
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
          if (ev.element && ev.weight !== "medium") audio.sfx(ELEMENT_SFX[ev.element], { x: ev.x, y: ev.y, volume: 0.35 });
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
        h.light?.(ev.x, ev.y - 8, 70, "moon");
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
      case "level-up": {
        const a = h.actor(ev.id);
        if (!a) break;
        if (ev.id === h.localId) audio.sfx("level-up");
        h.light?.(a.x, a.y - 10, 90, "lantern");
        this.ring(a.x, a.y - 10, COMBAT_COLORS.levelUp, 6);
        this.label(a.x, a.y - 34, t("fx.levelUp"), COMBAT_COLORS.levelUp);
        break;
      }
      case "mastery-up": {
        const a = h.actor(ev.id);
        if (!a) break;
        if (ev.id === h.localId) audio.sfx("notify", { volume: 0.7 });
        this.label(a.x, a.y - 44, t("fx.masteryUp", { family: t(`family.${ev.family}` as I18nKey), level: ev.level }), COMBAT_COLORS.levelUp);
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
      case "hazard": {
        this.hazard(ev.x, ev.y, ev.radius, ev.delay, getMove(ev.move));
        break;
      }
      case "hazard-blast": {
        this.blast(ev.x, ev.y, ev.radius, getMove(ev.move));
        audio.sfx("explosion", { x: ev.x, y: ev.y, volume: 0.7 });
        this.shake(0.003);
        h.light?.(ev.x, ev.y, ev.radius * 2.2, "torch");
        break;
      }
      case "projectile-end": {
        const end = this.projectiles.get(ev.id);
        if (end && end.look !== "arrow") {
          const motes = this.trail(end.palette);
          for (let i = 0; i < 6; i++) motes.emitParticleAt(ev.x, ev.y, 1);
        }
        end?.img.destroy();
        this.projectiles.delete(ev.id);
        this.spark(ev.x, ev.y, COMBAT_COLORS.enemyBolt, 0.8);
        break;
      }
      case "status": {
        const a = h.actor(ev.id);
        const def = content.statuses.find(ev.status);
        if (a && def) this.label(a.x, a.y - 30, statusName(def.name), def.element ? ELEMENT_COLORS[def.element] : COMBAT_COLORS.parry);
        break;
      }
      case "status-tick": {
        const def = content.statuses.find(ev.status);
        this.number(ev.x, ev.y - 20, ev.amount, def?.element ? ELEMENT_COLORS[def.element] : COMBAT_COLORS.damage, false, true);
        break;
      }
      case "reaction": {
        const def = content.reactions.find(ev.reaction);
        if (!def) break;
        audio.sfx(ELEMENT_SFX[def.by], { x: ev.x, y: ev.y });
        this.elementBurst(ev.x, ev.y - 8, def.by, ev.radius);
        h.light?.(ev.x, ev.y - 8, Math.max(60, ev.radius * 2.2), ELEMENT_LIGHT[def.by]);
        this.label(ev.x, ev.y - 36, statusName(def.name), ELEMENT_COLORS[def.by]);
        if (h.actor(ev.target)?.kind === "enemy") h.hitStop(60);
        this.shake(0.003);
        break;
      }
      case "drop":
        break;
      case "pickup": {
        if (ev.actor !== h.localId) break;
        const rarity = itemRarity(ev.item);
        audio.sfx(ev.item === "gold" ? "pickup-coin" : rarity === "common" || rarity === "uncommon" ? "pickup-item" : "pickup-rare", { volume: 0.7 });
        this.pickups.get(ev.id)?.destroy();
        this.pickups.delete(ev.id);
        break;
      }
      case "arena": {
        audio.sfx("door", { x: ev.x, y: ev.y, volume: 0.9 });
        audio.sfx(ev.sealed ? "ember-burst" : "portal", { x: ev.x, y: ev.y, volume: 0.6 });
        this.shake(ev.sealed ? 0.006 : 0.003);
        h.light?.(ev.x, ev.y, ev.radius * 1.2, ev.sealed ? "torch" : "lantern");
        break;
      }
      case "portal-open": {
        audio.sfx("portal", { x: ev.x, y: ev.y, volume: 1 });
        audio.sfx("quest-complete", { volume: 0.5 });
        this.shake(0.003);
        h.light?.(ev.x, ev.y, 120, "rift");
        break;
      }
      case "boss-phase": {
        const a = h.actor(ev.id);
        if (!a) break;
        audio.sfx("explosion", { x: a.x, y: a.y, volume: 0.9 });
        audio.sfx("hollow-pulse", { x: a.x, y: a.y });
        this.shake(0.014);
        h.light?.(a.x, a.y - 30, 160, "rift");
        this.ring(a.x, a.y - 30, COMBAT_COLORS.telegraph, 14);
        this.label(a.x, a.y - 80, t("fx.bossPhase"), COMBAT_COLORS.telegraph);
        break;
      }
      case "spawn": {
        const a = h.actor(ev.id);
        if (!a) break;
        this.burst(a.x, a.y - 10);
        audio.sfx("portal", { x: a.x, y: a.y, volume: 0.35 });
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

  /** Loot on the ground: gold coins, rarity-coloured gems, or the weapon/shield icon. Bobs and glints. */
  syncPickups(list: Pickup[]): void {
    const alive = new Set<string>();
    for (const p of list) {
      alive.add(p.id);
      let view = this.pickups.get(p.id);
      if (!view) {
        view = this.makePickup(p.item);
        this.pickups.set(p.id, view);
      }
      view.setPosition(Math.round(p.x), Math.round(p.y - 4 - Math.abs(Math.sin(p.t * 4)) * 2)).setDepth(p.y);
    }
    for (const [id, view] of this.pickups) {
      if (alive.has(id)) continue;
      view.destroy();
      this.pickups.delete(id);
    }
  }

  private makePickup(key: string) {
    const item = baseOf(key);
    const icon = content.swords.find(item)?.icon ?? content.shields.find(item)?.icon ?? content.items.find(item)?.icon;
    if (icon && this.scene.textures.exists(icon)) return this.scene.add.image(0, 0, icon).setScale(0.5);
    if (item === "gold") return this.scene.add.circle(0, 0, 2.5, hex(COMBAT_COLORS.crit)).setStrokeStyle(1, hex(COMBAT_COLORS.goldRim));
    const c = hex(RARITY_COLORS[itemRarity(item)]);
    return this.scene.add.rectangle(0, 0, 4, 4, c).setAngle(45).setStrokeStyle(1, hex(COMBAT_COLORS.goldRim));
  }

  /** Projectile visuals follow the sim's list (created lazily, removed on projectile-end). */
  syncProjectiles(list: Projectile[]): void {
    const now = this.scene.time.now;
    for (const p of list) {
      let view = this.projectiles.get(p.id);
      if (!view) {
        const { look, palette } = projectileStyle(getMove(p.move));
        const img = this.scene.add.image(p.x, p.y, ensureProjectileTexture(this.scene, look, palette)).setBlendMode(look === "arrow" ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
        view = { img, look, palette };
        this.projectiles.set(p.id, view);
      }
      const { img, look } = view;
      const angle = Math.atan2(p.vy, p.vx);
      // Magic glows through the darkness (drawn above the lighting); arrows sort with the world.
      img.setPosition(p.x, p.y).setDepth(look === "arrow" ? p.y + 6 : DEPTH_LIGHT + 3);
      if (look === "orb" || look === "web") img.setRotation(now / (look === "web" ? 160 : 90));
      else img.setRotation(angle);
      if (look === "spark") img.setFlipY(Math.floor(now / 50) % 2 === 0);
      if (look === "orb" || look === "bolt") img.setScale(1 + 0.12 * Math.sin(now / 45 + p.x));
      if (look !== "arrow") this.trail(view.palette).emitParticleAt(p.x - Math.cos(angle) * 5, p.y - Math.sin(angle) * 5, 1);
    }
  }

  private trail(palette: keyof typeof PROJECTILE_RAMPS): Phaser.GameObjects.Particles.ParticleEmitter {
    let e = this.trails.get(palette);
    if (!e) {
      ensureProjectileTexture(this.scene, "orb", palette);
      e = this.scene.add.particles(0, 0, MOTE, {
        lifespan: { min: 180, max: 320 },
        speed: { min: 2, max: 14 },
        scale: { start: 1.2, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: trailTints(palette),
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      e.setDepth(DEPTH_LIGHT + 2);
      this.trails.set(palette, e);
    }
    return e;
  }

  /** Ground blast telegraph: a ring whose fill grows to the edge exactly when it bursts. */
  private hazard(x: number, y: number, radius: number, delay: number, move: Move): void {
    const color = hex(move.element ? ELEMENT_COLORS[move.element] : COMBAT_COLORS.telegraph);
    const ring = this.scene.add.circle(x, y, radius).setStrokeStyle(1.5, color, 0.9).setFillStyle(color, 0.08).setDepth(DEPTH_LIGHT + 1).setBlendMode(Phaser.BlendModes.ADD);
    const fill = this.scene.add.circle(x, y, radius, color, 0.32).setDepth(DEPTH_LIGHT + 1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.05);
    this.scene.tweens.add({ targets: fill, scale: 1, duration: delay * 1000, ease: "Quad.easeIn" });
    this.scene.tweens.add({ targets: ring, alpha: { from: 0.5, to: 1 }, duration: 160, yoyo: true, repeat: Math.max(0, Math.floor((delay * 1000) / 320) - 1) });
    this.scene.time.delayedCall(delay * 1000 + 40, () => {
      ring.destroy();
      fill.destroy();
    });
  }

  private blast(x: number, y: number, radius: number, move: Move): void {
    const color = hex(move.element ? ELEMENT_COLORS[move.element] : COMBAT_COLORS.telegraph);
    const wave = this.scene.add.circle(x, y, radius * 0.4).setStrokeStyle(3, color, 1).setDepth(DEPTH_LIGHT + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: wave, scale: 2.6, alpha: 0, duration: 320, ease: "Cubic.easeOut", onComplete: () => wave.destroy() });
    const core = this.scene.add.circle(x, y, radius, color, 0.55).setDepth(DEPTH_LIGHT + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: core, alpha: 0, scale: 1.2, duration: 260, onComplete: () => core.destroy() });
    const motes = this.trail(move.element ?? "none");
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      motes.emitParticleAt(x + Math.cos(a) * radius * 0.6, y + Math.sin(a) * radius * 0.6, 1);
    }
  }

  private telegraph(a: Actor, move: Move, windup: number): void {
    const color = hex(COMBAT_COLORS.telegraph);
    let img: Phaser.GameObjects.Image;
    if (move.projectile || move.hazard) return; // ranged: the glowing windup tint is the tell; blasts: their ground circle
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
    img.setTint(color).setAlpha(0.15).setDepth(DEPTH_LIGHT + 1).setBlendMode(Phaser.BlendModes.ADD);
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

  private elementBurst(x: number, y: number, element: Element, radius: number): void {
    const key = `vfx/burst-${element}`;
    if (this.scene.textures.exists(key)) {
      if (!this.scene.anims.exists(key)) {
        const frames = this.scene.textures.get(key).frameTotal - 1;
        this.scene.anims.create({ key, frames: this.scene.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }), frameRate: 16 });
      }
      const s = this.scene.add.sprite(x, y, key).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 30);
      // Big areas (ultimate) lean on the ring: past ~2.5× the 48 px sprite turns into a white blob.
      s.setScale(Math.min(2.5, Math.max(0.8, (radius * 2.2) / 48)));
      s.play(key);
      s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    }
    if (radius > 0) this.ring(x, y, ELEMENT_COLORS[element], radius / 6);
  }

  /** Short floating word (status applied, reaction name). */
  private label(x: number, y: number, text: string, color: string): void {
    if (!text) return;
    const cam = this.scene.cameras.main;
    const t = this.scene.add
      .text(x, y, text, { fontFamily: "Silkscreen, monospace", fontSize: "7px", color, stroke: "#14100c", strokeThickness: 2, resolution: Math.max(1, cam.zoom * (window.devicePixelRatio || 1)) })
      .setOrigin(0.5, 1)
      .setDepth(100002);
    this.scene.tweens.add({ targets: t, y: y - 10, alpha: 0, delay: 500, duration: 500, onComplete: () => t.destroy() });
  }

  private ring(x: number, y: number, color: string, scale = 4): void {
    const c = this.scene.add.circle(x, y, 6).setStrokeStyle(2, hex(color)).setDepth(y + 50);
    this.scene.tweens.add({ targets: c, scale, alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => c.destroy() });
  }

  /** Floating damage number. Rendered at device resolution so it stays crisp under camera zoom. */
  private number(x: number, y: number, amount: number, color: string, crit: boolean, small = false): void {
    const cam = this.scene.cameras.main;
    const text = this.scene.add
      .text(x + (Math.random() - 0.5) * 8, y, String(amount), {
        fontFamily: "Silkscreen, monospace",
        fontSize: crit ? "10px" : small ? "6px" : "8px",
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
    this.projectiles.forEach((p) => p.img.destroy());
    this.projectiles.clear();
    this.trails.forEach((e) => e.destroy());
    this.trails.clear();
    this.pickups.forEach((p) => p.destroy());
    this.pickups.clear();
  }
}
