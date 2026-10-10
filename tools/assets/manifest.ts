/**
 * Copy manifest: files taken from the read-only ref_sprites/ library into public/assets/.
 * `from` is relative to ref_sprites/, `to` relative to public/assets/. Optional `crop` slices a
 * region out of a sheet (re-encoded); otherwise the file is copied byte for byte.
 * Frame sizes of whole-image entries (shields) are read from the PNG at build time.
 */
import type { AssetKind, AssetMeta } from "./types";

export interface CopyEntry {
  from: string;
  to: string;
  kind: AssetKind;
  crop?: { x: number; y: number; w: number; h: number };
  frameWidth?: number;
  frameHeight?: number;
  frames?: number;
  /** Frame size = whole image (single-frame sprites of varying size). */
  wholeFrame?: boolean;
  meta?: AssetMeta;
}

const PIPOYA = "img_set_pipoya_rpg";
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.png$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Pipoya walk sheet: 96×128 = 3 frames × 4 rows (down, left, right, up), walk cycle 0-1-2-1. */
const charSheet = { frameWidth: 32, frameHeight: 32, frames: 12 } as const;
const charMeta = (role: string, extra: AssetMeta = {}): AssetMeta => ({
  cols: 3,
  rows: 4,
  directions: ["down", "left", "right", "up"],
  walk: [0, 1, 2, 1],
  role,
  ...extra,
});

function pipoya(folder: string, file: string, kind: AssetKind, role: string, outDir = "characters"): CopyEntry {
  return {
    from: `${PIPOYA}/${folder}/${file}.png`,
    to: `${outDir}/${kebab(file)}.png`,
    kind,
    ...charSheet,
    meta: charMeta(role, { credit: "pipoya" }),
  };
}

const variants = (prefix: string, ids: number[], subs: number[]) =>
  ids.flatMap((i) => subs.map((s) => `${prefix} ${pad(i)}-${s}`));

// ---- characters ---------------------------------------------------------------------------
const players: CopyEntry[] = [
  ...variants("Male", [1, 2, 3, 4], [1, 2, 3, 4]).map((f) => pipoya("Male", f, "character", "player")),
  ...variants("Female", [1, 2], [1, 2, 3, 4]).map((f) => pipoya("Female", f, "character", "player")),
  pipoya("Soldier", "Soldier 01-1", "character", "player"),
];

const npcs: CopyEntry[] = [
  ...variants("Male", [5, 6, 7, 8, 9, 10], [1]).map((f) => pipoya("Male", f, "character", "villager")),
  ...variants("Female", [5, 6, 7, 8, 9, 10], [1]).map((f) => pipoya("Female", f, "character", "villager")),
  ...variants("Soldier", [2, 3], [1, 2, 3, 4]).map((f) => pipoya("Soldier", f, "character", "shieldwarden")),
  {
    ...pipoya("Other", "pipo-charachip_soldier01", "character", "captain"),
    to: "characters/soldier-captain.png",
  },
];

const pets: CopyEntry[] = [pipoya("Animal", "Cat 01-1", "character", "pet"), pipoya("Animal", "Dog 01-1", "character", "pet")];

// ---- enemies & bosses ---------------------------------------------------------------------
const ENEMY_FILES = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => `Enemy ${pad(i)}-1`),
  ...[1, 2, 3, 4, 5, 6].map((s) => `Enemy 15-${s}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => `Enemy 16-${s}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => `Enemy 17-${s}`),
  ...[18, 19, 20, 21, 22].map((i) => `Enemy ${i}`),
];
const enemies: CopyEntry[] = ENEMY_FILES.map((f) => pipoya("Enemy", f, "enemy", "enemy", "enemies"));

/** Boss 01.png = 288×384: 4 bosses (rows) × 3 frames of 96×96. */
const BOSS_ROWS = ["pale-weaver", "shroud", "maw", "vaelgor"] as const;
const bosses: CopyEntry[] = BOSS_ROWS.map((name, row) => ({
  from: `${PIPOYA}/Boss/Boss 01.png`,
  to: `bosses/${name}.png`,
  kind: "boss",
  crop: { x: 0, y: row * 96, w: 288, h: 96 },
  frameWidth: 96,
  frameHeight: 96,
  frames: 3,
  meta: { credit: "pipoya", source: "Boss 01.png", sourceRow: row },
}));

// ---- decor --------------------------------------------------------------------------------
const decorSheet = (file: string, to: string, kind: AssetKind, w: number, h: number): CopyEntry => ({
  from: `decor_sprite_sheet/${file}`,
  to,
  kind,
  frameWidth: 32,
  frameHeight: 32,
  frames: (w / 32) * (h / 32),
  meta: { credit: "decor", cols: w / 32, rows: h / 32 },
});
const decor: CopyEntry[] = [
  decorSheet("grass.png", "tiles/grass.png", "tileset", 256, 256),
  decorSheet("stone_ground.png", "tiles/stone-ground.png", "tileset", 256, 256),
  decorSheet("wall.png", "tiles/wall.png", "tileset", 512, 512),
  decorSheet("props.png", "props/props.png", "prop", 512, 512),
  decorSheet("Objects.png", "props/objects.png", "prop", 384, 96),
  decorSheet("treasures.png", "props/treasures.png", "prop", 256, 256),
  { from: "mine/chest.png", to: "props/chest.png", kind: "prop", frameWidth: 32, frameHeight: 32, frames: 1, meta: { credit: "decor" } },
  { from: "mine/torch.png", to: "props/torch.png", kind: "prop", frameWidth: 32, frameHeight: 32, frames: 1, meta: { credit: "decor" } },
];

// ---- swords: 6 sheets of 192×160 = 6 cols × 5 rows of 32×32 ---------------------------------
const SWORD_SHEETS = ["File.png", "File (1).png", "File 2022.png", "File 2023.png", "File 2024.png", "File 2025.png"];
const swords: CopyEntry[] = SWORD_SHEETS.flatMap((sheet, s) =>
  Array.from({ length: 30 }, (_, i): CopyEntry => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    return {
      from: `swords/${sheet}`,
      to: `weapons/sword-${pad(s * 30 + i + 1, 3)}.png`,
      kind: "weapon",
      crop: { x: col * 32, y: row * 32, w: 32, h: 32 },
      frameWidth: 32,
      frameHeight: 32,
      frames: 1,
      meta: { credit: "swords", sheet, sheetIndex: s, col, row, grid: "6x5@32" },
    };
  }),
);

// ---- shields: SnoopethDuckDuck, 1px-outlined variants ----------------------------------------
const SHIELD_PACKS = [
  { pack: 1, licence: "CC0", ids: [...Array.from({ length: 33 }, (_, i) => String(i + 1)), "32b"] },
  { pack: 2, licence: "CC0", ids: Array.from({ length: 32 }, (_, i) => String(i + 1)) },
  { pack: 3, licence: "CC-BY-4.0", ids: Array.from({ length: 14 }, (_, i) => String(i + 1)) },
] as const;
const shields: CopyEntry[] = SHIELD_PACKS.flatMap(({ pack, licence, ids }) =>
  ids.map(
    (id): CopyEntry => ({
      from: `SnoopethDuckDuck Shields/Pack ${pack}/1px/${id}.png`,
      to: `shields/pack${pack}-${id.replace(/^\d+/, (n) => pad(Number(n)))}.png`,
      kind: "shield",
      wholeFrame: true,
      frames: 1,
      meta: { credit: `snoopethduckduck-pack${pack}`, licence },
    }),
  ),
);

export const MANIFEST: readonly CopyEntry[] = [
  ...players,
  ...npcs,
  ...pets,
  ...enemies,
  ...bosses,
  ...decor,
  ...swords,
  ...shields,
];
