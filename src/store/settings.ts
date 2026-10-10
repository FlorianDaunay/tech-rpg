import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GAME } from "@/config/game";
import type { Action } from "@/core/sim/intent";
import type { Lang } from "@/i18n";

/** Physical key codes (`KeyboardEvent.code`) so layouts like AZERTY get the same positions. */
export type Binding = string; // "KeyW", "Space", "Mouse0", "Mouse2"…
export type MoveDir = "up" | "down" | "left" | "right";

export const DEFAULT_KEYS: Record<Action | MoveDir, Binding[]> = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  attack: ["Mouse0", "KeyJ"],
  heavy: ["Mouse2", "KeyK"],
  dodge: ["Space"],
  block: ["ShiftLeft", "KeyL"],
  skill1: ["KeyQ"],
  skill2: ["KeyE"],
  ultimate: ["KeyR"],
  interact: ["KeyF"],
  pause: ["Escape"],
  map: ["KeyM"],
  inventory: ["Tab", "KeyI"],
};

export type TouchMode = "auto" | "always" | "never";

interface SettingsValues {
  lang: Lang | null;
  keys: Record<Action | MoveDir, Binding[]>;
  volume: { master: number; music: number; sfx: number };
  touchControls: TouchMode;
  /** Left-handed: swap stick and action cluster. */
  touchLeftHanded: boolean;
  aimAssist: boolean;
  /** 0..1 multiplier on camera shake (accessibility). */
  screenShake: number;
  haptics: boolean;
  showFps: boolean;
}

interface SettingsState extends SettingsValues {
  set: (patch: Partial<SettingsValues>) => void;
  rebind: (action: Action | MoveDir, bindings: Binding[]) => void;
  resetKeys: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: null,
      keys: DEFAULT_KEYS,
      volume: { master: 0.8, music: 0.6, sfx: 0.8 },
      touchControls: "auto",
      touchLeftHanded: false,
      aimAssist: true,
      screenShake: 1,
      haptics: true,
      showFps: false,
      set: (patch) => set(patch),
      rebind: (action, bindings) => set((s) => ({ keys: { ...s.keys, [action]: bindings } })),
      resetKeys: () => set({ keys: DEFAULT_KEYS }),
    }),
    {
      name: `${GAME.storagePrefix}-settings`,
      version: 1,
      // Actions added in later versions get their default bindings.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsValues>;
        return { ...current, ...p, keys: { ...DEFAULT_KEYS, ...p.keys }, volume: { ...current.volume, ...p.volume } };
      },
    }
  )
);
