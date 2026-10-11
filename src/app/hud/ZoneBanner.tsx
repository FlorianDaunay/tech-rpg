import { useEffect, useState } from "react";
import { content } from "@/content/registry";
import { useGameStatus } from "@/store/game";
import { localized } from "../items";
import { t } from "@/i18n";

const SHOW_MS = 3600;

/**
 * Zone name + subtitle, centred, fading in and out when a map is entered. Reads the store (not the
 * bridge event) because the first `game:zone` fires before the HUD has mounted.
 */
export function ZoneBanner() {
  const enter = useGameStatus((s) => s.zoneEnter);
  const [visible, setVisible] = useState<number | null>(null);
  useEffect(() => {
    if (!enter) return;
    setVisible(enter.n);
    const t = setTimeout(() => setVisible(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [enter]);
  const def = enter && visible === enter.n ? content.zones.find(enter.zone) : undefined;
  if (!enter || !def) return null;
  // On a Rift floor: the Rift's name, then the depth.
  const rift = enter.rift && content.rifts.find(enter.rift.rift);
  const title = rift ? localized(rift.name) : localized(def.name);
  const subtitle = rift && enter.rift ? t("rift.floor", { floor: enter.rift.floor, floors: enter.rift.floors }) : def.subtitle ? localized(def.subtitle) : null;
  return (
    <div key={enter.n} className="pointer-events-none absolute inset-x-0 top-[18%] flex flex-col items-center text-center animate-[zoneBanner_3600ms_ease-in-out_both]">
      <div className="title-display text-3xl text-text-primary drop-shadow-[0_2px_10px_rgb(0_0_0/0.8)] short:text-2xl">{title}</div>
      <div className="mt-1 h-px w-48 bg-accent/70" />
      {subtitle && <div className="mt-2 font-display text-sm tracking-[0.25em] text-accent drop-shadow-[0_1px_6px_rgb(0_0_0/0.9)]">{subtitle}</div>}
    </div>
  );
}
