import Phaser from "phaser";
import { bridge, type GameMode } from "@/bridge/events";
import type { Progress } from "@/core/narrative/progress";
import type { Actor } from "@/core/combat/actor";
import { ASSET_INDEX_KEY, ASSET_INDEX_PATH, queueAssets, type AssetEntry } from "../assets";

/** Asset kinds the world needs up front. Others (bosses, rare enemies) load on demand later. */
const WORLD_KINDS = ["character", "enemy", "tileset", "tile", "prop", "vfx", "light", "item", "weapon", "shield", "ui"];

/** What the world scene starts with: from the title (mode only) or from a map transition. */
export interface WorldStart {
  mode: GameMode;
  /** Map id (default: the hub). */
  map?: string;
  /** Player spawn id to arrive at (default: the map's first player spawn). */
  arrive?: string;
  /** Local player state carried across maps. */
  carry?: PlayerCarry;
  /** Shared world clock (day/night), continued across maps. */
  time?: number;
}

export interface PlayerCarry {
  hp: number;
  stamina: number;
  bag: Record<string, number>;
  weapon: string | null;
  shield: string | null;
  progress: Progress;
  level: number;
  xp: number;
  loadout: Actor["loadout"];
  ultCharge: number;
  /** Skill cooldowns keep running across a map change. */
  cooldowns: Record<string, number>;
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
