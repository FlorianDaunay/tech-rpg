import { useState } from "react";
import { t } from "@/i18n";
import { useInputDevice } from "@/store/input";
import { SHEET_TABS, useMenu, type SheetTab } from "@/store/menu";
import type { ModalTabs } from "@/ui/menu/components";

const LABELS = { inventory: "inventory.title", talents: "talents.title", map: "map.title", journal: "journal.title", codex: "codex.title" } as const satisfies Record<SheetTab, string>;

/** When a tab last replaced another: the sheet mounting right after skips its open animation. */
let switchedAt = -Infinity;

/** Tabs linking the character-sheet menus (inventory, talents, map, journal, codex). */
export function useSheetTabs(active: SheetTab): ModalTabs {
  const device = useInputDevice((s) => s.device);
  // Read once per mount (StrictMode renders twice: a time window, not a consumed flag).
  const [switched] = useState(() => performance.now() - switchedAt < 250);
  const swap = (fn: () => void) => {
    switchedAt = performance.now();
    fn();
  };
  return {
    items: SHEET_TABS.map((id) => ({ id, label: t(LABELS[id]) })),
    active,
    select: (id) => swap(() => useMenu.getState().open(id as SheetTab)),
    cycle: (dir) => swap(() => useMenu.getState().cycle(dir)),
    hints: device === "touch" ? null : device === "gamepad" ? ["LB", "RB"] : ["Q", "E"],
    switched,
  };
}
