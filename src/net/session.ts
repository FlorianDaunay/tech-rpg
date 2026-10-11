import Peer, { type DataConnection } from "peerjs";
import type { PlayerState } from "@/core/save/save";
import { HEARTBEAT_MS, MAX_PLAYERS, PEER_TIMEOUT_MS, PROTOCOL_VERSION, type LobbyPlayer, type ReliableMsg, type RoomInfo, type UnreliableMsg } from "./protocol";

/**
 * One multiplayer room over PeerJS (the public broker only does signalling; game data goes
 * browser ↔ browser). Host-authoritative: the host owns the room info and the world; clients send
 * inputs and receive state. No TURN server: if WebRTC can't connect, joining fails with an error.
 */

const PREFIX = "valaria";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
const CONNECT_TIMEOUT_MS = 12_000;

export type SessionError = "unavailable" | "timeout" | "version" | "password" | "full" | "kicked" | "network" | "host-left";
export type Role = "host" | "client";

export interface SessionEvents {
  /** Room info changed (players, names, levels...). */
  room: (room: RoomInfo) => void;
  /** Reliable message from a peer (host: from a client seat; client: from the host = "p1"). */
  reliable: (from: string, msg: ReliableMsg) => void;
  unreliable: (from: string, msg: UnreliableMsg) => void;
  /** A client's character arrived with its hello (host only). */
  joined: (seat: string, player: PlayerState) => void;
  left: (seat: string) => void;
  /** The session is over (error or host gone). */
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

export class Session {
  readonly role: Role;
  /** My seat (actor id). */
  me: string;
  room: RoomInfo;
  private peer: Peer | null = null;
  private readonly links = new Map<string, Link>();
  private readonly handlers: { [K in keyof SessionEvents]: SessionEvents[K][] } = { room: [], reliable: [], unreliable: [], joined: [], left: [], closed: [] };
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private closedFlag = false;
  private passwordHash = "";

  private constructor(role: Role, me: string, room: RoomInfo) {
    this.role = role;
    this.me = me;
    this.room = room;
  }

  on<K extends keyof SessionEvents>(event: K, fn: SessionEvents[K]): () => void {
    this.handlers[event].push(fn);
    return () => {
      const list = this.handlers[event] as SessionEvents[K][];
      list.splice(list.indexOf(fn), 1);
    };
  }

  private emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): void {
    for (const fn of [...this.handlers[event]]) (fn as (...a: Parameters<SessionEvents[K]>) => void)(...args);
  }

  isClosed(): boolean {
    return this.closedFlag;
  }

  // ---- host ----------------------------------------------------------------------------------

  /** Opens a room. Resolves once the broker has registered the room code. */
  static async host(opts: { name: string; password: string; level: number }): Promise<Session> {
    const code = randomCode();
    const s = new Session("host", "p1", { code, epoch: 0, hostId: "p1", players: [{ id: "p1", name: opts.name, level: opts.level, connected: true }], started: false });
    s.passwordHash = await hashPassword(opts.password);
    const peer = new Peer(hostPeerId(code, 0));
    s.peer = peer;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS);
      peer.on("open", () => (clearTimeout(timer), resolve()));
      peer.on("error", (e) => (clearTimeout(timer), reject(e)));
    });
    peer.on("connection", (conn) => s.acceptConnection(conn));
    peer.on("error", () => {});
    s.startHeartbeat();
    return s;
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
    if (msg.t === "pong") return;
    if (msg.t === "bye") return this.dropLink(peerId);
    if (msg.t === "hello") {
      const refuse = (reason: "version" | "password" | "full") => {
        link.r?.send({ t: "reject", reason } satisfies ReliableMsg);
        setTimeout(() => this.dropLink(peerId), 300);
      };
      if (msg.v !== PROTOCOL_VERSION) return refuse("version");
      if (msg.passwordHash !== this.passwordHash) return refuse("password");
      // Reclaim a seat by name (reconnect), else the first free one.
      const back = this.room.players.find((p) => !p.connected && p.name === msg.name && p.id !== "p1");
      const free = ["p2", "p3", "p4"].find((id) => !this.room.players.some((p) => p.id === id));
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
    if (this.role === "client") return this.close("host-left");
    if (!link.seat) return;
    this.room.players = this.room.players.map((p) => (p.id === link.seat ? { ...p, connected: false } : p));
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

  markStarted(): void {
    this.room.started = true;
    this.broadcastRoom();
  }

  // ---- client --------------------------------------------------------------------------------

  /** Joins a room by code. Resolves after the host's welcome (or rejects with a SessionError). */
  static async join(opts: { code: string; name: string; password: string; player: PlayerState }): Promise<Session> {
    const code = opts.code.trim().toUpperCase();
    const s = new Session("client", "", { code, epoch: 0, hostId: "p1", players: [], started: false });
    const passwordHash = await hashPassword(opts.password);
    const peer = new Peer();
    s.peer = peer;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS);
      peer.on("open", () => (clearTimeout(timer), resolve()));
      peer.on("error", (e) => (clearTimeout(timer), reject(e)));
    });
    const target = hostPeerId(code, 0);
    const link: Link = { seat: "p1", lastSeen: Date.now() };
    s.links.set(target, link);
    return new Promise<Session>((resolve, reject) => {
      const fail = (reason: SessionError) => {
        clearTimeout(timer);
        s.close(null);
        reject(new Error(reason));
      };
      const timer = setTimeout(() => fail("timeout"), CONNECT_TIMEOUT_MS);
      peer.on("error", (e) => fail((e as { type?: string }).type === "peer-unavailable" ? "unavailable" : "network"));
      // Binary (MsgPack) on the reliable channel: PeerJS chunks big messages (world packages run ~20 KB+).
      const r = peer.connect(target, { label: "r", reliable: true, serialization: "binary" });
      const u = peer.connect(target, { label: "u", reliable: false, serialization: "json" });
      link.r = r;
      link.u = u;
      let opened = 0;
      const ready = () => {
        if (++opened < 2) return;
        r.send({ t: "hello", v: PROTOCOL_VERSION, name: opts.name, passwordHash, player: opts.player } satisfies ReliableMsg);
      };
      r.on("open", ready);
      u.on("open", ready);
      u.on("data", (data) => {
        link.lastSeen = Date.now();
        s.emit("unreliable", "p1", data as UnreliableMsg);
      });
      r.on("data", (data) => {
        link.lastSeen = Date.now();
        const msg = data as ReliableMsg;
        if (msg.t === "welcome") {
          clearTimeout(timer);
          s.me = msg.you;
          s.room = msg.room;
          s.startHeartbeat();
          resolve(s);
          s.emit("room", s.room);
          return;
        }
        if (msg.t === "reject") return fail(msg.reason);
        if (msg.t === "lobby") {
          s.room = msg.room;
          return s.emit("room", s.room);
        }
        if (msg.t === "ping") return r.send({ t: "pong", at: msg.at } satisfies ReliableMsg);
        if (msg.t === "pong") return;
        s.emit("reliable", "p1", msg);
      });
      r.on("close", () => s.close("host-left"));
    });
  }

  // ---- both ----------------------------------------------------------------------------------

  private sendTo(link: Link, msg: ReliableMsg): void {
    if (link.r?.open) link.r.send(msg);
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
    for (const link of this.links.values()) if (link.seat && (!to || link.seat === to) && link.u?.open) link.u.send(msg);
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

  /** Leaves (tells the others, so they don't wait for the timeout). */
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
