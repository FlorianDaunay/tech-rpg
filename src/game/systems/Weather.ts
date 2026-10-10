import Phaser from "phaser";
import type { WEATHERS } from "@/content/schemas/zone";
import { DEPTH_LIGHT } from "./Lighting";

type WeatherKind = (typeof WEATHERS)[number];

/** Particle colours are world art (fixed, theme-independent). */
const COLORS = { fog: 0x9fb4c8, firefly: 0xd8ff7a, ember: 0xff9a4a, rain: 0x9fb4d8, ash: 0x9a948c, mote: 0xb48cff } as const;

/**
 * Zone weather as particle emitters that follow the camera view. Glowing particles (fireflies,
 * embers, motes) draw above the darkness; matter (fog, rain, ash) below it, so night dims it.
 */
export class Weather {
  private readonly emitters: { emitter: Phaser.GameObjects.Particles.ParticleEmitter; zone: Phaser.Geom.Rectangle; above: number }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    kinds: readonly WeatherKind[]
  ) {
    ensureTextures(scene);
    for (const k of kinds) this.add(k);
  }

  private add(kind: WeatherKind): void {
    const zone = new Phaser.Geom.Rectangle(0, 0, 10, 10);
    // A Rectangle is a valid random-zone source at runtime (getRandomPoint); only the typings disagree.
    const emitZone = { type: "random" as const, source: zone as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource };
    const glowDepth = DEPTH_LIGHT + 2;
    const matterDepth = DEPTH_LIGHT - 1;
    let config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
    let key = "wx-dot";
    let depth = matterDepth;
    let above = 0;
    switch (kind) {
      case "fog":
        key = "vfx/light-soft";
        config = { lifespan: { min: 7000, max: 11000 }, speedX: { min: -7, max: 7 }, speedY: { min: -2, max: 2 }, scale: { min: 1.6, max: 3.2 }, alpha: { start: 0.09, end: 0 }, tint: COLORS.fog, frequency: 450 };
        break;
      case "fireflies":
        config = { lifespan: { min: 2500, max: 5000 }, speed: { min: 3, max: 12 }, alpha: { start: 1, end: 0, ease: "Sine.easeIn" }, tint: COLORS.firefly, blendMode: Phaser.BlendModes.ADD, frequency: 220 };
        depth = glowDepth;
        break;
      case "embers":
        config = { lifespan: { min: 3000, max: 5500 }, speedY: { min: -26, max: -10 }, speedX: { min: -6, max: 6 }, alpha: { start: 1, end: 0 }, tint: COLORS.ember, blendMode: Phaser.BlendModes.ADD, frequency: 260 };
        depth = glowDepth;
        break;
      case "rain":
        key = "wx-streak";
        config = { lifespan: 900, speedY: { min: 260, max: 320 }, speedX: { min: -50, max: -35 }, alpha: { start: 0.4, end: 0.15 }, tint: COLORS.rain, frequency: 12, quantity: 2 };
        above = 60;
        break;
      case "ash":
        config = { lifespan: { min: 5000, max: 8000 }, speedY: { min: 12, max: 26 }, speedX: { min: 4, max: 14 }, alpha: { start: 0.8, end: 0 }, tint: COLORS.ash, frequency: 120 };
        above = 30;
        break;
      case "motes":
        config = { lifespan: { min: 4000, max: 7000 }, speed: { min: 2, max: 8 }, alpha: { start: 0.9, end: 0 }, tint: COLORS.mote, blendMode: Phaser.BlendModes.ADD, frequency: 300 };
        depth = glowDepth;
        break;
    }
    const emitter = this.scene.add.particles(0, 0, key, { ...config, emitZone }).setDepth(depth);
    this.emitters.push({ emitter, zone, above });
  }

  /** Keep spawning inside the current view (a bit above it for falling particles). */
  update(): void {
    const v = this.scene.cameras.main.worldView;
    for (const e of this.emitters) e.zone.setTo(v.x - 16, v.y - 16 - e.above, v.width + 32, v.height + 32);
  }

  destroy(): void {
    this.emitters.forEach((e) => e.emitter.destroy());
  }
}

function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("wx-dot")) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2).generateTexture("wx-dot", 2, 2);
  g.clear().fillStyle(0xffffff, 1).fillRect(0, 0, 1, 6).generateTexture("wx-streak", 1, 6);
  g.destroy();
}
