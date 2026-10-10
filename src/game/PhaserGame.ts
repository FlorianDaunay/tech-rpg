import Phaser from "phaser";
import { TitleScene } from "./scenes/TitleScene";

/** Creates the single Phaser instance inside `parent`. React owns the lifecycle (see GameCanvas). */
export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: "#07060b",
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    input: { activePointers: 4 },
    fps: { target: 60, smoothStep: true },
    scene: [TitleScene],
  });
}
