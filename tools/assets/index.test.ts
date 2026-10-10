import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ASSET_KINDS } from "./types";

const ROOT = path.resolve(__dirname, "../..");
const ASSETS = path.join(ROOT, "public/assets");
const INDEX = path.join(ASSETS, "index.json");

const Entry = z
  .object({
    key: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)*$/),
    path: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)*\.png$/),
    kind: z.enum(ASSET_KINDS),
    frameWidth: z.number().int().positive().optional(),
    frameHeight: z.number().int().positive().optional(),
    frames: z.number().int().positive().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const Index = z.object({ version: z.literal(1), kinds: z.array(z.enum(ASSET_KINDS)), assets: z.array(Entry).min(1) });

const pngSize = (buf: Buffer) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

describe.runIf(fs.existsSync(INDEX))("public/assets/index.json", () => {
  const index = Index.parse(JSON.parse(fs.readFileSync(INDEX, "utf8")));

  it("has unique keys equal to the path without extension", () => {
    const keys = new Set<string>();
    for (const a of index.assets) {
      expect(a.key).toBe(a.path.replace(/\.png$/, ""));
      expect(keys.has(a.key), a.key).toBe(false);
      keys.add(a.key);
    }
  });

  it("lists only files that exist, with frames that fit the image", () => {
    for (const a of index.assets) {
      const file = path.join(ASSETS, a.path);
      expect(fs.existsSync(file), a.path).toBe(true);
      const buf = fs.readFileSync(file);
      expect(buf.subarray(1, 4).toString(), a.path).toBe("PNG");
      if (a.frameWidth && a.frameHeight) {
        const { w, h } = pngSize(buf);
        expect(w % a.frameWidth, `${a.path} width`).toBe(0);
        expect(h % a.frameHeight, `${a.path} height`).toBe(0);
        if (a.frames) expect(a.frames, `${a.path} frames`).toBeLessThanOrEqual((w / a.frameWidth) * (h / a.frameHeight));
      }
    }
  });

  it("indexes every PNG under public/assets", () => {
    const listed = new Set(index.assets.map((a) => a.path));
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
    for (const f of walk(ASSETS).filter((f) => f.endsWith(".png"))) expect(listed.has(path.relative(ASSETS, f).split(path.sep).join("/")), f).toBe(true);
  });

  it("covers the core families", () => {
    const kinds = new Set(index.assets.map((a) => a.kind));
    for (const k of ["character", "enemy", "boss", "tileset", "prop", "weapon", "shield", "vfx", "light", "ui"] as const) expect(kinds.has(k), k).toBe(true);
  });

  it("credits every copied family", () => {
    const credits = JSON.parse(fs.readFileSync(path.join(ROOT, "src/content/data/credits.json"), "utf8")) as { credits: { id: string }[] };
    const ids = new Set(credits.credits.map((c) => c.id));
    for (const a of index.assets) if (typeof a.meta?.credit === "string") expect(ids.has(a.meta.credit), `${a.path} → ${a.meta.credit}`).toBe(true);
  });
});
