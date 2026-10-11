import Phaser from "phaser";
import { bridge, type GameMode } from "@/bridge/events";
import type { PlayerState } from "@/core/save/save";
import type { WorldRules } from "@/core/sim/rules";
import type { WorldInit } from "@/net/protocol";
import type { SimState } from "@/core/sim/state";
import { ASSET_INDEX_KEY, ASSET_INDEX_PATH, queueAssets, type AssetEntry } from "../assets";

/** Asset kinds the world needs up front. Others (bosses, rare enemies) load on demand later. */
const WORLD_KINDS = ["character", "enemy", "boss", "tileset", "tile", "prop", "vfx", "light", "item", "weapon", "shield", "ui"];

/** What the world scene starts with: from the title (new game / loaded save) or from a map transition. */
export interface WorldStart {
  mode: GameMode;
  /** Map id (default: the hub). */
  map?: string;
  /** Player spawn id to arrive at (default: the map's first player spawn). */
  arrive?: string;
  /** Exact feet position (loading a save); ignored if not walkable. */
  at?: { x: number; y: number };
  /** Local player state carried across maps or loaded from a save. */
  carry?: PlayerState;
  /** Shared world clock (day/night), continued across maps. */
  time?: number;
  /** Save slot this run writes to (none = not saved, e.g. multiplayer client). */
  slot?: number;
  /** Seconds played so far in this save. */
  playtime?: number;
  /** Difficulty / Omens / NG+ (default: Normal). Carried across maps. */
  rules?: WorldRules;
  /** Multiplayer: my seat / actor id (default "p1"). */
  localId?: string;
  /** Client: the world as the host sent it. */
  init?: WorldInit;
  /** Host: the other players' characters, carried across a map change. */
  party?: Record<string, PlayerState>;
  /** New host after a migration: the world as I last knew it (resumed), and the seat that left. */
  resume?: SimState;
  dropSeat?: string;
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
