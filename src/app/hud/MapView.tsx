import { useEffect, useRef } from "react";
import type { MapMarker, MinimapLayout } from "@/bridge/events";
import { MINIMAP_COLORS } from "@/config/palette";
import { content } from "@/content/registry";
import { localized } from "../items";

/** Marker radius in screen px (stays readable at any map scale). */
const RADIUS: Record<MapMarker["kind"], number> = { me: 3.2, ally: 2.6, enemy: 2, npc: 2.4, chest: 2.4 };

/** Zone name of the map a portal leads to. */
export function destinationName(map: string): string {
  const m = content.maps.find(map);
  const z = m && content.zones.find(m.zone);
  return z ? localized(z.name) : map;
}

/**
 * A map at `scale` px per cell: terrain as a pixelated canvas (drawn once per layout), exits and
 * markers as crisp SVG on top. `labels` adds the exit destinations (map screen).
 */
export function MapView({ layout, markers, scale, labels = false }: { layout: MinimapLayout; markers: MapMarker[]; scale: number; labels?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = layout.width;
    c.height = layout.height;
    const img = ctx.createImageData(layout.width, layout.height);
    const rgb = layout.palette.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const);
    layout.cells.forEach((p, i) => {
      const [r, g, b] = rgb[p] ?? rgb[0]!;
      img.data.set([r, g, b, 255], i * 4);
    });
    ctx.putImageData(img, 0, 0);
  }, [layout]);

  const w = layout.width * scale;
  const h = layout.height * scale;
  return (
    <div className="relative" style={{ width: w, height: h }}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
      <svg className="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        {layout.portals.map((p, i) => (
          <rect key={i} x={p.x * scale} y={p.y * scale} width={Math.max(p.w * scale, 3)} height={Math.max(p.h * scale, 3)} fill={MINIMAP_COLORS.portal} fillOpacity={0.55} stroke={MINIMAP_COLORS.portal} strokeWidth={1} />
        ))}
        {markers.map((m, i) =>
          m.kind === "chest" ? (
            <rect key={i} x={m.x * scale - RADIUS.chest} y={m.y * scale - RADIUS.chest} width={RADIUS.chest * 2} height={RADIUS.chest * 2} fill={MINIMAP_COLORS.chest} stroke={MINIMAP_COLORS.empty} strokeWidth={0.75} />
          ) : (
            <circle key={i} cx={m.x * scale} cy={m.y * scale} r={RADIUS[m.kind]} fill={MINIMAP_COLORS[m.kind]} stroke={MINIMAP_COLORS.empty} strokeWidth={m.kind === "me" ? 1.25 : 0.75} />
          )
        )}
      </svg>
      {labels &&
        layout.portals.map((p, i) => (
          <span
            key={i}
            // Anchored by its side near the map edges, so exits on the border stay readable.
            className={`pointer-events-none absolute whitespace-nowrap rounded-control bg-canvas/80 px-1.5 py-0.5 text-[11px] text-text-primary ${
              p.x < layout.width * 0.2 ? "translate-x-0" : p.x > layout.width * 0.8 ? "-translate-x-full" : "-translate-x-1/2"
            } ${p.y < 2 ? "translate-y-0" : "-translate-y-full"}`}
            style={{ left: Math.min(w, Math.max(0, (p.x + p.w / 2) * scale)), top: p.y < 2 ? (p.y + p.h) * scale + 2 : p.y * scale - 2 }}
          >
            {destinationName(p.to)}
          </span>
        ))}
    </div>
  );
}
