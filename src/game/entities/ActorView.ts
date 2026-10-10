import Phaser from "phaser";
import type { Facing } from "@/core/math/vec";

/** Pipoya sheets: 3 columns × 4 rows, rows ordered down, left, right, up. Walk cycle 0-1-2-1. */
const ROWS: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };
const FEET_OFFSET = 14; // sprite origin above the feet (frame is 32px tall, feet near the bottom)

export function ensureCharacterAnims(scene: Phaser.Scene, sheet: string): void {
  for (const [facing, row] of Object.entries(ROWS)) {
    const key = `${sheet}:walk-${facing}`;
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: [0, 1, 2, 1].map((c) => ({ key: sheet, frame: row * 3 + c })),
      frameRate: 8,
      repeat: -1,
    });
  }
}

/**
 * Renders one simulated actor: sprite + soft shadow, y-sorted. Holds no game rules; the scene
 * feeds it positions (already interpolated) and state each frame.
 */
export class ActorView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    private readonly sheet: string,
    x: number,
    y: number
  ) {
    ensureCharacterAnims(scene, sheet);
    this.shadow = scene.add.image(x, y, "shadow").setAlpha(0.35);
    this.sprite = scene.add.sprite(x, y - FEET_OFFSET, sheet, ROWS.down * 3 + 1);
  }

  update(x: number, y: number, facing: Facing, moving: boolean): void {
    this.shadow.setPosition(x, y + 1).setDepth(y - 1);
    this.sprite.setPosition(x, y - FEET_OFFSET).setDepth(y);
    if (moving) this.sprite.play(`${this.sheet}:walk-${facing}`, true);
    else {
      this.sprite.stop();
      this.sprite.setFrame(ROWS[facing] * 3 + 1);
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
