/**
 * Typed event bus: the ONLY coupling between the Phaser runtime and the React UI.
 * Phaser emits state the HUD needs; React emits commands (start, pause, menu actions).
 */
import type { Command } from "@/core/sim/intent";

type Listener<T> = (payload: T) => void;

/** What the inventory screen shows: the local player's bag and gear. */
export interface InventoryView {
  bag: Record<string, number>;
  weapon: string | null;
  shield: string | null;
  hp: number;
  maxHp: number;
  stats: { power: number; defense: number; critChance: number; critMultiplier: number; speed: number };
}

export type GameMode = "solo" | "host" | "client";

export interface BridgeEvents {
  /** Title backdrop is up. */
  "game:ready": void;
  /** Asset loading progress 0..1 while entering the world. */
  "game:loading": number;
  /** The world scene is running and the HUD can show. */
  "game:world-ready": { mapId: string };
  /** Local player vitals for the HUD (sent on change, ≤ 15 Hz). */
  "game:vitals": { hp: number; maxHp: number; stamina: number; maxStamina: number; dead: boolean; gold: number; statuses: string[] };
  /** Debug overlay text (when settings.showFps). */
  "game:debug": string;
  /** Game → UI: a menu key was pressed in game (Esc/Start, Tab/I/D-pad up). */
  "game:menu": "pause" | "inventory";
  /** Local player's bag/gear changed (and once when the world starts). */
  "game:inventory": InventoryView;
  /** Entered a map: the HUD shows the zone banner. */
  "game:zone": { zone: string; map: string };
  /** Local player picked something up (toast). */
  "game:loot": { item: string; count: number };
  /** UI → game: inventory command for the local player (sent with the next Intent). */
  "ui:command": Command;
  /** UI → game: leave the title and start playing. */
  "ui:start": { mode: GameMode };
  /** UI → game: back to the title backdrop. */
  "ui:quit": void;
  "ui:pause": boolean;
}

class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, ...payload: Events[K] extends void ? [] : [Events[K]]): void {
    this.listeners.get(event)?.forEach((listener) => (listener as Listener<unknown>)(payload[0]));
  }
}

export const bridge = new EventBus<BridgeEvents>();
