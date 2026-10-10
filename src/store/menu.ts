import { create } from "zustand";
import { bridge } from "@/bridge/events";

export type Menu = "pause" | "inventory" | "settings";

interface MenuState {
  /** Stack of open in-game menus (settings can open over pause). Empty = playing. */
  stack: Menu[];
  open: (m: Menu) => void;
  /** Closes the top menu. */
  back: () => void;
  closeAll: () => void;
}

/** In-game menus. While any is open in solo, the simulation is paused. */
export const useMenu = create<MenuState>()((set) => ({
  stack: [],
  open: (m) => set((s) => (s.stack.at(-1) === m ? s : { stack: [...s.stack, m] })),
  back: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  closeAll: () => set({ stack: [] }),
}));

useMenu.subscribe((s, prev) => {
  if ((s.stack.length > 0) !== (prev.stack.length > 0)) bridge.emit("ui:pause", s.stack.length > 0);
});

bridge.on("game:menu", (m) => useMenu.getState().open(m));
