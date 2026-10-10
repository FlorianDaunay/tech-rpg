/** Identity and global constants. The display name lives ONLY here. */
export const GAME = {
  title: "Valaria",
  subtitle: "The Shattered Sun",
  tagline: "Carry the last flame.",
  version: __APP_VERSION__,
  /** Prefix for every localStorage key and the P2P peer ids. */
  storagePrefix: "valaria",
} as const;

/** Rendering: pixel art drawn at a low resolution, scaled up by the camera. */
export const VIEW = {
  /** Target number of world pixels visible vertically; zoom adapts to the screen. */
  targetWorldHeight: 270,
  tileSize: 32,
} as const;
