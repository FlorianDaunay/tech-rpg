import type { SimEvent } from "@/core/combat/events";
import { capturePlayer, type PlayerState } from "@/core/save/save";
import type { Intent } from "@/core/sim/intent";
import type { SimState } from "@/core/sim/state";
import { encodeSnapshot } from "./codec";
import { InputQueue, PendingInputs } from "./inputs";
import { INTERP_DELAY_MS, InterpBuffer } from "./interp";
import { FULL_SYNC_MS, SNAPSHOT_HZ, type Snapshot, type WorldInit } from "./protocol";
import type { Session } from "./session";

/** Player looks by seat (each player is told apart at a glance). */
export const SEAT_LOOKS: Record<string, string> = { p1: "characters/male-01-1", p2: "characters/female-01-1", p3: "characters/male-02-1", p4: "characters/female-02-1" };

const STEPS_PER_SNAPSHOT = Math.round(60 / SNAPSHOT_HZ);
const SELF_SYNC_MS = 5000;
/** Events after which the host sends the full state early (menus show the change at once). */
const OWNED_CHANGES = new Set<SimEvent["type"]>(["equip", "use", "quest", "trade", "pet-adopted", "trade-shop", "forged", "built", "danger", "cosmetic", "rest", "talent", "loadout"]);
/** Never more than one early full sync per this many ms (pickups in a fight would flood the link). */
const MIN_EARLY_FULL_MS = 150;

/**
 * Host side of a session, kept for the whole session (scene restarts on map change don't lose
 * inputs or players who joined during the fade).
 */
export class HostLink {
  private static readonly bySession = new WeakMap<Session, HostLink>();
  static of(session: Session): HostLink {
    let link = HostLink.bySession.get(session);
    if (!link) HostLink.bySession.set(session, (link = new HostLink(session)));
    return link;
  }

  private readonly queues = new Map<string, InputQueue>();
  /** Characters of players waiting to be placed in the world (joined, or carried across a map change). */
  readonly arrivals = new Map<string, PlayerState>();
  readonly departures = new Set<string>();
  private steps = 0;
  private lastFull = 0;
  private lastSelf = 0;

  private constructor(readonly session: Session) {
    session.on("joined", (seat, player) => {
      this.arrivals.set(seat, player);
      this.departures.delete(seat);
      this.queues.set(seat, new InputQueue());
    });
    session.on("left", (seat) => {
      this.departures.add(seat);
      this.arrivals.delete(seat);
      this.queues.delete(seat);
    });
    session.on("unreliable", (from, msg) => {
      if (msg.t === "in") this.queues.get(from)?.receive(msg.inputs);
    });
  }

  /** This step's intents: mine, and each remote player's next queued input. */
  intents(localId: string, local: Intent, sim: SimState): Record<string, Intent> {
    const out: Record<string, Intent> = { [localId]: local };
    for (const [seat, q] of this.queues) if (sim.actors[seat]) out[seat] = q.next();
    return out;
  }

  /**
   * PvP lag compensation: how far in the past each remote player sees the others (their round trip
   * + the interpolation delay). Unknown pings count as none.
   */
  lagMs(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const seat of this.queues.keys()) {
      const rtt = this.session.pingOf(seat);
      if (rtt !== null) out[seat] = rtt + INTERP_DELAY_MS;
    }
    return out;
  }

  /** After each sim step: events now (reliable), snapshots at 20 Hz, full state at 1 Hz, characters every 5 s. */
  afterStep(sim: SimState, now: number): void {
    if (sim.events.length) this.session.broadcast({ t: "events", tick: sim.tick, events: sim.events });
    if (++this.steps % STEPS_PER_SNAPSHOT === 0) {
      const acks = Object.fromEntries([...this.queues].map(([seat, q]) => [seat, q.acked]));
      this.session.sendFast({ t: "snap", s: encodeSnapshot(sim, acks) });
    }
    // New actors (spawns, drops of a summon...) reach clients with the next full sync: send it early.
    const spawned = sim.events.some((e) => e.type === "spawn" || e.type === "respawn" || e.type === "pet-revive");
    // A menu action changed someone's bag, gear or story: their menus should show it now, not in a second.
    const owned = sim.events.some((e) => OWNED_CHANGES.has(e.type)) && now - this.lastFull > MIN_EARLY_FULL_MS;
    if (spawned || owned || now - this.lastFull > FULL_SYNC_MS) this.syncFull(sim, now);
    if (now - this.lastSelf > SELF_SYNC_MS) this.syncSelves(sim, now);
  }

  syncFull(sim: SimState, now: number): void {
    this.lastFull = now;
    this.session.broadcast({ t: "full", sim: { ...sim, events: [] } });
  }

  /** Each client gets its own character back (they save it in their slot). */
  syncSelves(sim: SimState, now: number): void {
    this.lastSelf = now;
    for (const p of this.session.room.players) {
      const a = sim.actors[p.id];
      if (p.id === this.session.me || !a?.progress) continue;
      this.session.send(p.id, { t: "self", player: capturePlayer(a) });
      this.session.setLevel(p.id, a.level);
    }
  }

  /** A client enters (or changes) the world. */
  sendWorld(seat: string, init: WorldInit): void {
    this.session.send(seat, { t: "world", init });
  }
}

/**
 * Client side of a session: numbered inputs (replayed after each snapshot), interpolation of the
 * others, and an inbox the scene drains every frame.
 */
export class ClientLink {
  private static readonly bySession = new WeakMap<Session, ClientLink>();
  static of(session: Session): ClientLink {
    let link = ClientLink.bySession.get(session);
    if (!link) ClientLink.bySession.set(session, (link = new ClientLink(session)));
    return link;
  }

  readonly pending = new PendingInputs();
  readonly interp = new InterpBuffer();
  snaps: Snapshot[] = [];
  full: SimState | null = null;
  events: SimEvent[][] = [];
  world: WorldInit | null = null;
  self: PlayerState | null = null;

  private constructor(readonly session: Session) {
    session.on("unreliable", (_from, msg) => {
      if (msg.t === "snap") this.snaps.push(msg.s);
    });
    session.on("reliable", (_from, msg) => {
      if (msg.t === "full") this.full = msg.sim;
      else if (msg.t === "events") this.events.push(msg.events);
      else if (msg.t === "world") {
        this.world = msg.init;
        this.snaps = [];
        this.full = null;
        this.events = [];
      } else if (msg.t === "self") this.self = msg.player;
    });
  }

  /** Numbers the input, keeps it for replay, sends the newest few. */
  send(intent: Intent): void {
    this.pending.add(intent);
    this.session.sendFast({ t: "in", inputs: this.pending.packet() });
  }
}
