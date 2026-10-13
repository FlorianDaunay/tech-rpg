import { create } from "zustand";
import { bridge } from "@/bridge/events";

export type Menu = "pause" | "inventory" | "settings" | "dialogue" | "journal" | "codex" | "talents" | "rules" | "map" | "trade" | "shop" | "forge" | "projects" | "danger" | "wardrobe";

/** The character-sheet menus: one strip of tabs links them (Q/E, LB/RB, or tap), in this order. */
export const SHEET_TABS = ["inventory", "talents", "map", "journal", "codex"] as const satisfies readonly Menu[];
export type SheetTab = (typeof SHEET_TABS)[number];
export const isSheetTab = (m: Menu | undefined): m is SheetTab => (SHEET_TABS as readonly Menu[]).includes(m as Menu);

interface MenuState {
  /** Stack of open in-game menus (settings can open over pause). Empty = playing. */
  stack: Menu[];
  open: (m: Menu) => void;
  /** Next / previous sheet tab, in place of the current one (Back still returns where it came from). */
  cycle: (dir: 1 | -1) => void;
  /** Closes the top menu. */
  back: () => void;
  closeAll: () => void;
}

/** In-game menus. While any is open in solo, the simulation is paused. */
export const useMenu = create<MenuState>()((set) => ({
  stack: [],
  // A sheet tab opened over another one replaces it (tabs are siblings, not a deeper level).
  open: (m) => set((s) => (s.stack.at(-1) === m ? s : { stack: isSheetTab(s.stack.at(-1)) && isSheetTab(m) ? [...s.stack.slice(0, -1), m] : [...s.stack, m] })),
  cycle: (dir) =>
    set((s) => {
      const top = s.stack.at(-1);
      if (!isSheetTab(top)) return s;
      const next = SHEET_TABS[(SHEET_TABS.indexOf(top) + dir + SHEET_TABS.length) % SHEET_TABS.length]!;
      return { stack: [...s.stack.slice(0, -1), next] };
    }),
  back: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  closeAll: () => set({ stack: [] }),
}));

useMenu.subscribe((s, prev) => {
  if ((s.stack.length > 0) !== (prev.stack.length > 0)) bridge.emit("ui:pause", s.stack.length > 0);
});

bridge.on("game:menu", (m) => useMenu.getState().open(m));

/** The conversation being shown (set when the game reports a talk). */
export const useDialogue = create<{ npc: string; dialogue: string } | null>()(() => null);
bridge.on("game:dialogue", (d) => {
  useDialogue.setState(d, true);
  useMenu.getState().open("dialogue");
});

/** The service a shop/forge/projects/brazier screen is about: which content entry, run by which NPC. */
export type Service = { kind: "shop" | "forge"; ref: string; npc: string } | { kind: "projects"; npc: string } | { kind: "danger"; ref: string };
export const useService = create<Service | null>()(() => null);

/** Opens a service screen in place of the conversation that offered it. */
export function openService(service: Service): void {
  useService.setState(service, true);
  const menu = useMenu.getState();
  if (menu.stack.at(-1) === "dialogue") menu.back();
  menu.open(service.kind);
}
bridge.on("game:service", ({ service, ref }) => {
  if (service === "rift-danger") openService({ kind: "danger", ref });
});
