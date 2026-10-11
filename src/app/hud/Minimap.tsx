import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { useSettings } from "@/store/settings";
import { MapView } from "./MapView";

/** Largest minimap box (px); the whole map is fitted inside, cells stay square. */
const BOX = { w: 150, h: 110 };

/** Whole-map overview in the top-right corner. Tap / click opens the map screen. */
export function Minimap() {
  const layout = useGameStatus((s) => s.minimap);
  const markers = useGameStatus((s) => s.markers);
  const enabled = useSettings((s) => s.minimap);
  const open = useMenu((s) => s.open);
  if (!layout || !enabled) return null;
  const scale = Math.min(BOX.w / layout.width, BOX.h / layout.height);
  return (
    <button
      aria-label={t("map.title")}
      className="safe pointer-events-auto absolute right-3 top-16 overflow-hidden rounded-tile border border-border opacity-90 shadow-card transition hover:opacity-100 short:top-14"
      onClick={() => open("map")}
    >
      <MapView layout={layout} markers={markers} scale={scale} />
    </button>
  );
}
