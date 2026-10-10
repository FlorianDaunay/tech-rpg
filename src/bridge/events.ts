/**
 * Typed event bus: the ONLY coupling between the Phaser runtime and the React UI.
 * Phaser emits state the HUD needs; React emits commands (start, pause, menu actions).
 */
type Listener<T> = (payload: T) => void;

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
