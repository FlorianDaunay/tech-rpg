import { useEffect, useState } from "react";
import { bridge } from "@/bridge/events";
import { RARITY_COLORS } from "@/config/palette";
import { t } from "@/i18n";
import { ItemIcon, itemInfo, localized } from "../items";
import { useShortScreen } from "@/ui/useShortScreen";

interface Toast {
  key: number;
  item: string;
  count: number;
}

const LIFETIME = 2600;
const MAX = 5;
const MAX_SHORT = 3;

/** "+2 Hollow Dust" feed, bottom-left. Same item picked up again bumps the existing toast. */
export function LootToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const short = useShortScreen();
  useEffect(() => {
    let n = 0;
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const expire = (key: number) => {
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => setToasts((list) => list.filter((x) => x.key !== key)), LIFETIME));
    };
    const off = bridge.on("game:loot", ({ item, count }) => {
      setToasts((list) => {
        const same = list.find((x) => x.item === item);
        if (same) {
          expire(same.key);
          return list.map((x) => (x === same ? { ...x, count: x.count + count } : x));
        }
        const key = ++n;
        expire(key);
        return [...list, { key, item, count }].slice(-MAX);
      });
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    // Phones: on the right, under the (small) minimap and above the action buttons.
    <div className="safe pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 short:bottom-auto short:left-auto short:right-3 short:top-[8.25rem] short:items-end short:gap-1">
      {(short ? toasts.slice(-MAX_SHORT) : toasts).map((x) => {
        const info = itemInfo(x.item);
        const name = info ? localized(info.def.name) : x.item;
        return (
          <div key={x.key} className="flex items-center gap-2 rounded-tile border border-border bg-canvas/90 py-1 pl-1 pr-3 shadow-card animate-[fadeUp_200ms_ease-out_both] short:py-0.5 short:pr-2">
            <ItemIcon id={x.item} size={short ? 22 : 28} />
            <span className="text-sm font-semibold drop-shadow short:text-xs" style={info ? { color: RARITY_COLORS[info.def.rarity] } : undefined}>
              {t("hud.loot", { count: x.count, name })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
