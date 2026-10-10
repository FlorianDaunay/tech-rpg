import type Phaser from "phaser";

/** Shape of `public/assets/index.json`, produced by `npm run assets` (see pixel-asset-pipeline skill). */
export interface AssetEntry {
  key: string;
  path: string;
  kind: string;
  frameWidth?: number;
  frameHeight?: number;
  frames?: number;
  meta?: Record<string, unknown>;
}

export const ASSET_INDEX_KEY = "asset-index";
export const ASSET_INDEX_PATH = "assets/index.json";

/** Queues every entry of the index: spritesheets when frame sizes are known, images otherwise. */
export function queueAssets(load: Phaser.Loader.LoaderPlugin, entries: AssetEntry[], kinds?: string[]): void {
  for (const e of entries) {
    if (kinds && !kinds.includes(e.kind)) continue;
    const url = `assets/${e.path}`;
    if (e.frameWidth && e.frameHeight) load.spritesheet(e.key, url, { frameWidth: e.frameWidth, frameHeight: e.frameHeight });
    else load.image(e.key, url);
  }
}

let byKey: Map<string, AssetEntry> | null = null;

/** Index entry for an asset key (metadata: anchors, layouts, animation…), once Preload has run. */
export function assetEntry(scene: Phaser.Scene, key: string): AssetEntry | undefined {
  if (!byKey) {
    const raw = scene.cache.json.get(ASSET_INDEX_KEY) as { assets?: AssetEntry[] } | undefined;
    if (!raw?.assets) return undefined;
    byKey = new Map(raw.assets.map((a) => [a.key, a]));
  }
  return byKey.get(key);
}
