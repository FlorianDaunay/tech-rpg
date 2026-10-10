import Phaser from "phaser";
import type { GameMap } from "@/core/world/map";
import { assetEntry } from "../assets";

export const DEPTH_GROUND = -100_000;
export const DEPTH_ABOVE = 100_000;

/** Splits "asset-key#frame" into its parts (frame defaults to 0). */
export function parseTile(tile: string): { key: string; frame: number } {
  const hash = tile.lastIndexOf("#");
  return hash < 0 ? { key: tile, frame: 0 } : { key: tile.slice(0, hash), frame: Number(tile.slice(hash + 1)) };
}

interface AnimInfo {
  frames: number;
  fps: number;
  /** Sheet frame for logical frame `f` at animation step `step`. */
  frameAt: (f: number, step: number) => number;
}

/** How a tileset animates, from its index metadata (water: 4 frames; shore autotile: 4 blocks side by side). */
function animInfo(scene: Phaser.Scene, key: string): AnimInfo | null {
  const meta = assetEntry(scene, key)?.meta as
    | { anim?: string; fps?: number; animFrames?: number; blockCols?: number }
    | undefined;
  if (!meta) return null;
  if (meta.animFrames && meta.blockCols) {
    const cols = meta.blockCols;
    const sheetCols = cols * meta.animFrames; // one block per animation step, laid out horizontally
    return {
      frames: meta.animFrames,
      fps: meta.fps ?? 4,
      frameAt: (f, step) => Math.floor(f / cols) * sheetCols + step * cols + (f % cols),
    };
  }
  if (meta.anim === "loop") {
    const total = assetEntry(scene, key)?.frames ?? 1;
    return { frames: total, fps: meta.fps ?? 4, frameAt: (_f, step) => step % total };
  }
  return null;
}

/**
 * Builds Phaser tilemap layers for a GameMap. Every distinct asset becomes a tileset with its own
 * gid range so layers can mix sheets. Animated tiles get one layer copy per animation step,
 * cycled by a timer (cheap: only visibility toggles).
 */
export function renderMap(scene: Phaser.Scene, map: GameMap): Phaser.Tilemaps.Tilemap {
  const tilemap = scene.make.tilemap({ tileWidth: map.tileSize, tileHeight: map.tileSize, width: map.width, height: map.height });

  const firstGid = new Map<string, number>();
  const anims = new Map<string, AnimInfo>();
  let nextGid = 1;
  const keys = new Set(map.layers.flatMap((l) => l.tiles.filter(Boolean).map((t) => parseTile(t).key)));
  const tilesets: Phaser.Tilemaps.Tileset[] = [];
  for (const key of keys) {
    if (!scene.textures.exists(key)) {
      console.warn(`[map ${map.id}] missing texture "${key}"`);
      continue;
    }
    const tileset = tilemap.addTilesetImage(key, key, map.tileSize, map.tileSize, 0, 0, nextGid);
    if (!tileset) continue;
    tilesets.push(tileset);
    firstGid.set(key, nextGid);
    nextGid += tileset.total;
    const anim = animInfo(scene, key);
    if (anim) anims.set(key, anim);
  }

  map.layers.forEach((layer, i) => {
    const animated = layer.tiles.some((t) => t && anims.has(parseTile(t).key));
    const steps = animated ? Math.max(...[...anims.values()].map((a) => a.frames)) : 1;
    const fps = animated ? Math.min(...[...anims.values()].map((a) => a.fps)) : 0;
    const copies: Phaser.Tilemaps.TilemapLayer[] = [];

    for (let step = 0; step < steps; step++) {
      const data: number[][] = [];
      for (let y = 0; y < map.height; y++) {
        const row: number[] = [];
        for (let x = 0; x < map.width; x++) {
          const tile = layer.tiles[y * map.width + x];
          const parsed = tile ? parseTile(tile) : null;
          const gid = parsed ? firstGid.get(parsed.key) : undefined;
          if (!parsed || gid === undefined) {
            row.push(-1);
            continue;
          }
          const anim = anims.get(parsed.key);
          row.push(gid + (anim ? anim.frameAt(parsed.frame, step % anim.frames) : parsed.frame));
        }
        data.push(row);
      }
      const tl = tilemap.createBlankLayer(steps > 1 ? `${layer.id}@${step}` : layer.id, tilesets, 0, 0);
      if (!tl) continue;
      tl.putTilesAt(data, 0, 0);
      tl.setDepth(layer.above ? DEPTH_ABOVE + i : DEPTH_GROUND + i).setVisible(step === 0);
      copies.push(tl);
    }

    if (copies.length > 1) {
      let step = 0;
      scene.time.addEvent({
        delay: 1000 / fps,
        loop: true,
        callback: () => {
          copies[step]!.setVisible(false);
          step = (step + 1) % copies.length;
          copies[step]!.setVisible(true);
        },
      });
    }
  });
  return tilemap;
}

/** Places map objects (trees, buildings…) as y-sorted images anchored per their asset metadata. */
export function renderObjects(scene: Phaser.Scene, map: GameMap): Phaser.GameObjects.Image[] {
  return map.objects.map((o) => {
    const meta = assetEntry(scene, o.asset)?.meta as { anchorX?: number; anchorY?: number } | undefined;
    const img = scene.add.image(o.x, o.y, o.asset, o.frame);
    img.setOrigin(meta?.anchorX ?? 0.5, meta?.anchorY ?? 1).setFlipX(o.flipX).setDepth(o.y);
    return img;
  });
}
