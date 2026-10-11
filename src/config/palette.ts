/**
 * In-game palette: world art ramps, element and rarity colours. Data only (no logic).
 * Ramps go dark → light; index 0 doubles as the material's outline colour.
 * World ramps were sampled from the reference decor sheets (olive grass, warm grey stone,
 * dark-brown outlines) so generated art sits next to the copied art.
 */

export const ELEMENT_COLORS = {
  ember: "#FF8A3D",
  frost: "#7FD8FF",
  storm: "#C9A5FF",
  hollow: "#8E4DFF",
} as const;
export type Element = keyof typeof ELEMENT_COLORS;

export const RARITY_COLORS = {
  common: "#B9B5A8",
  uncommon: "#7CC45A",
  rare: "#4F9DEB",
  epic: "#B46BF0",
  legendary: "#FFB33F",
} as const;
export type Rarity = keyof typeof RARITY_COLORS;

export const WORLD_RAMPS = {
  /** Generic outline used by the decor sheets (dark brown, never pure black). */
  outline: ["#3b2114"],
  grass: ["#3d4410", "#4f5713", "#656c17", "#72751b", "#7f8226", "#959a3a"],
  leaf: ["#2b3510", "#3e4a14", "#55621b", "#6d7d24", "#889a34", "#a7b452"],
  pine: ["#1d2a1f", "#2a3d2b", "#375239", "#4a6a45", "#628455"],
  bark: ["#2e1a10", "#4f2913", "#6b3f22", "#8a5a36", "#a8784c"],
  deadwood: ["#2c2522", "#463b35", "#62554c", "#7f7266", "#9d9184"],
  stone: ["#3f3a33", "#5a554c", "#6d685f", "#878579", "#98968e", "#b3b0a9"],
  dirt: ["#4a3020", "#6a4a30", "#866142", "#9c7652", "#b48d65"],
  sand: ["#7d6a49", "#9b8761", "#b5a27a"],
  water: ["#1f3448", "#2a4a62", "#36617a", "#4a7d93", "#6ea3b2", "#a9d1d6", "#e3f1ec"],
  wood: ["#3b2114", "#5a331b", "#7a4a2a", "#9a6538", "#b9824c", "#d4a46c"],
  plaster: ["#6e6355", "#968a76", "#b9ad94", "#d4cab0", "#e8e0c8"],
  roofRed: ["#3d1814", "#5e231b", "#813326", "#a24734", "#c26748"],
  roofSlate: ["#1f2532", "#2f384a", "#424e63", "#5a687e", "#7a889c"],
  rift: ["#0f0b17", "#1a1326", "#271c38", "#36284d", "#4a3766"],
  riftGlow: ["#5a2fa8", "#8e4dff", "#c09bff"],
  flame: ["#7a2410", "#c4471b", "#ff8a3d", "#ffc65c", "#fff1b8"],
  metal: ["#23252e", "#3b3f4c", "#5a6070", "#848b9c", "#b8bfcc", "#e8ecf2"],
  cloth: ["#3a1c26", "#5c2a36", "#8a3c45", "#b35a52", "#d98a6a"],
  clothBlue: ["#1d2a44", "#2c4066", "#3f5b8a", "#5c7fb0"],
  flowers: ["#e8d36a", "#e07a6a", "#c7a3e6", "#f2f0e6", "#7fb6e0"],
  mushroomRed: ["#4a1612", "#7d2219", "#b03a26", "#d9583a"],
  shadow: ["#14100c"],
  /** Graveyard soil: grey-brown ash. */
  ash: ["#26211f", "#3a3330", "#4f4642", "#665b55", "#7f736b", "#9a8e85"],
  /** Mine crystals: icy blue, glowing tips. */
  crystal: ["#14243a", "#1f4466", "#2f6f9c", "#4fa6d1", "#8fdcf2", "#e2fbff"],
  /** Wrought iron (fences, braziers, carts). */
  iron: ["#141519", "#24262d", "#383b45", "#53576a", "#7a8094"],
} as const;
export type WorldRamp = keyof typeof WORLD_RAMPS;

/** Light colours (ADD-blended radial lights are tinted with these). */
export const LIGHT_COLORS = {
  lantern: "#FFC46B",
  torch: "#FF9F4A",
  moon: "#9DB8FF",
  rift: "#9A6BFF",
} as const;

/** Combat feedback colours (damage numbers, flashes, telegraphs). */
export const COMBAT_COLORS = {
  /** Tint of an opened (empty) chest. */
  chestOpened: "#6E6478",
  damage: "#F2EEE3",
  damageTaken: "#FF6B5E",
  crit: "#FFC65C",
  blocked: "#9DA3AE",
  parry: "#9DE7FF",
  telegraph: "#FF4A3D",
  hitFlash: "#FFFFFF",
  slash: "#FFF1D6",
  enemyBolt: "#B98CFF",
  enemyBoltRim: "#4A2A80",
  hpBar: "#D9483B",
  hpBarBack: "#1A1216",
  goldRim: "#5A3A12",
  levelUp: "#FFD98A",
} as const;

/** "#RRGGBB" → 0xRRGGBB for Phaser. */
export const hex = (color: string) => parseInt(color.slice(1, 7), 16);
