import Phaser from "phaser";
import { bridge } from "@/bridge/events";
import type { WorldStart } from "./PreloadScene";
import { useNet } from "@/store/net";
import { ClientLink } from "@/net/links";
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
    let wait: ReturnType<typeof setInterval> | undefined;
    const off = bridge.on("ui:start", ({ mode, slot, save, rules }) => {
      const session = useNet.getState().session;
      if (mode === "client" && session) {
        // A client enters the host's world: wait for its package (sent once the host's world is up).
        const link = ClientLink.of(session);
        clearInterval(wait);
        wait = setInterval(() => {
          if (!link.world) return;
          clearInterval(wait);
          const init = link.world;
          link.world = null;
          this.scene.start("preload", { mode, slot, localId: session.me, init, map: init.map } satisfies WorldStart);
        }, 50);
        return;
      }
      const start: WorldStart = save
        ? // A host may have picked other rules in the lobby: they apply, the save's NG+ cycle stays.
          { mode, slot, map: save.map, at: { x: save.x, y: save.y }, carry: save.player, time: save.time, playtime: save.playtime, rules: rules ? { ...rules, ngPlus: save.rules.ngPlus } : save.rules }
        : { mode, slot, rules };
      this.scene.start("preload", start);
    });
    this.events.once("shutdown", () => {
      clearInterval(wait);
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
