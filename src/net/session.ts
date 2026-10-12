import Peer, { type DataConnection } from "peerjs";
import type { PlayerState } from "@/core/save/save";
import type { WorldRules } from "@/core/sim/rules";
import { shapedSend } from "./debug/latency";
import { HEARTBEAT_MS, MAX_PLAYERS, PEER_TIMEOUT_MS, PROTOCOL_VERSION, type LobbyPlayer, type ReliableMsg, type RoomInfo, type UnreliableMsg } from "./protocol";

/**
 * One multiplayer room over PeerJS (the public broker only does signalling; game data goes
 * browser ↔ browser). Host-authoritative: the host owns the room info and the world; clients send
 * inputs and receive state. No TURN server: if WebRTC can't connect, joining fails with an error.
 *
 * Host migration: the host's peer id is `valaria-<code>-<epoch>`. When a client loses the host, every
 * client computes the same candidate list (connected players by seat); candidate `a` takes over at
 * epoch `old + 1 + a`, the others reconnect to it and reclaim their seat.
 */

const PREFIX = "valaria";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
const CONNECT_TIMEOUT_MS = 12_000;
/** How long the others keep trying one candidate before moving to the next. */
const MIGRATE_TRY_MS = 15_000;
const SEATS = ["p1", "p2", "p3", "p4"];

export type SessionError = "unavailable" | "timeout" | "version" | "password" | "full" | "kicked" | "network" | "host-left";
export type Role = "host" | "client";

export interface SessionEvents {
  /** Room info changed (players, names, levels...). */
  room: (room: RoomInfo) => void;
  /** Reliable message from a peer (host: from a client seat; client: from the host). */
  reliable: (from: string, msg: ReliableMsg) => void;
  unreliable: (from: string, msg: UnreliableMsg) => void;
  /** A client's character arrived with its hello (host only; also on reconnect after a migration). */
  joined: (seat: string, player: PlayerState) => void;
  left: (seat: string) => void;
  /** The host is gone: looking for the new one (UI shows "reconnecting"). */
  migrating: () => void;
  /** I am the new host (the game resumes the world from my copy). `oldHost` = the seat that left. */
  promoted: (oldHost: string) => void;
  /** Reconnected to the new host after a migration. */
  reconnected: () => void;
  /** The session is over (error or no host left). */
  closed: (reason: SessionError | null) => void;
}

interface Link {
  seat: string;
  r?: DataConnection;
  u?: DataConnection;
  lastSeen: number;
}

/** SHA-256 hex of the password (never sent in clear). Empty password = no password. */
export async function hashPassword(password: string): Promise<string> {
  if (!password) return "";
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${PREFIX}:${password}`));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Insecure contexts (plain http on a LAN): weak but stable fallback.
  let h = 2166136261;
  for (const c of `${PREFIX}:${password}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `fnv-${(h >>> 0).toString(16)}`;
}

export const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const hostPeerId = (code: string, epoch: number) => `${PREFIX}-${code.toLowerCase()}-${epoch}`;

/** Who takes over when the host is lost: connected players other than the host, by seat (same on every peer). */
export function migrationCandidates(room: RoomInfo): string[] {
  return room.players
    .filter((p) => p.id !== room.hostId && p.connected)
    .map((p) => p.id)
    .sort();
}

function openPeer(id?: string): Promise<Peer> {
  const peer = id ? new Peer(id) : new Peer();
  return new Promise<Peer>((resolve, reject) => {
    const timer = setTimeout(() => (peer.destroy(), reject(new Error("timeout"))), CONNECT_TIMEOUT_MS);
    peer.on("open", () => (clearTimeout(timer), resolve(peer)));
    peer.on("error", (e) => {
      clearTimeout(timer);
      peer.destroy();
      reject(new Error((e as { type?: string }).type === "unavailable-id" ? "unavailable" : "network"));
    });
  });
}

export class Session {
  role: Role;
  /** My seat (actor id). */
  me: string;
  room: RoomInfo;
  /** Name and character sent in hellos (also when reconnecting after a migration). */
  private name = "";
  /** Supplies my current character for a reconnect hello (set by the game; falls back to the join one). */
  playerProvider: () => PlayerState | null = () => null;
  private joinPlayer: PlayerState | null = null;
  private peer: Peer | null = null;
  private readonly links = new Map<string, Link>();
  private readonly handlers: { [K in keyof SessionEvents]: SessionEvents[K][] } = { room: [], reliable: [], unreliable: [], joined: [], left: [], migrating: [], promoted: [], reconnected: [], closed: [] };
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private closedFlag = false;
  private migratingFlag = false;
  private passwordHash = "";
  /** Host: round trip to each client seat (ms). */
  private readonly rtt = new Map<string, number>();
  /** Client: round trip to the host (ms). */
  private hostRtt = 0;

  private constructor(role: Role, me: string, room: RoomInfo) {
    this.role = role;
    this.me = me;
    this.room = room;
  }

  on<K extends keyof SessionEvents>(event: K, fn: SessionEvents[K]): () => void {
    this.handlers[event].push(fn);
    return () => {
      const list = this.handlers[event] as SessionEvents[K][];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): void {
    for (const fn of [...this.handlers[event]]) (fn as (...a: Parameters<SessionEvents[K]>) => void)(...args);
  }

  isClosed(): boolean {
    return this.closedFlag;
  }

  isMigrating(): boolean {
    return this.migratingFlag;
  }

  // ---- host ----------------------------------------------------------------------------------

  /** Opens a room. Resolves once the broker has registered the room code. */
  static async host(opts: { name: string; password: string; level: number }): Promise<Session> {
    const code = randomCode();
    const s = new Session("host", "p1", { code, epoch: 0, hostId: "p1", players: [{ id: "p1", name: opts.name, level: opts.level, connected: true }], started: false });
    s.name = opts.name;
    s.passwordHash = await hashPassword(opts.password);
    s.listen(await openPeer(hostPeerId(code, 0)));
    s.startHeartbeat();
    return s;
  }

  private listen(peer: Peer): void {
    this.peer = peer;
    peer.on("connection", (conn) => this.acceptConnection(conn));
    peer.on("error", () => {});
  }

  private acceptConnection(conn: DataConnection): void {
    const link = this.links.get(conn.peer) ?? { seat: "", lastSeen: Date.now() };
    this.links.set(conn.peer, link);
    if (conn.label === "u") link.u = conn;
    else link.r = conn;
    conn.on("data", (data) => {
      link.lastSeen = Date.now();
      if (conn.label === "u") {
        if (link.seat) this.emit("unreliable", link.seat, data as UnreliableMsg);
        return;
      }
      this.onHostReliable(conn.peer, link, data as ReliableMsg);
    });
    conn.on("close", () => this.dropLink(conn.peer));
    conn.on("error", () => this.dropLink(conn.peer));
  }

  private onHostReliable(peerId: string, link: Link, msg: ReliableMsg): void {
    if (msg.t === "ping") return this.sendTo(link, { t: "pong", at: msg.at });
    if (msg.t === "pong") return this.notePing(link.seat, Date.now() - msg.at);
    if (msg.t === "bye") return this.dropLink(peerId);
    if (msg.t === "hello") {
      const refuse = (reason: "version" | "password" | "full") => {
        this.sendTo(link, { t: "reject", reason });
        setTimeout(() => this.dropLink(peerId), 300);
      };
      if (msg.v !== PROTOCOL_VERSION) return refuse("version");
      if (msg.passwordHash !== this.passwordHash) return refuse("password");
      // Reclaim a seat: the one asked for (reconnect after a migration), else by name, else the first free one.
      const away = (id: string | undefined) => (id ? this.room.players.find((p) => p.id === id && !p.connected && id !== this.me) : undefined);
      const back = away(msg.want) ?? this.room.players.find((p) => !p.connected && p.name === msg.name && p.id !== this.me);
      const free = SEATS.find((id) => id !== this.me && !this.room.players.some((p) => p.id === id));
      const seat = back?.id ?? free;
      if (!seat || this.room.players.filter((p) => p.connected).length >= MAX_PLAYERS) return refuse("full");
      link.seat = seat;
      const entry: LobbyPlayer = { id: seat, name: msg.name.slice(0, 24) || seat, level: msg.player.level, connected: true };
      this.room.players = [...this.room.players.filter((p) => p.id !== seat), entry].sort((a, b) => a.id.localeCompare(b.id));
      this.sendTo(link, { t: "welcome", you: seat, room: this.room });
      this.emit("joined", seat, msg.player);
      this.broadcastRoom();
      return;
    }
    if (link.seat) this.emit("reliable", link.seat, msg);
  }

  private dropLink(peerId: string): void {
    const link = this.links.get(peerId);
    if (!link) return;
    this.links.delete(peerId);
    link.r?.close();
    link.u?.close();
    if (this.role === "client") return void this.migrate();
    if (!link.seat) return;
    this.rtt.delete(link.seat);
    this.room.players = this.room.players.map((p) => (p.id === link.seat ? { ...p, connected: false, ping: undefined } : p));
    this.emit("left", link.seat);
    this.broadcastRoom();
  }

  broadcastRoom(): void {
    if (this.role !== "host") return;
    this.broadcast({ t: "lobby", room: this.room });
    this.emit("room", this.room);
  }

  /** Host: a seat's level changed (lobby shows it). */
  setLevel(seat: string, level: number): void {
    const p = this.room.players.find((x) => x.id === seat);
    if (p && p.level !== level) {
      p.level = level;
      this.broadcastRoom();
    }
  }

  /** Host: a client answered a ping. The lobby carries pings (re-broadcast when one moves by 10 ms+). */
  private notePing(seat: string, ms: number): void {
    if (!seat) return;
    this.rtt.set(seat, ms);
    const p = this.room.players.find((x) => x.id === seat);
    if (p && Math.abs((p.ping ?? -100) - ms) >= 10) {
      p.ping = ms;
      this.broadcastRoom();
    }
  }

  /** Round trip (ms) between a seat and the host as far as I know (0 for the host itself, null if unknown). */
  pingOf(seat: string): number | null {
    if (seat === this.room.hostId) return this.role === "host" ? 0 : this.hostRtt;
    if (this.role === "host") return this.rtt.get(seat) ?? null;
    if (seat === this.me) return this.hostRtt;
    return this.room.players.find((p) => p.id === seat)?.ping ?? null;
  }

  /** Host: the world rules changed (lobby pick, or mid-game from the pause menu). */
  setRules(rules: WorldRules): void {
    if (this.role !== "host") return;
    this.room.rules = structuredClone(rules);
    this.broadcastRoom();
  }

  markStarted(): void {
    if (this.room.started) return;
    this.room.started = true;
    this.broadcastRoom();
  }

  // ---- client --------------------------------------------------------------------------------

  /** Joins a room by code. Resolves after the host's welcome (or rejects with a SessionError). */
  static async join(opts: { code: string; name: string; password: string; player: PlayerState }): Promise<Session> {
    const code = opts.code.trim().toUpperCase();
    const s = new Session("client", "", { code, epoch: 0, hostId: "p1", players: [], started: false });
    s.name = opts.name;
    s.joinPlayer = opts.player;
    s.passwordHash = await hashPassword(opts.password);
    try {
      s.peer = await openPeer();
      await s.connectToHost(0, CONNECT_TIMEOUT_MS);
    } catch (e) {
      s.close(null);
      throw e;
    }
    s.startHeartbeat();
    return s;
  }

  /** Connects (or reconnects) to the host at an epoch: two channels, hello, wait for the welcome. */
  private connectToHost(epoch: number, timeoutMs: number): Promise<void> {
    const peer = this.peer!;
    const target = hostPeerId(this.room.code, epoch);
    const link: Link = { seat: "host", lastSeen: Date.now() };
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (err?: SessionError) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        peer.off("error", onError);
        if (err) {
          link.r?.close();
          link.u?.close();
          reject(new Error(err));
        } else resolve();
      };
      const timer = setTimeout(() => finish("timeout"), timeoutMs);
      const onError = (e: unknown) => finish((e as { type?: string }).type === "peer-unavailable" ? "unavailable" : "network");
      peer.on("error", onError);
      // Binary (MsgPack) on the reliable channel: PeerJS chunks big messages (world packages run ~20 KB+).
      const r = peer.connect(target, { label: "r", reliable: true, serialization: "binary" });
      const u = peer.connect(target, { label: "u", reliable: false, serialization: "json" });
      link.r = r;
      link.u = u;
      let opened = 0;
      const ready = () => {
        if (++opened < 2) return;
        const player = this.playerProvider() ?? this.joinPlayer!;
        this.sendOn(r, { t: "hello", v: PROTOCOL_VERSION, name: this.name, passwordHash: this.passwordHash, player, want: this.me || undefined });
      };
      r.on("open", ready);
      u.on("open", ready);
      u.on("data", (data) => {
        link.lastSeen = Date.now();
        this.emit("unreliable", this.room.hostId, data as UnreliableMsg);
      });
      r.on("data", (data) => {
        link.lastSeen = Date.now();
        const msg = data as ReliableMsg;
        if (msg.t === "welcome") {
          this.me = msg.you;
          this.room = msg.room;
          // Only now is this the host link (a failed attempt never replaced the previous one).
          for (const [id, old] of this.links) if (old !== link) this.links.delete(id);
          this.links.set(target, link);
          finish();
          this.emit("room", this.room);
          return;
        }
        if (msg.t === "reject") return finish(msg.reason);
        if (msg.t === "lobby") {
          this.room = msg.room;
          return this.emit("room", this.room);
        }
        if (msg.t === "ping") return this.sendOn(r, { t: "pong", at: msg.at });
        if (msg.t === "pong") return void (this.hostRtt = Date.now() - msg.at);
        if (msg.t === "bye") return this.dropLink(target);
        this.emit("reliable", this.room.hostId, msg);
      });
      r.on("close", () => (done ? this.dropLink(target) : finish("network")));
    });
  }

  // ---- migration -----------------------------------------------------------------------------

  /** Client: the host is gone. Take over if it's my turn, else reconnect to whoever does. */
  private async migrate(): Promise<void> {
    if (this.closedFlag || this.migratingFlag) return;
    if (!this.room.started) return this.close("host-left");
    this.migratingFlag = true;
    this.emit("migrating");
    const oldHost = this.room.hostId;
    const oldEpoch = this.room.epoch;
    const candidates = migrationCandidates(this.room);
    for (let a = 0; a < candidates.length && !this.closedFlag; a++) {
      const epoch = oldEpoch + 1 + a;
      try {
        if (candidates[a] === this.me) await this.takeOver(epoch, oldHost);
        else await this.reconnect(epoch);
        this.migratingFlag = false;
        return;
      } catch {
        // That candidate never came up: the next one.
      }
    }
    this.migratingFlag = false;
    this.close("host-left");
  }

  /** I am the new host: register the next epoch's id and resume the room from what I know. */
  private async takeOver(epoch: number, oldHost: string): Promise<void> {
    this.peer?.destroy();
    this.peer = null;
    this.listen(await openPeer(hostPeerId(this.room.code, epoch)));
    this.role = "host";
    // Everyone else is "away" until they reconnect (they reclaim their seat by id).
    this.room = {
      ...this.room,
      epoch,
      hostId: this.me,
      players: this.room.players.filter((p) => p.id !== oldHost).map((p) => ({ ...p, connected: p.id === this.me })),
    };
    this.emit("promoted", oldHost);
    this.broadcastRoom();
  }

  /** Someone else took over: keep trying to reach them for a while. */
  private async reconnect(epoch: number): Promise<void> {
    const deadline = Date.now() + MIGRATE_TRY_MS;
    while (Date.now() < deadline && !this.closedFlag) {
      try {
        if (!this.peer || this.peer.destroyed || this.peer.disconnected) {
          this.peer?.destroy();
          this.peer = await openPeer();
        }
        await this.connectToHost(epoch, 4000);
        this.emit("reconnected");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    throw new Error("timeout");
  }

  // ---- both ----------------------------------------------------------------------------------

  private sendTo(link: Link, msg: ReliableMsg): void {
    if (link.r) this.sendOn(link.r, msg);
  }

  /** Every send goes through the latency simulator (a no-op unless enabled). */
  private sendOn(conn: DataConnection, msg: ReliableMsg | UnreliableMsg, reliable = true): void {
    shapedSend(conn, reliable, () => {
      if (conn.open) conn.send(msg);
    });
  }

  /** Reliable to one seat (host) or to the host (client: `to` ignored). */
  send(to: string, msg: ReliableMsg): void {
    for (const link of this.links.values()) if (this.role === "client" || link.seat === to) this.sendTo(link, msg);
  }

  /** Reliable to every connected peer. */
  broadcast(msg: ReliableMsg): void {
    for (const link of this.links.values()) if (link.seat) this.sendTo(link, msg);
  }

  /** Unreliable: host → all clients, client → host. */
  sendFast(msg: UnreliableMsg, to?: string): void {
    for (const link of this.links.values()) if (link.seat && (!to || link.seat === to) && link.u?.open) this.sendOn(link.u, msg, false);
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      for (const [peerId, link] of this.links) {
        if (!link.seat) continue;
        if (now - link.lastSeen > PEER_TIMEOUT_MS) this.dropLink(peerId);
        else this.sendTo(link, { t: "ping", at: now });
      }
    }, HEARTBEAT_MS);
  }

  /** Leaves (tells the others, so they don't wait for the timeout: clients migrate at once). */
  leave(): void {
    for (const link of this.links.values()) this.sendTo(link, { t: "bye" });
    this.close(null);
  }

  private close(reason: SessionError | null): void {
    if (this.closedFlag) return;
    this.closedFlag = true;
    clearInterval(this.heartbeat);
    for (const link of this.links.values()) {
      link.r?.close();
      link.u?.close();
    }
    this.links.clear();
    this.peer?.destroy();
    this.peer = null;
    this.emit("closed", reason);
  }
}
