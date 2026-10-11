import { isAlive, type Actor } from "../combat/actor";
import { findItem } from "../combat/defs";
import type { SimEvent } from "../combat/events";

/**
 * Player-to-player trading, run by the host like everything else: players send commands, the sim
 * checks them against its own state and swaps the goods atomically once both sides are ready.
 *
 * Anti-scam: any change to an offer bumps `rev` and clears both "ready" flags; a "ready" only counts
 * for the revision the player was looking at, so nobody can swap an offer under a click.
 */
export interface Trade {
  id: string;
  /** Who asked, and who was asked. */
  from: string;
  to: string;
  /** "asked" until `to` accepts. */
  status: "asked" | "open";
  /** Item id → count offered, per player. */
  offers: Record<string, Record<string, number>>;
  ready: Record<string, boolean>;
  rev: number;
  /** Sim time of the request (unanswered requests expire). */
  since: number;
}

export type TradeCommand =
  | { type: "trade"; op: "ask"; to: string }
  | { type: "trade"; op: "answer"; id: string; accept: boolean }
  | { type: "trade"; op: "offer"; id: string; items: Record<string, number> }
  | { type: "trade"; op: "ready"; id: string; rev: number; ready: boolean }
  | { type: "trade"; op: "cancel"; id: string };

export type TradeChange = "asked" | "opened" | "updated" | "done" | "cancelled" | "declined" | "failed";

/** World part trading needs. */
export interface TradeWorld {
  time: number;
  actors: Record<string, Actor>;
  events: SimEvent[];
  trades?: Trade[];
  nextId: number;
}

/** How close two players must stand to start a trade (px, feet to feet). */
export const TRADE_RANGE = 48;
/** They may drift this far apart during the trade before it is called off. */
export const TRADE_LEASH = 260;
/** Unanswered requests lapse after this many seconds. */
export const TRADE_ASK_TIMEOUT = 30;
/** Distinct item stacks per offer. */
export const TRADE_MAX_STACKS = 12;

/** Key items (quest items, the Rift key...) stay with their owner; everything else can change hands. */
export const tradeable = (item: string): boolean => findItem(item)?.kind !== "key";

const tradesOf = (w: TradeWorld) => (w.trades ??= []);
export const tradeOf = (w: TradeWorld, player: string): Trade | undefined => w.trades?.find((t) => t.from === player || t.to === player);
const partner = (t: Trade, me: string) => (t.from === me ? t.to : t.from);

function publish(w: TradeWorld, t: Trade, change: TradeChange, by?: string): void {
  w.events.push({ type: "trade", change, trade: structuredClone(t), ...(by ? { by } : {}) });
}

function end(w: TradeWorld, t: Trade, change: TradeChange, by?: string): void {
  w.trades = tradesOf(w).filter((x) => x !== t);
  publish(w, t, change, by);
}

/** The other player nearest to `me` within reach, for the "Trade" prompt (null if none). */
export function tradeTarget(w: TradeWorld, me: Actor): Actor | null {
  let best: Actor | null = null;
  let bestD = TRADE_RANGE;
  for (const o of Object.values(w.actors)) {
    if (o.kind !== "player" || o.id === me.id || !isAlive(o)) continue;
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** A clean offer: whole positive counts, tradeable, within the bag, at most TRADE_MAX_STACKS stacks. */
export function cleanOffer(bag: Record<string, number>, items: Record<string, number>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [item, n] of Object.entries(items)) {
    if (!Number.isInteger(n) || n <= 0) continue;
    if (!tradeable(item) || (bag[item] ?? 0) < n) return null;
    out[item] = n;
  }
  return Object.keys(out).length <= TRADE_MAX_STACKS ? out : null;
}

/** Swaps both offers if both bags still hold them. */
function execute(w: TradeWorld, t: Trade): boolean {
  const a = w.actors[t.from];
  const b = w.actors[t.to];
  if (!a || !b) return false;
  const oa = cleanOffer(a.bag, t.offers[t.from] ?? {});
  const ob = cleanOffer(b.bag, t.offers[t.to] ?? {});
  if (!oa || !ob) return false;
  const move = (src: Actor, dst: Actor, offer: Record<string, number>) => {
    for (const [item, n] of Object.entries(offer)) {
      const left = (src.bag[item] ?? 0) - n;
      if (left > 0) src.bag[item] = left;
      else delete src.bag[item];
      dst.bag[item] = (dst.bag[item] ?? 0) + n;
    }
  };
  move(a, b, oa);
  move(b, a, ob);
  return true;
}

/** Applies one trade command from player `me`. Anything invalid is ignored. */
export function applyTradeCommand(w: TradeWorld, me: Actor, cmd: TradeCommand): void {
  if (me.kind !== "player") return;
  if (cmd.op === "ask") {
    const other = w.actors[cmd.to];
    if (!other || other.kind !== "player" || other.id === me.id || !isAlive(me) || !isAlive(other)) return;
    if (tradeOf(w, me.id) || tradeOf(w, other.id)) return;
    if (Math.hypot(other.x - me.x, other.y - me.y) > TRADE_RANGE) return;
    const t: Trade = { id: `tr${w.nextId++}`, from: me.id, to: other.id, status: "asked", offers: { [me.id]: {}, [other.id]: {} }, ready: { [me.id]: false, [other.id]: false }, rev: 0, since: w.time };
    tradesOf(w).push(t);
    return publish(w, t, "asked", me.id);
  }
  const t = tradesOf(w).find((x) => x.id === cmd.id && (x.from === me.id || x.to === me.id));
  if (!t) return;
  if (cmd.op === "cancel") return end(w, t, t.status === "asked" && t.to === me.id ? "declined" : "cancelled", me.id);
  if (cmd.op === "answer") {
    if (t.status !== "asked" || t.to !== me.id) return;
    if (!cmd.accept) return end(w, t, "declined", me.id);
    t.status = "open";
    return publish(w, t, "opened", me.id);
  }
  if (t.status !== "open") return;
  if (cmd.op === "offer") {
    const offer = cleanOffer(me.bag, cmd.items);
    if (!offer) return;
    t.offers[me.id] = offer;
    t.rev++;
    t.ready = { [t.from]: false, [t.to]: false };
    return publish(w, t, "updated", me.id);
  }
  // ready
  if (cmd.rev !== t.rev) return;
  t.ready[me.id] = cmd.ready;
  if (!t.ready[t.from] || !t.ready[t.to]) return publish(w, t, "updated", me.id);
  end(w, t, execute(w, t) ? "done" : "failed");
}

/** Each step: requests lapse, trades end when a player leaves, falls or walks away. */
export function stepTrades(w: TradeWorld): void {
  for (const t of [...(w.trades ?? [])]) {
    const a = w.actors[t.from];
    const b = w.actors[t.to];
    if (!a || !b || !isAlive(a) || !isAlive(b) || Math.hypot(a.x - b.x, a.y - b.y) > TRADE_LEASH) end(w, t, "cancelled");
    else if (t.status === "asked" && w.time - t.since > TRADE_ASK_TIMEOUT) end(w, t, "declined");
  }
}

export { partner as tradePartner };
