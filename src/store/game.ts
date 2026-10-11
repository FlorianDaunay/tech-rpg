import { create } from "zustand";
import { bridge, type BossView, type InventoryView, type MapMarker, type MinimapLayout, type PartyView, type PvpView, type SkillView, type BridgeEvents } from "@/bridge/events";

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
  zoneEnter: { zone: string; n: number; rift?: { rift: string; floor: number; floors: number } } | null;
  minimap: MinimapLayout | null;
  boss: BossView | null;
  markers: MapMarker[];
  party: PartyView | null;
  /** Kept here (not in component state) so a HUD mounted after the event still shows it. */
  prompt: BridgeEvents["game:prompt"];
  pvp: PvpView | null;
  vitals: { hp: number; maxHp: number; stamina: number; maxStamina: number; dead: boolean; gold: number; statuses: string[]; level: number; xp: number; xpNext: number; skills: SkillView[]; ult: number } | null;
}

export const useGameStatus = create<GameStatus>()(() => ({ engineReady: false, loading: null, inWorld: false, debugText: "", vitals: null, inventory: null, zoneEnter: null, minimap: null, markers: [], boss: null, party: null, prompt: null, pvp: null }));

bridge.on("game:ready", () => useGameStatus.setState({ engineReady: true, inWorld: false, loading: null }));
bridge.on("game:loading", (p) => useGameStatus.setState({ loading: p < 1 ? p : null }));
bridge.on("game:world-ready", () => useGameStatus.setState({ inWorld: true, loading: null, prompt: null, pvp: null }));
bridge.on("game:debug", (debugText) => useGameStatus.setState({ debugText }));
bridge.on("game:vitals", (vitals) => useGameStatus.setState({ vitals }));
bridge.on("game:prompt", (prompt) => useGameStatus.setState({ prompt }));
bridge.on("game:pvp", (pvp) => useGameStatus.setState({ pvp }));
bridge.on("game:party", (party) => useGameStatus.setState({ party: party.role === "solo" ? null : party }));
bridge.on("game:inventory", (inventory) => useGameStatus.setState({ inventory }));
bridge.on("game:zone", ({ zone, rift }) => useGameStatus.setState((st) => ({ zoneEnter: { zone, rift, n: (st.zoneEnter?.n ?? 0) + 1 } })));
bridge.on("game:minimap", (minimap) => useGameStatus.setState({ minimap, markers: [] }));
bridge.on("game:markers", (markers) => useGameStatus.setState({ markers }));
bridge.on("game:boss", (boss) => useGameStatus.setState({ boss }));
bridge.on("game:world-ready", () => useGameStatus.setState({ boss: null }));
