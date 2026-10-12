import Phaser from "phaser";
import { hex, LIGHT_COLORS } from "@/config/palette";
import type { MapLight } from "@/core/world/map";

/** Above every world object and canopy; glows go just above the darkness. */
export const DEPTH_LIGHT = 150_000;
// Erased from the darkness. The banded texture's opaque outer band left hard-edged discs; the soft
// radial falloff reads better (the low-res darkness still gives it a pixel feel).
const STAMP = "vfx/light-soft"; // 128 px soft radial
const STAMP_SIZE = 128;
/** The soft texture fades to 0 before its edge: oversize it so `radius` is the visible reach. */
const STAMP_REACH = 1.25;
const GLOW = "vfx/light-soft"; // 128 px soft radial: additive colour on top
/**
 * Extra world px around the view. The texture is placed from this frame's view before the camera's
 * follow step moves it, so fast camera moves (lerp after a teleport/transition) need slack.
 */
const MARGIN = 48;
/**
 * The darkness texture is created once per game and reused by every World scene: Phaser 4.2.1
 * leaks a GL texture per DynamicTexture (its placeholder source texture is replaced by the drawing
 * context's and never deleted), so a RenderTexture per map load crashed the page after ~10 zones.
 */
const DARK_KEY = "lighting/darkness";

interface Flash {
  x: number;
  y: number;
  radius: number;
  color: string;
  until: number;
  duration: number;
}

/**
 * Night lighting: a camera-sized darkness render texture refilled every frame, with each light
 * erased out of it (banded stamp), plus additive coloured glows. Lights come from map objects, the
 * player's lantern and short flashes (reactions, explosions).
 */
export class Lighting {
  private readonly dark: Phaser.Textures.DynamicTexture;
  private readonly darkImage: Phaser.GameObjects.Image;
  private readonly stamp: Phaser.GameObjects.Image;
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly playerGlow: Phaser.GameObjects.Image;
  private flashes: Flash[] = [];
  private ambient = 0x000000;
  private darkness = 0.6;
  /** Lights switched off (village projects not built by this player). */
  private off = new Set<number>();
  /** Worn lantern cosmetic: a coloured, brighter player glow. */
  private lanternTint: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lights: MapLight[],
    private readonly playerRadius: number
  ) {
    this.dark = (scene.textures.exists(DARK_KEY) ? scene.textures.get(DARK_KEY) : scene.textures.addDynamicTexture(DARK_KEY, 32, 32)) as Phaser.Textures.DynamicTexture;
    this.darkImage = scene.add.image(0, 0, DARK_KEY).setOrigin(0, 0).setDepth(DEPTH_LIGHT);
    // Not on the display list: only drawn into the render texture.
    this.stamp = new Phaser.GameObjects.Image(scene, 0, 0, STAMP).setOrigin(0.5);
    for (const l of lights) {
      this.glows.push(scene.add.image(l.x, l.y, GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(LIGHT_COLORS[l.color as keyof typeof LIGHT_COLORS] ?? "#FFFFFF")).setDepth(DEPTH_LIGHT + 1));
    }
    this.playerGlow = scene.add.image(0, 0, GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(LIGHT_COLORS.lantern)).setDepth(DEPTH_LIGHT + 1);
  }

  /** Shows only the lights whose `ifFlag` the player has. */
  setFlags(flags: readonly string[]): void {
    this.off = new Set(this.lights.flatMap((l, i) => (l.ifFlag && !flags.includes(l.ifFlag) ? [i] : [])));
    this.glows.forEach((g, i) => g.setVisible(!this.off.has(i)));
  }

  /** Player lantern colour (#RRGGBB), or null for the plain Embersworn flame. */
  setLantern(color: string | null): void {
    this.lanternTint = color ? hex(color) : null;
    this.playerGlow.setTint(this.lanternTint ?? hex(LIGHT_COLORS.lantern));
  }

  setAmbient(color: string, darkness: number): void {
    this.ambient = hex(color);
    this.darkness = darkness;
  }

  /** A short burst of light (reaction, explosion, level-up…). */
  flash(x: number, y: number, radius: number, color: string, ms = 350): void {
    const now = this.scene.time.now;
    this.flashes.push({ x, y, radius, color, until: now + ms, duration: ms });
  }

  update(player: { x: number; y: number } | null, projectiles: readonly { x: number; y: number }[] = [], loot: readonly { x: number; y: number }[] = []): void {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const left = Math.floor(view.x) - MARGIN;
    const top = Math.floor(view.y) - MARGIN;
    // Even sizes: DynamicTexture rounds odd sizes up, which would re-trigger the resize every frame.
    const w = (Math.ceil(view.width) + MARGIN * 2 + 1) & ~1;
    const h = (Math.ceil(view.height) + MARGIN * 2 + 1) & ~1;
    if (this.dark.width !== w || this.dark.height !== h) {
      this.dark.setSize(w, h);
      this.darkImage.setSizeToFrame();
    }
    this.darkImage.setPosition(left, top);

    const now = this.scene.time.now;
    const t = now / 1000;
    this.flashes = this.flashes.filter((f) => f.until > now);
    // Glows matter more in deep darkness; in the grey dawn they fade back.
    const glowK = 0.15 + 0.35 * this.darkness;

    this.dark.clear();
    this.dark.fill(this.ambient, this.darkness);
    const erase = (x: number, y: number, radius: number, strength: number) => {
      if (x + radius < left || x - radius > left + w || y + radius < top || y - radius > top + h) return;
      this.stamp.setPosition(x - left, y - top).setScale((radius * 2 * STAMP_REACH) / STAMP_SIZE).setAlpha(Math.min(1, strength));
      this.dark.erase(this.stamp);
    };

    this.lights.forEach((l, i) => {
      if (this.off.has(i)) return;
      const flicker = l.flicker ? 1 + 0.07 * Math.sin(t * 11 + i * 1.7) + 0.05 * Math.sin(t * 23 + i * 3.1) : 1;
      const r = l.radius * flicker;
      erase(l.x, l.y, r, l.intensity);
      this.glows[i]!.setPosition(l.x, l.y).setScale((r * 2.2) / 128).setAlpha(glowK * l.intensity * flicker);
    });
    if (player) {
      const r = this.playerRadius * (1 + 0.03 * Math.sin(t * 7));
      erase(player.x, player.y - 8, r, 0.85);
      // A worn lantern colours a wider, stronger halo (the plain flame stays discreet).
      const tinted = this.lanternTint !== null;
      this.playerGlow.setVisible(true).setPosition(player.x, player.y - 8).setScale((r * (tinted ? 1.8 : 1.4)) / 128).setAlpha(Math.min(0.6, glowK * (tinted ? 1.8 : 0.25)));
    } else this.playerGlow.setVisible(false);
    for (const p of projectiles) erase(p.x, p.y, 28, 0.7);
    // Ground loot shows in the dark (a faint patch around it).
    for (const p of loot) erase(p.x, p.y - 4, 18, 0.55);
    for (const f of this.flashes) {
      const k = (f.until - now) / f.duration;
      erase(f.x, f.y, f.radius * (1.2 - 0.2 * k), k);
    }
    this.dark.render();
  }

  destroy(): void {
    this.darkImage.destroy(); // the shared texture stays for the next map
    this.stamp.destroy();
    this.glows.forEach((g) => g.destroy());
    this.playerGlow.destroy();
  }
}
