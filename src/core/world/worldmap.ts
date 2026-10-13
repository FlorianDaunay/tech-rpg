/**
 * World map layout, derived from the maps themselves: starting from the hub, each map reached
 * through an exit is placed beside the edge that exit sits on, shifted so the exit lines up with the
 * arrival point. Adding a map with its portals is enough for it to appear in the right place.
 */

export interface WorldMapInput {
  id: string;
  width: number;
  height: number;
  portals: { cx: number; cy: number; w: number; h: number; to: string; arrive: string }[];
  spawns: { id: string; kind: string; cx: number; cy: number }[];
}

export interface WorldPlacement {
  id: string;
  /** Top-left, in tiles of world space. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorldLink {
  from: string;
  to: string;
  /** Exit centre in world tiles, on the `from` map. */
  x: number;
  y: number;
}

export interface WorldLayout {
  maps: WorldPlacement[];
  links: WorldLink[];
  /** Bounding box of every placed map. */
  bounds: { x: number; y: number; w: number; h: number };
}

/** Empty tiles between neighbouring maps. */
const GAP = 6;

type Side = "left" | "right" | "top" | "bottom";

/** The map edge a portal is closest to, and how far from it (0 = on the edge). */
function sideOf(m: WorldMapInput, p: WorldMapInput["portals"][number]): [Side, number] {
  const d: [Side, number][] = [
    ["left", p.cx],
    ["right", m.width - (p.cx + p.w)],
    ["top", p.cy],
    ["bottom", m.height - (p.cy + p.h)],
  ];
  return d.sort((a, b) => a[1] - b[1])[0]!;
}

/** Rectangles share any cell (touching corners is fine: neighbours already keep a GAP). */
const overlaps = (a: WorldPlacement, b: WorldPlacement) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function worldLayout(maps: readonly WorldMapInput[], root: string): WorldLayout {
  const byId = new Map(maps.map((m) => [m.id, m]));
  const placed = new Map<string, WorldPlacement>();
  const links: WorldLink[] = [];
  const start = byId.get(root);
  if (!start) return { maps: [], links: [], bounds: { x: 0, y: 0, w: 0, h: 0 } };
  placed.set(root, { id: root, x: 0, y: 0, width: start.width, height: start.height });
  const queue = [root];
  while (queue.length) {
    const a = byId.get(queue.shift()!)!;
    const pa = placed.get(a.id)!;
    // Real edge exits first (doors inside a map come after and make room), then by position, so the
    // layout never depends on file order.
    for (const p of [...a.portals].sort((x, y) => sideOf(a, x)[1] - sideOf(a, y)[1] || x.cy - y.cy || x.cx - y.cx)) {
      const b = byId.get(p.to);
      const ex = pa.x + p.cx + p.w / 2;
      const ey = pa.y + p.cy + p.h / 2;
      if (b) links.push({ from: a.id, to: b.id, x: ex, y: ey });
      if (!b || placed.has(b.id)) continue;
      const arrive = b.spawns.find((s) => s.id === p.arrive) ?? { cx: b.width / 2, cy: b.height / 2 };
      const [side] = sideOf(a, p);
      const pb: WorldPlacement = { id: b.id, x: 0, y: 0, width: b.width, height: b.height };
      if (side === "left" || side === "right") {
        pb.x = side === "right" ? pa.x + pa.width + GAP : pa.x - b.width - GAP;
        pb.y = Math.round(ey - arrive.cy);
      } else {
        pb.y = side === "bottom" ? pa.y + pa.height + GAP : pa.y - b.height - GAP;
        pb.x = Math.round(ex - arrive.cx);
      }
      // Two exits on the same side (hub: the mines and the arena both go south): slide the newcomer
      // along the edge to the nearest clear spot, either way.
      const along = side === "left" || side === "right" ? [0, 1] : [1, 0];
      const base = { x: pb.x, y: pb.y };
      for (let k = 1; k < 400 && [...placed.values()].some((o) => overlaps(o, pb)); k++) {
        const shift = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2;
        pb.x = base.x + along[0]! * shift;
        pb.y = base.y + along[1]! * shift;
      }
      placed.set(b.id, pb);
      queue.push(b.id);
    }
  }
  const all = [...placed.values()];
  const minX = Math.min(...all.map((m) => m.x));
  const minY = Math.min(...all.map((m) => m.y));
  const maxX = Math.max(...all.map((m) => m.x + m.width));
  const maxY = Math.max(...all.map((m) => m.y + m.height));
  return { maps: all, links, bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}
