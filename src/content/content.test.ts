import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toGameMap } from "./maps";
import { findMapContent, resolvePortal } from "./rift";
import { findRefs } from "./refs";
import { content, idsOf, schemas, validateAllContent, type ContentType } from "./registry";

const TYPES = Object.keys(schemas) as ContentType[];
const all = (type: ContentType) => (content as unknown as Record<string, { all(): unknown[] }>)[collectionName(type)]!.all();
const collectionName = (type: ContentType) =>
  ({ zone: "zones", map: "maps", lore: "lore", move: "moves", enemy: "enemies", status: "statuses", reaction: "reactions", sword: "swords", shield: "shields", item: "items", loot: "loot", npc: "npcs", dialogue: "dialogues", quest: "quests", progression: "progression", skill: "skills", talent: "talents", affix: "affixes", set: "sets", difficulty: "difficulties", omen: "omens", rift: "rifts", pet: "pets" })[type];
const assetKeys = new Set(
  (JSON.parse(readFileSync("public/assets/index.json", "utf8")) as { assets: { key: string }[] }).assets.map((a) => a.key)
);

describe("content", () => {
  it("every content file matches its schema, ids are unique", () => {
    expect(validateAllContent()).toEqual([]);
  });

  it("every reference points to existing content", () => {
    const missing: string[] = [];
    for (const type of TYPES) {
      for (const entry of all(type)) {
        for (const r of findRefs(schemas[type], entry)) {
          if (!r.types.some((t) => idsOf(t as ContentType).has(r.id)))
            missing.push(`${type} "${(entry as { id: string }).id}" ${r.path} → ${r.types.join("/")} "${r.id}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("a sword or shield belongs to one gear set at most", () => {
    const owner = new Map<string, string>();
    const twice: string[] = [];
    for (const set of content.sets.all())
      for (const piece of set.pieces) {
        if (owner.has(piece)) twice.push(`${piece}: ${owner.get(piece)} + ${set.id}`);
        owner.set(piece, set.id);
      }
    expect(twice).toEqual([]);
  });

  it("every asset key exists in public/assets", () => {
    const bad: string[] = [];
    const check = (owner: string, key: string | undefined) => key && !assetKeys.has(key) && bad.push(`${owner}: ${key}`);
    for (const e of content.enemies.all()) check(`enemy ${e.id}`, e.look);
    for (const s of content.swords.all()) check(`sword ${s.id}`, s.icon);
    for (const s of content.shields.all()) check(`shield ${s.id}`, s.icon);
    for (const i of content.items.all()) check(`item ${i.id}`, i.icon);
    expect(bad).toEqual([]);
  });

  it("every map has a player spawn on a walkable cell and valid enemy spawns", () => {
    for (const m of content.maps.all()) {
      const map = toGameMap(m);
      const spawn = map.spawns.find((s) => s.kind === "player");
      expect(spawn, `${m.id} has no player spawn`).toBeDefined();
      for (const s of map.spawns) {
        const cx = Math.floor(s.x / map.tileSize);
        const cy = Math.floor(s.y / map.tileSize);
        expect(map.solid[cy * map.width + cx], `${m.id} spawn ${s.id} is inside a wall`).toBe(0);
        if (s.kind === "enemy") expect(content.enemies.find(s.ref ?? ""), `${m.id} spawn ${s.id}: unknown enemy "${s.ref}"`).toBeDefined();
      }
    }
  });

  it("portals lead to a player spawn that isn't itself inside a portal, and can be walked into", () => {
    for (const m of content.maps.all()) {
      const map = toGameMap(m);
      for (const p of map.portals) {
        const dest = resolvePortal(p.to, p.arrive, 12345);
        const target = toGameMap(findMapContent(dest.map)!);
        const arrive = target.spawns.find((s) => s.id === dest.arrive && s.kind === "player");
        expect(arrive, `${m.id} portal ${p.id}: no player spawn "${dest.arrive}" in ${dest.map}`).toBeDefined();
        const bounced = target.portals.some((q) => arrive!.x >= q.x && arrive!.x < q.x + q.w && arrive!.y >= q.y && arrive!.y < q.y + q.h);
        expect(bounced, `${m.id} portal ${p.id}: arrival "${p.arrive}" is inside a portal of ${p.to}`).toBe(false);
        let walkable = 0;
        for (let y = p.y; y < p.y + p.h; y += map.tileSize)
          for (let x = p.x; x < p.x + p.w; x += map.tileSize) if (!map.solid[(y / map.tileSize) * map.width + x / map.tileSize]) walkable++;
        expect(walkable, `${m.id} portal ${p.id} is entirely solid`).toBeGreaterThan(0);
      }
    }
  });

  it("every spawn and portal is reachable on foot from the map's first player spawn", () => {
    const problems: string[] = [];
    for (const m of content.maps.all()) {
      const map = toGameMap(m);
      const start = map.spawns.find((s) => s.kind === "player")!;
      const cell = (px: number) => Math.floor(px / map.tileSize);
      const seen = new Uint8Array(map.width * map.height);
      const queue: number[] = [cell(start.y) * map.width + cell(start.x)];
      seen[queue[0]!] = 1;
      while (queue.length) {
        const i = queue.pop()!;
        const x = i % map.width;
        const y = (i - x) / map.width;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
          const j = ny * map.width + nx;
          if (seen[j] || map.solid[j]) continue;
          seen[j] = 1;
          queue.push(j);
        }
      }
      for (const s of map.spawns) if (!seen[cell(s.y) * map.width + cell(s.x)]) problems.push(`${m.id}: spawn ${s.id} unreachable`);
      for (const p of map.portals) {
        let any = false;
        for (let y = cell(p.y); y < cell(p.y + p.h); y++) for (let x = cell(p.x); x < cell(p.x + p.w); x++) any ||= !!seen[y * map.width + x];
        if (!any) problems.push(`${m.id}: portal ${p.id} unreachable`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("talent constellations: one star per cell, prerequisites in the same tree on an earlier row", () => {
    const problems: string[] = [];
    const cells = new Set<string>();
    for (const t of content.talents.all()) {
      const cell = `${t.tree}:${t.x},${t.y}`;
      if (cells.has(cell)) problems.push(`${t.id}: cell ${cell} taken`);
      cells.add(cell);
      for (const r of t.requires) {
        const req = content.talents.find(r);
        if (req && (req.tree !== t.tree || req.y >= t.y)) problems.push(`${t.id}: requires ${r} (other tree or not above)`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("the player progression curve exists", () => {
    expect(content.progression.find("player")).toBeDefined();
  });

  it("each element pair has at most one reaction", () => {
    const pairs = content.reactions.all().map((r) => `${r.on}+${r.by}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("combo chains end (no cycles)", () => {
    for (const start of content.moves.all()) {
      const seen = new Set<string>();
      let m: typeof start | undefined = start;
      while (m) {
        expect(seen.has(m.id), `combo cycle through ${m.id}`).toBe(false);
        seen.add(m.id);
        m = m.next ? content.moves.get(m.next) : undefined;
      }
    }
  });

  it("enemies attack with telegraphed moves (windup ≥ 0.3 s)", () => {
    for (const e of content.enemies.all()) expect(content.moves.get(e.attack).windup, e.id).toBeGreaterThanOrEqual(0.3);
  });

  it("enemy movesets are telegraphed too (windup ≥ 0.3 s, combo follow-ups excepted)", () => {
    const followUps = new Set(content.moves.all().flatMap((m) => (m.next ? [m.next] : [])));
    for (const e of content.enemies.all())
      for (const m of [...(e.moves ?? []), ...(e.boss?.phases.flatMap((p) => p.attacks) ?? [])])
        if (!followUps.has(m.move)) expect(content.moves.get(m.move).windup, `${e.id}: ${m.move}`).toBeGreaterThanOrEqual(0.3);
  });

  it("every quest can be started from a dialogue, and its giver's dialogue handles turn-in", () => {
    const choices = content.dialogues.all().flatMap((d) => Object.values(d.nodes).flatMap((n) => n.choices));
    const started = new Set(choices.flatMap((c) => c.do.flatMap((e) => ("startQuest" in e ? [e.startQuest] : []))));
    const completed = new Set(choices.flatMap((c) => c.do.flatMap((e) => ("completeQuest" in e ? [e.completeQuest] : []))));
    for (const q of content.quests.all()) {
      expect(started.has(q.id), `${q.id} is never started`).toBe(true);
      expect(completed.has(q.id), `${q.id} is never completed`).toBe(true);
    }
  });
});
