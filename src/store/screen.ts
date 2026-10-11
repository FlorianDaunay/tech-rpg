import { create } from "zustand";

/** Top-level screens. A game doesn't need URLs: one state machine, no router. */
export type Screen = "title" | "solo" | "saves" | "newgame" | "multi" | "settings" | "credits" | "soundtest";

interface ScreenState {
  screen: Screen;
  go: (screen: Screen) => void;
}

export const useScreen = create<ScreenState>()((set) => ({
  screen: "title",
  go: (screen) => set({ screen }),
}));
