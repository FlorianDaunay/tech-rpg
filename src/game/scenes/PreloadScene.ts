import Phaser from "phaser";
import { bridge, type GameMode } from "@/bridge/events";
import { ASSET_INDEX_KEY, ASSET_INDEX_PATH, queueAssets, type AssetEntry } from "../assets";

/** Asset kinds the world needs up front. Others (bosses, rare enemies) load on demand later. */
const WORLD_KINDS = ["character", "enemy", "tileset", "tile", "prop", "vfx", "light", "item", "weapon", "shield", "ui"];

export interface WorldStart {
  mode: GameMode;
}

/** Loads the asset index, then every world asset, reporting progress to the React loading screen. */
export class PreloadScene extends Phaser.Scene {
  private start!: WorldStart;

  constructor() {
    super("preload");
  }

  init(data: WorldStart): void {
    this.start = data;
  }

  preload(): void {
    this.makeRuntimeTextures();
    if (!this.cache.json.exists(ASSET_INDEX_KEY)) this.load.json(ASSET_INDEX_KEY, ASSET_INDEX_PATH);
  }

  create(): void {
    const index = (this.cache.json.get(ASSET_INDEX_KEY) as { assets?: AssetEntry[] } | AssetEntry[] | undefined) ?? [];
    const entries = Array.isArray(index) ? index : (index.assets ?? []);
    queueAssets(this.load, entries.filter((e) => !this.textures.exists(e.key)), WORLD_KINDS);
    this.load.on("progress", (p: number) => bridge.emit("game:loading", p));
    this.load.once("complete", () => {
      bridge.emit("game:loading", 1);
      this.scene.start("world", this.start);
    });
    this.load.start();
  }

  /** Small textures drawn in code (no file needed). */
  private makeRuntimeTextures(): void {
    if (this.textures.exists("shadow")) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(0x000000, 1).fillEllipse(8, 3, 14, 5).generateTexture("shadow", 16, 6).destroy();
  }
}
