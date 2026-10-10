import { create } from "zustand";

export type InputDevice = "keyboard" | "gamepad" | "touch";

/** Last device used: drives touch-controls visibility and button prompts. */
export const useInputDevice = create<{ device: InputDevice; setDevice: (d: InputDevice) => void }>()((set) => ({
  device: "keyboard",
  setDevice: (device) => set((s) => (s.device === device ? s : { device })),
}));
