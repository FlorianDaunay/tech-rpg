import { create } from "zustand";
import { bridge, type InventoryView } from "@/bridge/events";

/** Runtime status of the Phaser side, mirrored for the React UI. */
interface GameStatus {
  /** Engine booted and the title backdrop is running. */
  engineReady: boolean;
  /** Loading progress 0..1, or null when not loading. */
  loading: number | null;
  inWorld: boolean;
  debugText: string;
  inventory: InventoryView | null;
  /** Last zone entered; `n` increments on every map entry (the banner replays). */
  zoneEnter: { zone: string; n: number } | null;
  vitals: { hp: number; maxHp: number; stamina: number; maxStamina: number; dead: boolean; gold: number; statuses: string[] } | null;
}

export const useGameStatus = create<GameStatus>()(() => ({ engineReady: false, loading: null, inWorld: false, debugText: "", vitals: null, inventory: null, zoneEnter: null }));

bridge.on("game:ready", () => useGameStatus.setState({ engineReady: true, inWorld: false, loading: null }));
bridge.on("game:loading", (p) => useGameStatus.setState({ loading: p < 1 ? p : null }));
bridge.on("game:world-ready", () => useGameStatus.setState({ inWorld: true, loading: null }));
bridge.on("game:debug", (debugText) => useGameStatus.setState({ debugText }));
bridge.on("game:vitals", (vitals) => useGameStatus.setState({ vitals }));
bridge.on("game:inventory", (inventory) => useGameStatus.setState({ inventory }));
bridge.on("game:zone", ({ zone }) => useGameStatus.setState((st) => ({ zoneEnter: { zone, n: (st.zoneEnter?.n ?? 0) + 1 } })));
