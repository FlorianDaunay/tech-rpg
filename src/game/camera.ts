import type Phaser from "phaser";
import { VIEW } from "@/config/game";

/**
 * Zoom so ~VIEW.targetWorldHeight world pixels fit vertically. Integer steps keep pixel art crisp;
 * short screens (landscape phones) get half steps, otherwise 1× would show far too much world.
 * TODO(M14): render at devicePixelRatio for exact pixels at fractional zooms.
 */
export function pixelZoom(screenHeight: number): number {
  const raw = screenHeight / VIEW.targetWorldHeight;
  const stepped = screenHeight < 600 ? Math.round(raw * 2) / 2 : Math.round(raw);
  return Math.min(6, Math.max(1, stepped));
}

/** Applies pixel zoom now and on every resize. Returns the unsubscribe. */
export function bindPixelZoom(scene: Phaser.Scene, camera: Phaser.Cameras.Scene2D.Camera): () => void {
  const apply = () => camera.setZoom(pixelZoom(scene.scale.height));
  apply();
  scene.scale.on("resize", apply);
  return () => scene.scale.off("resize", apply);
}
