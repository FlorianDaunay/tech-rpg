import { create } from "zustand";
import { registerContent } from "@/content/boot";
import { capturePlayer, type PlayerState } from "@/core/save/save";
import { createSim, spawnPlayer } from "@/core/sim/state";
import type { RoomInfo } from "@/net/protocol";
import { Session, type SessionError } from "@/net/session";
import { ClientLink, HostLink } from "@/net/links";
import { readSave } from "./saves";
import { defaultRules, type WorldRules } from "@/core/sim/rules";

/**
 * Multiplayer session state for the UI (lobby) and the game (WorldScene reads `session`).
 * The character a player brings is the one in their chosen save slot (a fresh initiate if empty).
 */
interface NetState {
  status: "idle" | "connecting" | "lobby" | "playing" | "error";
  session: Session | null;
  room: RoomInfo | null;
  error: SessionError | "unknown" | null;
  /** Save slot whose character this player brings (and where it is saved back). */
  slot: number | null;
  host: (opts: { name: string; password: string; slot: number | null }) => Promise<void>;
  join: (opts: { code: string; name: string; password: string; slot: number | null }) => Promise<void>;
  leave: () => void;
  /** Host: pick the world's difficulty / Omens (the NG+ cycle comes from the host's save). */
  setRules: (rules: WorldRules) => void;
}

/** The character of a slot, or a new initiate. */
export function characterOf(slot: number | null): PlayerState {
  const save = slot !== null ? readSave(slot) : null;
  if (save) return save.player;
  registerContent();
  return capturePlayer(spawnPlayer(createSim("cinderhold", 1), "p1", "x", 0, 0, { weapon: "initiate-blade", shield: "initiate-buckler" }));
}

const errorOf = (e: unknown): SessionError | "unknown" => {
  const m = e instanceof Error ? e.message : "";
  return (["unavailable", "timeout", "version", "password", "full", "kicked", "network", "host-left"] as const).find((x) => x === m) ?? "unknown";
};

function watch(session: Session): void {
  session.on("room", (room) => useNet.setState({ room: { ...room, players: [...room.players] } }));
  session.on("closed", (reason) => {
    if (useNet.getState().session !== session) return;
    useNet.setState({ session: null, room: null, status: reason ? "error" : "idle", error: reason });
  });
}

export const useNet = create<NetState>()((set, get) => ({
  status: "idle",
  session: null,
  room: null,
  error: null,
  slot: null,
  host: async ({ name, password, slot }) => {
    get().session?.leave();
    set({ status: "connecting", error: null, slot });
    try {
      const session = await Session.host({ name, password, level: characterOf(slot).level });
      HostLink.of(session); // from now on, joiners' characters are kept for the world
      session.setRules(slot !== null ? (readSave(slot)?.rules ?? defaultRules()) : defaultRules());
      watch(session);
      set({ session, room: session.room, status: "lobby" });
    } catch (e) {
      set({ status: "error", error: errorOf(e) });
    }
  },
  join: async ({ code, name, password, slot }) => {
    get().session?.leave();
    set({ status: "connecting", error: null, slot });
    try {
      const session = await Session.join({ code, name, password, player: characterOf(slot) });
      ClientLink.of(session); // catches the host's world package even before the scene exists
      watch(session);
      set({ session, room: session.room, status: session.room.started ? "playing" : "lobby" });
    } catch (e) {
      set({ status: "error", error: errorOf(e) });
    }
  },
  setRules: (rules) => get().session?.setRules(rules),
  leave: () => {
    get().session?.leave();
    set({ session: null, room: null, status: "idle", error: null });
  },
}));

// Voluntary exits tell the others right away (no 8 s timeout).
if (typeof window !== "undefined") window.addEventListener("pagehide", () => useNet.getState().session?.leave());
