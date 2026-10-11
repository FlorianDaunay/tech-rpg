import Phaser from "phaser";
import { ARENA_COLORS, hex } from "@/config/palette";
import type { Arena } from "@/core/sim/state";
import { DEPTH_GROUND } from "../world/renderMap";
import { DEPTH_LIGHT } from "./Lighting";

/** Px between two pillars along the ring. */
const SPACING = 13;
const RISE_MS = 450;
const TEXTURE = "arena/pillar-2";
const MOTE = "arena/mote";
const PILLAR = { w: 9, h: 30 };
/** Rune marks around the sigil band. */
const RUNES = 24;

/** One ember-crystal pillar with a flame tip, generated once per game (canvas texture, not a DynamicTexture). */
function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(MOTE)) {
    const m = scene.make.graphics({}, false);
    m.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2).generateTexture(MOTE, 2, 2);
    m.destroy();
  }
  if (scene.textures.exists(TEXTURE)) return;
  const g = scene.make.graphics({}, false);
  const { w, h } = PILLAR;
  const px = (x: number, y: number, c: string, ww = 1, hh = 1) => g.fillStyle(hex(c), 1).fillRect(x, y, ww, hh);
  // Faceted crystal body: dark outline, ember faces, bright core seam, wider base.
  px(1, 8, ARENA_COLORS.outline, w - 2, h - 8);
  px(0, h - 4, ARENA_COLORS.outline, w, 4);
  px(2, 6, ARENA_COLORS.outline, w - 4, 2);
  px(2, 9, ARENA_COLORS.pillar, w - 4, h - 12);
  px(1, h - 3, ARENA_COLORS.pillar, w - 2, 2);
  px(2, 9, ARENA_COLORS.glow, 2, h - 14);
  px(4, 8, ARENA_COLORS.core, 1, h - 12);
  px(3, 7, ARENA_COLORS.pillar, 3, 1);
  // Flame tip.
  px(3, 2, ARENA_COLORS.glow, 3, 5);
  px(4, 0, ARENA_COLORS.core, 1, 6);
  px(2, 4, ARENA_COLORS.pillar, 1, 2);
  px(6, 3, ARENA_COLORS.pillar, 1, 3);
  g.generateTexture(TEXTURE, w, h);
  g.destroy();
}

/**
 * Boss arenas. Before the fight: a faint runic circle on the ground marks the Herald's territory.
 * Sealed: the sigil flares (double ring, turning runes, spokes; drawn above the darkness so it reads
 * in the darkest zones), a ring of flame-tipped crystal pillars rises (each y-sorted so the wall
 * wraps around characters and trees) and embers stream off it. Opening sinks it all again.
 */
export class ArenaWalls {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly sigil: Phaser.GameObjects.Graphics;
  private readonly embers: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly pillars = new Map<string, Phaser.GameObjects.Image[]>();
  /** Per boss: when the wall started rising (ms), or falling (negative ms). */
  private readonly since = new Map<string, number>();

  constructor(private readonly scene: Phaser.Scene) {
    ensureTextures(scene);
    // Just above the ground tile layers, below every object and character.
    this.ground = scene.add.graphics().setDepth(DEPTH_GROUND + 50);
    this.sigil = scene.add.graphics().setDepth(DEPTH_LIGHT + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.embers = scene.add
      .particles(0, 0, MOTE, {
        lifespan: { min: 700, max: 1400 },
        speedY: { min: -46, max: -18 },
        speedX: { min: -8, max: 8 },
        scale: { start: 1.3, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [hex(ARENA_COLORS.glow), hex(ARENA_COLORS.core), hex(ARENA_COLORS.pillar)],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH_LIGHT + 2);
  }

  /** Wall raised / lowered: start its animation. */
  toggle(boss: string, sealed: boolean): void {
    this.since.set(boss, sealed ? this.scene.time.now : -this.scene.time.now);
  }

  update(arenas: readonly Arena[]): void {
    const now = this.scene.time.now;
    this.ground.clear();
    this.sigil.clear();
    // Arenas gone from the sim (boss dead and despawned) leave no pillars behind.
    for (const [boss, list] of this.pillars) if (!arenas.some((r) => r.boss === boss)) for (const img of list) img.setVisible(false);
    for (const r of arenas) {
      const t = this.since.get(r.boss);
      // 0..1 height: rising after a seal, sinking after it opens.
      const k = r.sealed ? Math.min(1, (now - (t !== undefined && t >= 0 ? t : now - RISE_MS)) / RISE_MS) : t !== undefined && t < 0 ? Math.max(0, 1 - (now + t) / RISE_MS) : 0;
      this.drawSigil(r, k, now);
      const ring = this.ring(r);
      for (const [i, img] of ring.entries()) {
        img.setVisible(k > 0);
        if (k <= 0) continue;
        const flicker = 0.85 + 0.15 * Math.sin(now / 110 + (i >> 1) * 1.9);
        // Even = pillar, odd = its halo.
        if (i % 2 === 0) img.setScale(1, k * flicker);
        else img.setScale(1.8, 1.2 * k).setAlpha(0.1 + 0.08 * flicker);
      }
      // Embers stream up off the wall while it stands.
      if (k >= 1 && Math.random() < 0.6) {
        const ang = Math.random() * Math.PI * 2;
        this.embers.emitParticleAt(r.x + Math.cos(ang) * r.radius, r.y + Math.sin(ang) * r.radius - PILLAR.h * 0.8, 1);
      }
    }
  }

  /** The ground sigil: faint while dormant, flaring with the wall (k = wall height 0..1). */
  private drawSigil(r: Arena, k: number, now: number): void {
    const dormant = 0.16 + 0.05 * Math.sin(now / 700);
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const a = dormant + (0.7 - dormant) * k;
    const spin = now / (k > 0 ? 9000 : 30000);
    const g = this.sigil;
    const glow = hex(ARENA_COLORS.glow);
    const pillar = hex(ARENA_COLORS.pillar);
    const inner = r.radius - 12;
    // Outer ring: dashed while dormant, solid and glowing when sealed.
    if (k <= 0) {
      const dashes = 48;
      g.lineStyle(1.5, pillar, a);
      for (let i = 0; i < dashes; i += 2) {
        g.beginPath();
        g.arc(r.x, r.y, r.radius, spin + (i / dashes) * Math.PI * 2, spin + ((i + 1) / dashes) * Math.PI * 2);
        g.strokePath();
      }
    } else {
      g.lineStyle(7, glow, (0.1 + 0.12 * pulse) * k).strokeCircle(r.x, r.y, r.radius);
      g.lineStyle(2, pillar, a).strokeCircle(r.x, r.y, r.radius);
      g.lineStyle(1, glow, a * 0.8).strokeCircle(r.x, r.y, inner);
    }
    // Rune band: little three-stroke glyphs, turning slowly.
    g.lineStyle(1, k > 0 ? glow : pillar, a);
    const band = (r.radius + inner) / 2;
    for (let i = 0; i < RUNES; i++) {
      const ang = spin + (i / RUNES) * Math.PI * 2;
      const cx = r.x + Math.cos(ang) * band;
      const cy = r.y + Math.sin(ang) * band;
      const tx = -Math.sin(ang);
      const ty = Math.cos(ang);
      const s = 3;
      const shape = i % 4;
      g.lineBetween(cx - tx * s, cy - ty * s, cx + tx * s, cy + ty * s);
      if (shape !== 1) g.lineBetween(cx, cy, cx + Math.cos(ang) * s * (shape === 2 ? -1 : 1), cy + Math.sin(ang) * s * (shape === 2 ? -1 : 1));
      if (shape === 3) g.lineBetween(cx - tx * s, cy - ty * s, cx + Math.cos(ang) * s, cy + Math.sin(ang) * s);
    }
    if (k <= 0) return;
    // Sealed: spokes to an inner circle, and a soft ember wash on the floor.
    g.lineStyle(1, pillar, 0.35 * k);
    const hub = r.radius * 0.32;
    for (let i = 0; i < 8; i++) {
      const ang = -spin * 2 + (i / 8) * Math.PI * 2;
      g.lineBetween(r.x + Math.cos(ang) * hub, r.y + Math.sin(ang) * hub, r.x + Math.cos(ang) * inner, r.y + Math.sin(ang) * inner);
    }
    g.lineStyle(1, glow, 0.3 * k).strokeCircle(r.x, r.y, hub);
    this.ground.fillStyle(glow, 0.05 * k).fillCircle(r.x, r.y, r.radius);
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
    this.sigil.destroy();
    this.embers.destroy();
    for (const list of this.pillars.values()) for (const img of list) img.destroy();
    this.pillars.clear();
  }
}
