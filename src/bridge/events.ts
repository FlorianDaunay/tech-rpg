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
export interface PartyMember {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  /** Not in this map (travelling, reconnecting) or away. */
  here: boolean;
  connected: boolean;
  /** Round trip to the host (ms), null if unknown. */
  ping: number | null;
}

export interface PartyView {
  role: "solo" | "host" | "client";
  /** My round trip to the host (ms); 0 when hosting. */
  ping: number | null;
  others: PartyMember[];
}

export interface SkillView {
  slot: "skill1" | "skill2" | "ultimate";
  id: string | null;
  cd: number;
  cdMax: number;
  ready: boolean;
}

/** A map drawn as one palette colour per cell (minimap, map screen). Sent once per map entry. */
export interface MinimapLayout {
  map: string;
  zone: string;
  width: number;
  height: number;
  palette: string[];
  /** Palette index per cell, row-major. */
  cells: Uint8Array;
  /** Exits, in cells; `to` = destination map. */
  portals: { x: number; y: number; w: number; h: number; to: string }[];
}

/** Boss bar: who, how hurt, which phase (thresholds = where the next phases start, as hp fractions). */
export interface BossView {
  enemy: string;
  hp: number;
  maxHp: number;
  phase: number;
  thresholds: number[];
  /** Exits are sealed until it falls. */
  sealed: boolean;
}

/** Something to dot on the map, in cell units. */
export interface MapMarker {
  kind: "me" | "ally" | "enemy" | "npc" | "chest";
  x: number;
  y: number;
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
  /** Online: the other players (name, health, ping) and my own link. Empty in solo. */
  "game:party": PartyView;
  /** Debug overlay text (when settings.showFps). */
  "game:debug": string;
  /** Game → UI: a menu key was pressed in game (Esc/Start, Tab/I/D-pad up). */
  "game:menu": "pause" | "inventory" | "talents" | "map";
  /** The current map's layout (on entry) and its markers (~8 Hz). */
  "game:minimap": MinimapLayout;
  /** Multiplayer connection news (host migration). */
  "game:net": { status: "migrating" | "reconnected" | "promoted" };
  /** A multiplayer session ended under the player (host left, connection lost): back to the title. */
  "game:ended": { reason: string | null };
  /** The boss fighting the local player (null when none): HUD boss bar. */
  "game:boss": BossView | null;
  "game:markers": MapMarker[];
  /** Local player's bag/gear changed (and once when the world starts). */
  "game:inventory": InventoryView;
  /** Entered a map: the HUD shows the zone banner. */
  /** Entered a map (zone banner). `rift` when it is a Rift floor. */
  "game:zone": { zone: string; map: string; rift?: { rift: string; floor: number; floors: number } };
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
