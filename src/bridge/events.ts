/**
 * Typed event bus: the ONLY coupling between the Phaser runtime and the React UI.
 * Phaser emits state the HUD needs; React emits commands (start, pause, menu actions).
 */
import type { Progress } from "@/core/narrative/progress";
import type { Command } from "@/core/sim/intent";
import type { SaveData } from "@/core/save/save";
import type { WorldRules } from "@/core/sim/rules";

type Listener<T> = (payload: T) => void;

/** A skill slot on the HUD (cooldown in seconds, ready = usable right now). */
export interface SkillView {
  slot: "skill1" | "skill2" | "ultimate";
  id: string | null;
  cd: number;
  cdMax: number;
  ready: boolean;
}

/** What the inventory screen shows: the local player's bag and gear. */
export interface InventoryView {
  bag: Record<string, number>;
  weapon: string | null;
  shield: string | null;
  hp: number;
  maxHp: number;
  stats: { power: number; defense: number; critChance: number; critMultiplier: number; speed: number };
  /** Story state: quests, flags, kills, NPCs met (journal, codex, dialogue conditions). */
  progress: Progress;
  level: number;
  /** Learned talent ranks and points left to spend. */
  talents: Record<string, number>;
  talentPoints: number;
  loadout: Record<"skill1" | "skill2" | "ultimate", string | null>;
  /** Skills that may be slotted (by level or talent). */
  unlockedSkills: string[];
  /** Weapon-mastery XP by sword family. */
  mastery: Record<string, number>;
  /** The run's difficulty, Omens and NG+ cycle. */
  rules: WorldRules;
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
  "game:vitals": { hp: number; maxHp: number; stamina: number; maxStamina: number; dead: boolean; gold: number; statuses: string[]; level: number; xp: number; xpNext: number; skills: SkillView[]; ult: number };
  /** Debug overlay text (when settings.showFps). */
  "game:debug": string;
  /** Game → UI: a menu key was pressed in game (Esc/Start, Tab/I/D-pad up). */
  "game:menu": "pause" | "inventory" | "talents";
  /** Local player's bag/gear changed (and once when the world starts). */
  "game:inventory": InventoryView;
  /** Entered a map: the HUD shows the zone banner. */
  "game:zone": { zone: string; map: string };
  /** The local player started talking to an NPC. */
  "game:dialogue": { npc: string; dialogue: string };
  /** A save was written (or refused by storage). Manual = from the pause menu. */
  "game:saved": { ok: boolean; manual: boolean };
  /** Quest started / progressed / ready to turn in / done (toasts). */
  "game:quest": { quest: string; change: "started" | "progress" | "ready" | "done" };
  /** A new skill became available (level-up). */
  "game:skill-unlocked": { skill: string };
  /** Context action available near the player (null = none). */
  "game:prompt": { kind: "talk"; npc: string } | { kind: "chest" } | null;
  /** Local player picked something up (toast). */
  "game:loot": { item: string; count: number };
  /** UI → game: inventory command for the local player (sent with the next Intent). */
  "ui:command": Command;
  /** UI → game: enter the world: a new game in `slot`, or the loaded `save` (no slot = nothing is saved). */
  "ui:start": { mode: GameMode; slot?: number; save?: SaveData | null; rules?: WorldRules };
  /** UI → game: back to the title backdrop. */
  "ui:quit": void;
  /** Save now (pause menu). */
  "ui:save": void;
  /** Change the run's difficulty / Omens (solo host; applied to living enemies at once). */
  "ui:rules": WorldRules;
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
