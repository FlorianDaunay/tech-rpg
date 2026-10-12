import type { PlayerState } from "@/core/save/save";
import type { SimEvent } from "@/core/combat/events";
import type { Intent } from "@/core/sim/intent";
import type { SimState } from "@/core/sim/state";
import type { WorldRules } from "@/core/sim/rules";

/**
 * Wire protocol. Two DataChannels per peer: "r" reliable+ordered (lobby, world state, events),
 * "u" unreliable+unordered (inputs, snapshots). Bump PROTOCOL_VERSION on any incompatible change:
 * mismatched peers are rejected at hello.
 */
export const PROTOCOL_VERSION = 1;

export interface LobbyPlayer {
  /** Seat id = actor id in the world ("p1" is the host). */
  id: string;
  name: string;
  level: number;
  connected: boolean;
  /** Round trip to the host (ms), measured by the host's heartbeat. */
  ping?: number;
}

export interface RoomInfo {
  code: string;
  epoch: number;
  hostId: string;
  players: LobbyPlayer[];
  /** Started: joiners go straight into the world. */
  started: boolean;
  /** The host's world rules (difficulty, Omens, NG+ cycle), shown in the lobby. Optional: older hosts omit it. */
  rules?: WorldRules;
}

/** Everything a client needs to (re)build the world it is in. */
export interface WorldInit {
  map: string;
  arrive: string;
  rules: WorldRules;
  /** Full sim state as the host sees it (actors, chests, arenas...). */
  sim: SimState;
}

export type ReliableMsg =
  | { t: "hello"; v: number; name: string; passwordHash: string; player: PlayerState; want?: string }
  | { t: "welcome"; you: string; room: RoomInfo }
  | { t: "reject"; reason: "version" | "password" | "full" | "kicked" }
  | { t: "lobby"; room: RoomInfo }
  /** Host → all: enter (or change) the world. */
  | { t: "world"; init: WorldInit }
  /** Host → all, 1 Hz and after spawns: the full sim state (snapshots patch it in between). */
  | { t: "full"; sim: SimState }
  /** Host → all: what happened this step (fx, toasts, dialogue...). */
  | { t: "events"; tick: number; events: SimEvent[] }
  /** Host → one: your character as the host keeps it (the client saves it). */
  | { t: "self"; player: PlayerState }
  | { t: "chat"; from: string; text: string }
  | { t: "ping"; at: number }
  | { t: "pong"; at: number }
  | { t: "bye" };

/** One input, numbered so the host can acknowledge it and the client can replay the rest. */
export interface SeqInput {
  seq: number;
  intent: Intent;
}

export type UnreliableMsg =
  /** Client → host: the last few inputs (redundant, so one lost packet costs nothing). */
  | { t: "in"; inputs: SeqInput[] }
  /** Host → all: compact world snapshot (see codec). */
  | { t: "snap"; s: Snapshot };

/**
 * Actor: id, x×10, y×10, vx, vy, facing, aim (byte), action, action t×100, extra, hp, flags, attack move,
 * action direction (byte), stamina, dodge cooldown×100. The last three let a client replay its own inputs exactly.
 */
export type ActorTuple = [string, number, number, number, number, number, number, number, number, number, number, number, string, number, number, number];
/** Projectile: id, x×10, y×10, vx, vy, move, team, owner. */
export type ProjectileTuple = [string, number, number, number, number, string, string, string];
/** Pickup: id, x×10, y×10, item, count, t×100. */
export type PickupTuple = [string, number, number, string, number, number];

export interface Snapshot {
  tick: number;
  time: number;
  /** Last input seq the host applied, per player. */
  acks: Record<string, number>;
  a: ActorTuple[];
  p: ProjectileTuple[];
  k: PickupTuple[];
}

export const SNAPSHOT_HZ = 20;
export const FULL_SYNC_MS = 1000;
export const HEARTBEAT_MS = 1000;
export const PEER_TIMEOUT_MS = 8000;
export const MAX_PLAYERS = 4;
