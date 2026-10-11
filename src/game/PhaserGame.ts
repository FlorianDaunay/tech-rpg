import Phaser from "phaser";
import { registerContent } from "@/content/boot";
import { PreloadScene } from "./scenes/PreloadScene";
import { TitleScene } from "./scenes/TitleScene";
import { WorldScene } from "./scenes/WorldScene";

/** Creates the single Phaser instance inside `parent`. React owns the lifecycle (see GameCanvas). */
export function createGame(parent: HTMLElement): Phaser.Game {
  registerContent();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: "#07060b",
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    input: { activePointers: 4 },
    fps: { target: 60, smoothStep: true },
    scene: [TitleScene, PreloadScene, WorldScene],
  });
  // Dev-only handle for debugging and automated play tests.
  if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;
  return game;
}
