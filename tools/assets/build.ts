/**
 * npm run assets
 *   1. copy the files listed in manifest.ts from ref_sprites/ (read-only!) into public/assets/
 *   2. run the procedural generators → public/assets/ (+ a mirror under ref_sprites/generated/)
 *   3. write public/assets/index.json
 * Output is deterministic: running it twice yields identical bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as palette from "../../src/config/palette";
import { createRng, hashSeed } from "../../src/core/math/rng";
import { GENERATORS } from "./generators";
import { MANIFEST } from "./manifest";
import { Canvas, mix } from "./png";
import { ASSET_KINDS, type AssetEntry, type AssetIndex } from "./types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REF = path.join(ROOT, "ref_sprites");
const MIRROR = path.join(REF, "generated");
const OUT = path.join(ROOT, "public", "assets");

const KEBAB_PATH = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\.(png|json)$/;

function within(dir: string, file: string) {
  const rel = path.relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function writeOut(rel: string, data: Buffer) {
  const file = path.join(OUT, rel);
  if (!within(OUT, file)) throw new Error(`refusing to write outside public/assets: ${rel}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

/** The ONLY write ever made under ref_sprites/: our own generated art, inside ref_sprites/generated/. */
function writeMirror(rel: string, data: Buffer) {
  const file = path.join(MIRROR, rel);
  if (!within(MIRROR, file)) throw new Error(`refusing to write outside ref_sprites/generated: ${rel}`);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(data)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function pngSize(buf: Buffer) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function main() {
  if (!fs.existsSync(REF)) {
    console.error("ref_sprites/ not found: assets are committed in public/assets, nothing to rebuild here.");
    process.exit(1);
  }
  // Clean output so removed entries don't linger (public/assets is fully owned by this script).
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const entries: AssetEntry[] = [];
  const seen = new Set<string>();
  const add = (e: Omit<AssetEntry, "key">) => {
    if (!KEBAB_PATH.test(e.path)) throw new Error(`asset path must be kebab-case: ${e.path}`);
    if (seen.has(e.path)) throw new Error(`duplicate asset path: ${e.path}`);
    seen.add(e.path);
    const { path: p, kind, frameWidth, frameHeight, frames, meta } = e;
    const entry: AssetEntry = { key: p.replace(/\.[a-z]+$/, ""), path: p, kind };
    if (frameWidth !== undefined) entry.frameWidth = frameWidth;
    if (frameHeight !== undefined) entry.frameHeight = frameHeight;
    if (frames !== undefined) entry.frames = frames;
    if (meta !== undefined) entry.meta = meta;
    entries.push(entry);
  };

  /** Crop, then the optional recolour of a manifest entry. */
  function transform(m: (typeof MANIFEST)[number], src: Canvas): Canvas {
    const c = m.crop ? src.crop(m.crop.x, m.crop.y, m.crop.w, m.crop.h) : src;
    if (m.recolor) {
      const { ramp, keep } = m.recolor;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const [r, g, b, a] = c.get(x, y);
          if (!a) continue;
          const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
          const t = lum * (ramp.length - 1);
          const i = Math.min(ramp.length - 2, Math.floor(t));
          const [nr, ng, nb] = mix(ramp[i]!, ramp[i + 1]!, t - i);
          c.set(x, y, [nr + (r - nr) * keep, ng + (g - ng) * keep, nb + (b - nb) * keep], a);
        }
    }
    return c;
  }

  // 1. copy
  let copied = 0;
  for (const m of MANIFEST) {
    const src = path.join(REF, m.from);
    if (!fs.existsSync(src)) throw new Error(`manifest source missing: ref_sprites/${m.from}`);
    const raw = fs.readFileSync(src);
    const data = m.crop || m.recolor ? transform(m, Canvas.fromPng(raw)).toPng() : raw;
    writeOut(m.to, data);
    const size = pngSize(data);
    add({
      path: m.to,
      kind: m.kind,
      frameWidth: m.wholeFrame ? size.w : m.frameWidth,
      frameHeight: m.wholeFrame ? size.h : m.frameHeight,
      frames: m.frames,
      meta: { ...m.meta, source: m.from },
    });
    copied++;
  }

  // 2. generate
  let generated = 0;
  for (const [name, gen] of Object.entries(GENERATORS)) {
    const rng = createRng(hashSeed(`valaria-assets:${name}`));
    for (const a of gen(rng, palette)) {
      const { png, ...info } = a;
      writeOut(a.path, png);
      writeMirror(a.path, png);
      add({ ...info, meta: { ...info.meta, generator: name } });
      generated++;
    }
  }

  // 3. index
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const index: AssetIndex = { version: 1, kinds: ASSET_KINDS, assets: entries };
  writeOut("index.json", Buffer.from(JSON.stringify(index, null, 1) + "\n"));
  console.log(`assets: ${copied} copied, ${generated} generated, ${entries.length} indexed → public/assets/index.json`);
}

main();
