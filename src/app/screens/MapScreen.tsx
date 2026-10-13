import { useEffect, useState } from "react";
import { MINIMAP_COLORS } from "@/config/palette";
import { content } from "@/content/registry";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { Modal, Tabs } from "@/ui/menu/components";
import { destinationName, MapView, useFog } from "../hud/MapView";
import { WorldMap } from "./WorldMap";
import { parseRiftMapId } from "@/core/world/riftgen";
import { localized } from "../items";
import { useSheetTabs } from "../sheetTabs";

/** Room the modal chrome (title, legend, margins) takes around the map (px); less on short screens. */
const chrome = () => (window.innerHeight <= 520 ? { w: 80, h: 230 } : { w: 120, h: 330 });

const fit = (w: number, h: number) => {
  const c = chrome();
  return Math.max(2, Math.min(12, (window.innerWidth - c.w) / w, (window.innerHeight - c.h) / h));
};

type View = "zone" | "world";
/** Remembered while the game runs: reopening the map shows the view you left. */
let lastView: View = "zone";

/** M / Back / pause menu: the current map (fog of war, exits named, legend) or the known world. */
export function MapScreen() {
  const layout = useGameStatus((s) => s.minimap);
  const markers = useGameStatus((s) => s.markers);
  const back = useMenu((s) => s.back);
  const fog = useFog(layout?.map);
  const [view, setView] = useState<View>(lastView);
  const pick = (v: View) => setView((lastView = v));
  const tabs = useSheetTabs("map");
  const [scale, setScale] = useState(() => (layout ? fit(layout.width, layout.height) : 4));
  useEffect(() => {
    if (!layout) return;
    const onResize = () => setScale(fit(layout.width, layout.height));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [layout]);
  if (!layout) return null;
  const zone = content.zones.find(layout.zone);
  const legend = [
    ["me", t("map.you")],
    ["ally", t("map.ally")],
    ["npc", t("map.npc")],
    ["enemy", t("map.enemy")],
    ["chest", t("map.chest")],
    ["portal", t("map.exit")],
    ["fog", t("map.unexplored")],
  ] as const;
  const c = chrome();
  return (
    <Modal title={view === "world" ? t("map.world") : parseRiftMapId(layout.map) ? destinationName(layout.map) : zone ? localized(zone.name) : t("map.title")} onBack={back} wide tabs={tabs}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-full max-w-xs">
          <Tabs<View> tabs={[{ id: "zone", label: t("map.zoneView") }, { id: "world", label: t("map.world") }]} value={view} onChange={pick} />
        </div>
        {view === "world" ? (
          <WorldMap maxW={Math.min(window.innerWidth - c.w, 860)} maxH={window.innerHeight - c.h - 40} />
        ) : (
          <>
            <div className="overflow-hidden rounded-tile border border-border">
              <MapView layout={layout} markers={markers} scale={scale} labels fog={fog} />
            </div>
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-text-secondary">
              {legend.map(([kind, label]) => (
                <li key={kind} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-2.5 ${kind === "chest" || kind === "portal" || kind === "fog" ? "" : "rounded-full"}`} style={{ background: MINIMAP_COLORS[kind] }} />
                  {label}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
