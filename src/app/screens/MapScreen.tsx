import { useEffect, useState } from "react";
import { MINIMAP_COLORS } from "@/config/palette";
import { content } from "@/content/registry";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { Modal } from "@/ui/menu/components";
import { MapView } from "../hud/MapView";
import { localized } from "../items";

/** Room the modal chrome (title, legend, margins) takes around the map (px); less on short screens. */
const chrome = () => (window.innerHeight <= 520 ? { w: 80, h: 150 } : { w: 120, h: 230 });

const fit = (w: number, h: number) => {
  const c = chrome();
  return Math.max(2, Math.min(12, (window.innerWidth - c.w) / w, (window.innerHeight - c.h) / h));
};

/** M / Back / pause menu: the current map, large, with exits named and a legend. */
export function MapScreen() {
  const layout = useGameStatus((s) => s.minimap);
  const markers = useGameStatus((s) => s.markers);
  const back = useMenu((s) => s.back);
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
  ] as const;
  return (
    <Modal title={zone ? localized(zone.name) : t("map.title")} onBack={back} wide>
      <div className="flex flex-col items-center gap-3">
        <div className="overflow-hidden rounded-tile border border-border">
          <MapView layout={layout} markers={markers} scale={scale} labels />
        </div>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-text-secondary">
          {legend.map(([kind, label]) => (
            <li key={kind} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 ${kind === "chest" || kind === "portal" ? "" : "rounded-full"}`} style={{ background: MINIMAP_COLORS[kind] }} />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
