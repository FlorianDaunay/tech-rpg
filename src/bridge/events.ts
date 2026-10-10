/**
 * Typed event bus: the ONLY coupling between the Phaser runtime and the React UI.
 * Phaser emits state the HUD needs; React emits commands (pause, resume, menu actions).
 */
type Listener<T> = (payload: T) => void;

export interface BridgeEvents {
  "game:ready": void;
  "game:fps": number;
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
