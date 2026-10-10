/**
 * Review helper (not part of the build): lays out every generated asset of public/assets/index.json
 * on a grass background and on a dark background, scaled ×2.
 *   npx tsx tools/assets/contact-sheet.ts <out-dir> [filter]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas } from "./png";
import type { AssetIndex } from "./types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = process.argv[2] ?? ".";
const FILTER = process.argv[3] ?? "";
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "public/assets/index.json"), "utf8")) as AssetIndex;
const items = index.assets.filter((a) => a.meta?.generator && a.path.includes(FILTER));

function sheet(bg: (x: number, y: number) => [number, number, number], scale: number, maxW: number) {
  const pad = 6;
  const imgs = items.map((a) => Canvas.fromPng(fs.readFileSync(path.join(ROOT, "public/assets", a.path))));
  const pos: [number, number][] = [];
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const im of imgs) {
    const w = im.width * scale;
    if (x + w + pad > maxW && x > pad) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    pos.push([x, y]);
    x += w + pad;
    rowH = Math.max(rowH, im.height * scale);
  }
  const H = y + rowH + pad;
  const c = new Canvas(maxW, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < maxW; i++) c.set(i, j, bg(i, j));
  imgs.forEach((im, k) => {
    const [ox, oy] = pos[k]!;
    for (let j = 0; j < im.height * scale; j++)
      for (let i = 0; i < im.width * scale; i++) {
        const [r, g, b, a] = im.get(Math.floor(i / scale), Math.floor(j / scale));
        if (a) c.blend(ox + i, oy + j, [r, g, b], a / 255);
      }
  });
  return c;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const grass = (x: number, y: number): [number, number, number] => ((x >> 4) + (y >> 4)) % 2 ? [0x72, 0x75, 0x1b] : [0x6c, 0x70, 0x19];
const dark = (x: number, y: number): [number, number, number] => ((x >> 4) + (y >> 4)) % 2 ? [24, 22, 30] : [30, 28, 38];
const scale = Number(process.env.SCALE ?? 2);
fs.writeFileSync(path.join(OUT_DIR, `contact-grass${FILTER ? "-" + FILTER.replace(/\W/g, "") : ""}.png`), sheet(grass, scale, 1400).toPng());
fs.writeFileSync(path.join(OUT_DIR, `contact-dark${FILTER ? "-" + FILTER.replace(/\W/g, "") : ""}.png`), sheet(dark, scale, 1400).toPng());
console.log(`${items.length} generated assets → ${OUT_DIR}`);
