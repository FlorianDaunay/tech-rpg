import { MINIMAP_COLORS } from "@/config/palette";
import { content } from "@/content/registry";
import { decodeFog, exploredShare, fogGrid, tileRevealed } from "@/core/world/explore";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { localized } from "../items";
import { MapView } from "../hud/MapView";

/** Room kept around the known world inside the view (tiles). */
const PAD = 8;

/**
 * Every zone the player has entered, placed where it lies in the world (core/world/worldmap), each
 * under its own fog of war. Roads join the zones; an exit you have seen that leads somewhere you
 * haven't been yet shows a "?".
 */
export function WorldMap({ maxW, maxH }: { maxW: number; maxH: number }) {
  const world = useGameStatus((s) => s.world);
  const fog = useGameStatus((s) => s.fog);
  const here = useGameStatus((s) => s.minimap?.map);
  const markers = useGameStatus((s) => s.markers);
  if (!world) return null;
  const known = new Set([...(fog?.visited ?? []), ...Object.keys(fog?.explored ?? {})]);
  const maps = world.maps.filter((m) => known.has(m.id));
  if (!maps.length) return <p className="text-sm text-text-muted">{t("map.worldEmpty")}</p>;

  // Frame the known world only: it grows as you travel.
  const x0 = Math.min(...maps.map((m) => m.x)) - PAD;
  const y0 = Math.min(...maps.map((m) => m.y)) - PAD;
  const x1 = Math.max(...maps.map((m) => m.x + m.layout.width)) + PAD;
  const y1 = Math.max(...maps.map((m) => m.y + m.layout.height)) + PAD;
  const scale = Math.max(1, Math.min(6, maxW / (x1 - x0), maxH / (y1 - y0)));
  const W = (x1 - x0) * scale;
  const H = (y1 - y0) * scale;
  const px = (x: number) => (x - x0) * scale;
  const py = (y: number) => (y - y0) * scale;

  const placed = new Map(maps.map((m) => [m.id, m]));
  // An exit counts as seen once its cell is explored on its own map.
  const exitSeen = (l: (typeof world.links)[number]) => {
    const m = placed.get(l.from);
    if (!m) return false;
    const g = fogGrid(m.layout.width, m.layout.height);
    const tx = Math.min(m.layout.width - 1, Math.max(0, Math.floor(l.x - m.x)));
    const ty = Math.min(m.layout.height - 1, Math.max(0, Math.floor(l.y - m.y)));
    return tileRevealed(decodeFog(fog?.explored[l.from], g), g, tx, ty);
  };
  const roads = world.links.filter((l) => placed.has(l.from) && placed.has(l.to) && l.from < l.to);
  const unknown = world.links.filter((l) => placed.has(l.from) && !placed.has(l.to) && exitSeen(l));

  return (
    <div className="relative overflow-hidden rounded-tile border border-border bg-canvas" style={{ width: W, height: H }}>
      <svg className="absolute inset-0" width={W} height={H} aria-hidden>
        {roads.map((l, i) => {
          const back = world.links.find((o) => o.from === l.to && o.to === l.from);
          if (!back) return null;
          return <line key={i} x1={px(l.x)} y1={py(l.y)} x2={px(back.x)} y2={py(back.y)} stroke={MINIMAP_COLORS.road} strokeWidth={Math.max(1.5, scale * 0.6)} strokeDasharray={`${scale * 1.5} ${scale}`} />;
        })}
      </svg>
      {maps.map((m) => (
        <div key={m.id} className="absolute" style={{ left: px(m.x), top: py(m.y) }}>
          <MapView layout={m.layout} markers={m.id === here ? markers : []} scale={scale} fog={fog?.explored[m.id] ?? ""} />
        </div>
      ))}
      {maps.map((m) => {
        const zone = content.zones.find(m.zone);
        const share = Math.round(exploredShare(fog?.explored[m.id], m.layout.width, m.layout.height) * 100);
        return (
          <span
            key={`label-${m.id}`}
            className={`pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-control px-1.5 py-0.5 text-[11px] ${m.id === here ? "bg-accent/25 text-accent" : "bg-canvas/80 text-text-primary"}`}
            style={{ left: px(m.x + m.layout.width / 2), top: py(m.y) + 2 }}
          >
            {zone ? localized(zone.name) : m.id} <span className="text-text-muted">· {share}%</span>
          </span>
        );
      })}
      {unknown.map((l, i) => (
        <span key={`q-${i}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-pill border border-border bg-canvas px-1.5 font-pixel text-[10px] text-accent" style={{ left: px(l.x), top: py(l.y) }}>
          ?
        </span>
      ))}
    </div>
  );
}

