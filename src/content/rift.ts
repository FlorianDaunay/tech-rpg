import { generateRift, parseRiftMapId, riftMapId } from "@/core/world/riftgen";
import { createRng, hashSeed } from "@/core/math/rng";
import { content } from "./registry";
import { MapSchema, type MapContent } from "./schemas/map";
import type { RiftContent } from "./schemas/rift";

/**
 * Rift floors are maps built on demand (`riftMapId`). They never exist as files, so
 * saves made inside a Rift fall back to the hub (a run is meant to be played in one go).
 */
const FLOOR = "r";
const WALL = "V";

/** Builds one Rift floor as ordinary map content (validated by the map schema, so defaults apply). */
export function riftFloorContent(rift: RiftContent, seed: number, floor: number): MapContent {
  const f = generateRift(seed, floor);
  const id = riftMapId(rift.id, seed, floor);
  const last = floor >= rift.floors;
  // Enemy picks come from their own stream so they don't shift the layout.
  const rng = createRng(hashSeed(`${id}:spawns`));
  const pick = (pool: RiftContent["enemies"]) => {
    const ok = pool.filter((p) => p.fromFloor <= floor);
    return rng.weighted((ok.length ? ok : pool).map((p) => [p.enemy, p.weight] as const));
  };
  const spawns: MapContent["spawns"] = [{ id: "start", kind: "player", cx: f.start.x, cy: f.start.y }];
  // Chests are solid: nothing may spawn under one.
  const blocked = new Set([...f.chests.map((c) => `${c.x},${c.y}`), ...(last ? [`${f.exit.x},${f.exit.y - 2}`] : [])]);
  f.enemies.filter((e) => !blocked.has(`${e.x},${e.y}`)).forEach((e, i) => spawns.push({ id: `e${i}`, kind: "enemy", cx: e.x, cy: e.y, ref: pick(e.elite ? rift.elites : rift.enemies) }));
  const objects: MapContent["objects"] = [];
  f.chests.forEach((c, i) => objects.push({ asset: "props/chest", frame: 0, cx: c.x, cy: c.y, footprint: [1, 1], flipX: false, chest: { id: `chest-${i}`, loot: rift.chestLoot } }));
  if (last) objects.push({ asset: "props/chest", frame: 0, cx: f.exit.x, cy: f.exit.y - 2, footprint: [1, 1], flipX: false, chest: { id: "final", loot: rift.finalLoot } });
  // The exit: a 2×2 opening between two glowing spires.
  for (const dx of [-2, 2])
    objects.push({ asset: rift.gate.prop, frame: 0, cx: f.exit.x + dx, cy: f.exit.y + 1, flipX: dx > 0, light: { radius: 70, color: rift.gate.light as "rift", intensity: 0.9, flicker: true, offsetY: -16 } });
  const raw = {
    id,
    name: rift.name,
    zone: rift.zone,
    width: f.width,
    height: f.height,
    legend: { [FLOOR]: rift.tiles.floor, [WALL]: rift.tiles.wall },
    layers: [
      { id: "ground", rows: f.rows.map((r) => FLOOR.repeat(r.length)) },
      { id: "terrain", rows: f.rows.map((r) => r.replaceAll("#", WALL)) },
    ],
    objects,
    spawns,
    portals: [
      {
        id: "exit",
        cx: f.exit.x,
        cy: f.exit.y,
        w: 2,
        h: 2,
        to: last ? rift.exitTo : riftMapId(rift.id, seed, floor + 1),
        arrive: last ? rift.exitArrive : "start",
      },
    ],
  };
  return MapSchema.parse(raw);
}

/**
 * Where a portal really leads: a Rift id starts its first floor of the run `seed` (the daily seed in
 * play), anything else is a map + arrival spawn as authored.
 */
export function resolvePortal(to: string, arrive: string, seed: number): { map: string; arrive: string } {
  return content.rifts.find(to) ? { map: riftMapId(to, seed, 1), arrive: "start" } : { map: to, arrive };
}

/** Any map by id: authored maps from content, Rift floors generated. */
export function findMapContent(id: string): MapContent | undefined {
  const r = parseRiftMapId(id);
  if (!r) return content.maps.find(id);
  const rift = content.rifts.find(r.rift);
  return rift ? riftFloorContent(rift, r.seed, r.floor) : undefined;
}

export { parseRiftMapId, riftMapId };
