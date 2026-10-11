import Phaser from "phaser";
import { bridge } from "@/bridge/events";
import type { WorldStart } from "./PreloadScene";
import { audio } from "../audio";

/** Ambient backdrop behind the title menu: drifting embers rising from a dim lantern glow. */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create(): void {
    this.makeTextures();
    audio.music.play("title");
    audio.ambience.set("title");
    const { width, height } = this.scale;

    const glow = this.add.image(width / 2, height * 0.62, "glow").setTint(0xff8a3d).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.5, scale: 1.08, duration: 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const embers = this.add.particles(0, 0, "ember", {
      x: { min: 0, max: width },
      y: height + 10,
      lifespan: { min: 4000, max: 9000 },
      speedY: { min: -60, max: -18 },
      speedX: { min: -12, max: 12 },
      scale: { start: 1, end: 0.2 },
      alpha: { start: 1, end: 0 },
      tint: [0xff8a3d, 0xffd27a, 0xff5d3c],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 90,
    });

    const onResize = (size: Phaser.Structs.Size) => {
      glow.setPosition(size.width / 2, size.height * 0.62);
      embers.updateConfig({ x: { min: 0, max: size.width }, y: size.height + 10 });
    };
    this.scale.on("resize", onResize);
    const off = bridge.on("ui:start", ({ mode, slot, save }) => {
      const start: WorldStart = save
        ? { mode, slot, map: save.map, at: { x: save.x, y: save.y }, carry: save.player, time: save.time, playtime: save.playtime }
        : { mode, slot };
      this.scene.start("preload", start);
    });
    this.events.once("shutdown", () => {
      off();
      this.scale.off("resize", onResize);
    });
    bridge.emit("game:ready");
  }

  /** Runtime-generated textures for the backdrop (no asset needed). */
  private makeTextures(): void {
    if (this.textures.exists("ember")) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(3, 3, 3).generateTexture("ember", 6, 6).clear();
    for (let r = 160; r > 0; r -= 4) g.fillStyle(0xffffff, 0.02).fillCircle(160, 160, r);
    g.generateTexture("glow", 320, 320).destroy();
  }
}
