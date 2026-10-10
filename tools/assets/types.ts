import type { Rng } from "../../src/core/math/rng";
import type * as Palette from "../../src/config/palette";

export const ASSET_KINDS = [
  "character",
  "enemy",
  "boss",
  "tileset",
  "tile",
  "prop",
  "item",
  "weapon",
  "shield",
  "vfx",
  "light",
  "ui",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type AssetMeta = Record<string, string | number | boolean | readonly (string | number)[]>;

/** One line of public/assets/index.json. `key` = path without extension. */
export interface AssetEntry {
  key: string;
  path: string;
  kind: AssetKind;
  frameWidth?: number;
  frameHeight?: number;
  frames?: number;
  meta?: AssetMeta;
}

export interface AssetIndex {
  version: 1;
  kinds: readonly AssetKind[];
  assets: AssetEntry[];
}

/** What a generator returns: a PNG plus its index info (path relative to public/assets). */
export interface GeneratedAsset extends Omit<AssetEntry, "key"> {
  png: Buffer;
}

export type PaletteModule = typeof Palette;
export type Generator = (rng: Rng, palette: PaletteModule) => GeneratedAsset[];
