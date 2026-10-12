import { isAlive, type Actor, type CombatStats } from "../combat/actor";
import { allAffixes, baseOf, findItem, getShield, getWeapon, isShield, isWeapon } from "../combat/defs";
import { equip } from "../combat/equipment";
import type { SimEvent } from "../combat/events";
import { gearKey, parseGear, QUALITY_MAX } from "../combat/gear";
import { createRng, hashSeed, type Rng } from "../math/rng";
import type { GameMap } from "../world/map";
import { allProjects, economy, findCosmetic, findDanger, findForge, findProject, findShop, type CosmeticKind, type ShopDef, type ShopEntry } from "./defs";

/**
 * Cinderhold's economy, run by the host like everything else: players send commands, these rules
 * check them against the player's own bag (and that they stand by the right NPC) and apply them.
 * Invalid commands are ignored.
 */

export type EconomyCommand =
  | { type: "buy"; shop: string; item: string; count: number }
  | { type: "sell"; shop: string; item: string; count: number }
  /** Forge: `from` says where the piece is (the bag, or worn). Reroll replaces affix number `affix`. */
  | { type: "forge"; forge: string; op: "upgrade" | "reroll"; item: string; from: "bag" | "weapon" | "shield"; affix?: number }
  | { type: "build"; project: string }
  | { type: "danger"; rift: string; tier: number }
  | { type: "cosmetic"; slot: CosmeticKind; id: string | null };

/** Players must stand this close to the NPC (or brazier) they deal with. */
export const SERVICE_RANGE = 72;

/** What the economy reads and writes of the world. */
export interface EconomyWorld {
  actors: Record<string, Actor>;
  events: SimEvent[];
  /** Day seed of the shops' daily selection (the host's UTC date). */
  day?: number;
}

// ---- village projects -------------------------------------------------------------------------

export const BUILT = "built:";
export const isBuilt = (a: Pick<Actor, "progress">, project: string) => !!a.progress?.flags.includes(BUILT + project);
const builtProjects = (a: Pick<Actor, "progress">) => allProjects().filter((p) => isBuilt(a, p.id));
const sumEffect = (a: Pick<Actor, "progress">, k: "xp" | "shopDiscount" | "forgeDiscount" | "rotatingSlots") => builtProjects(a).reduce((s, p) => s + (p.effects[k] ?? 0), 0);

/** Stats the player's finished projects grant (applied by `equip`). */
export function projectStats(a: Pick<Actor, "progress">): Partial<CombatStats> {
  const out: Partial<CombatStats> = {};
  for (const p of builtProjects(a)) for (const [k, v] of Object.entries(p.effects.stats ?? {}) as [keyof CombatStats, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}
export const xpMultOf = (a: Pick<Actor, "progress">) => 1 + sumEffect(a, "xp");
export const shopDiscountOf = (a: Pick<Actor, "progress">) => Math.min(0.5, sumEffect(a, "shopDiscount"));
export const forgeDiscountOf = (a: Pick<Actor, "progress">) => Math.min(0.5, sumEffect(a, "forgeDiscount"));

// ---- prices ------------------------------------------------------------------------------------

/** Today's selection of a shop (same for every player; finished projects add slots for their builder). */
export function rotation(shop: ShopDef, day: number, extraSlots = 0): ShopEntry[] {
  const rng = createRng(hashSeed(`${shop.id}:${day}`));
  let pool = [...shop.rotating.pool];
  const out: ShopEntry[] = [];
  for (let i = 0; i < shop.rotating.count + extraSlots && pool.length; i++) {
    const pick = rng.weighted(pool.map((e) => [e, e.weight] as const));
    pool = pool.filter((e) => e !== pick);
    out.push({ item: pick.item, price: pick.price });
  }
  return out;
}

/** What a shop offers this player today: its shelf, then the daily items. */
export function offers(shop: ShopDef, day: number, buyer: Pick<Actor, "progress">): (ShopEntry & { daily: boolean })[] {
  return [...shop.sells.map((e) => ({ ...e, daily: false })), ...rotation(shop, day, sumEffect(buyer, "rotatingSlots")).map((e) => ({ ...e, daily: true }))];
}

export const priceFor = (entry: ShopEntry, buyer: Pick<Actor, "progress">) => Math.max(1, Math.round(entry.price * (1 - shopDiscountOf(buyer))));

/** A piece's worth: base value, more for rolled affixes and forge tiers. */
export function valueOf(key: string): number {
  if (isWeapon(key) || isShield(key)) {
    const base = isWeapon(key) ? getWeapon(key).value : getShield(key).value;
    const { affixes, tier } = parseGear(key);
    return Math.round((base ?? 0) * (1 + 0.25 * affixes.length + 0.3 * tier));
  }
  return findItem(key)?.value ?? 0;
}

/** Can it be sold? Not gold, not key items, not worthless things. */
export const sellable = (key: string) => {
  const item = findItem(key);
  return !(item && (item.kind === "key" || item.kind === "currency")) && valueOf(key) > 0;
};

export const sellPrice = (shop: ShopDef, key: string) => (shop.buyRate > 0 && sellable(key) ? Math.max(1, Math.floor(valueOf(key) * shop.buyRate)) : 0);

// ---- helpers -----------------------------------------------------------------------------------

const near = (w: EconomyWorld, a: Actor, npc: string) => Object.values(w.actors).some((o) => o.kind === "npc" && o.type === npc && Math.hypot(o.x - a.x, o.y - a.y) <= SERVICE_RANGE);

const hasAll = (a: Actor, gold: number, items: Record<string, number>) => (a.bag.gold ?? 0) >= gold && Object.entries(items).every(([id, n]) => (a.bag[id] ?? 0) >= n);

function take(a: Actor, id: string, n: number): void {
  const left = (a.bag[id] ?? 0) - n;
  if (left > 0) a.bag[id] = left;
  else delete a.bag[id];
}
const give = (a: Actor, id: string, n: number) => (a.bag[id] = (a.bag[id] ?? 0) + n);

function pay(a: Actor, gold: number, items: Record<string, number>): void {
  if (gold > 0) take(a, "gold", gold);
  for (const [id, n] of Object.entries(items)) take(a, id, n);
}

/** Moves a piece out of the bag or a slot, and the new key back to the same place. */
function replacePiece(a: Actor, from: "bag" | "weapon" | "shield", old: string, next: string): void {
  if (from === "bag") {
    take(a, old, 1);
    give(a, next, 1);
  } else if (from === "weapon") equip(a, next, a.shield);
  else equip(a, a.weapon, next);
}

const pieceThere = (a: Actor, from: "bag" | "weapon" | "shield", key: string) => (from === "bag" ? (a.bag[key] ?? 0) > 0 : from === "weapon" ? a.weapon === key : a.shield === key);

// ---- commands ----------------------------------------------------------------------------------

export function applyEconomyCommand(w: EconomyWorld, map: GameMap, rng: Rng, a: Actor, cmd: EconomyCommand): void {
  if (a.kind !== "player" || !isAlive(a)) return;
  switch (cmd.type) {
    case "buy": {
      const shop = findShop(cmd.shop);
      const count = Math.floor(cmd.count);
      if (!shop || !near(w, a, shop.npc) || count < 1 || count > 99) return;
      const entry = offers(shop, w.day ?? 0, a).find((e) => e.item === cmd.item);
      if (!entry) return;
      const cosmetic = findCosmetic(entry.item);
      if (cosmetic && (count !== 1 || a.cosmetics.owned.includes(cosmetic.id))) return;
      const cost = priceFor(entry, a) * count;
      if ((a.bag.gold ?? 0) < cost) return;
      take(a, "gold", cost);
      if (cosmetic) a.cosmetics.owned.push(cosmetic.id);
      else give(a, entry.item, count);
      w.events.push({ type: "trade-shop", id: a.id, shop: shop.id, item: entry.item, count, gold: -cost });
      return;
    }
    case "sell": {
      const shop = findShop(cmd.shop);
      const count = Math.floor(cmd.count);
      if (!shop || !near(w, a, shop.npc) || count < 1 || (a.bag[cmd.item] ?? 0) < count) return;
      const each = sellPrice(shop, cmd.item);
      if (each <= 0) return;
      take(a, cmd.item, count);
      give(a, "gold", each * count);
      w.events.push({ type: "trade-shop", id: a.id, shop: shop.id, item: cmd.item, count: -count, gold: each * count });
      return;
    }
    case "forge": {
      const forge = findForge(cmd.forge);
      if (!forge || !near(w, a, forge.npc) || !pieceThere(a, cmd.from, cmd.item)) return;
      if (!(isWeapon(cmd.item) || isShield(cmd.item))) return;
      if ((cmd.from === "weapon" && !isWeapon(cmd.item)) || (cmd.from === "shield" && !isShield(cmd.item))) return;
      const { base, affixes, tier } = parseGear(cmd.item);
      if (cmd.op === "upgrade") {
        const next = forge.tiers[tier];
        if (!next) return;
        const gold = Math.round(next.gold * (1 - forgeDiscountOf(a)));
        if (!hasAll(a, gold, next.items)) return;
        pay(a, gold, next.items);
        const key = gearKey(base, affixes, tier + 1);
        replacePiece(a, cmd.from, cmd.item, key);
        w.events.push({ type: "forged", id: a.id, item: key, op: "upgrade" });
        return;
      }
      // Reroll one affix: a different roll from the affixes that fit, never a stat the piece already has.
      const i = cmd.affix ?? -1;
      if (!affixes[i]) return;
      const gold = Math.round(forge.reroll.gold * (1 - forgeDiscountOf(a)));
      if (!hasAll(a, gold, forge.reroll.items)) return;
      const slot = isWeapon(base) ? "weapon" : "shield";
      const others = new Set(affixes.filter((_, k) => k !== i).flatMap((x) => allAffixes().filter((d) => d.id === x.id).map((d) => d.stat)));
      const pool = allAffixes().filter((d) => (d.slot === "any" || d.slot === slot) && d.weight > 0 && !others.has(d.stat));
      if (!pool.length) return;
      pay(a, gold, forge.reroll.items);
      const def = rng.weighted(pool.map((d) => [d, d.weight] as const));
      const rolled = affixes.map((x, k) => (k === i ? { id: def.id, q: rng.int(0, QUALITY_MAX) } : x));
      const key = gearKey(base, rolled, tier);
      replacePiece(a, cmd.from, cmd.item, key);
      w.events.push({ type: "forged", id: a.id, item: key, op: "reroll" });
      return;
    }
    case "build": {
      const p = findProject(cmd.project);
      if (!p || !near(w, a, p.npc) || isBuilt(a, p.id) || !p.requires.every((r) => isBuilt(a, r))) return;
      if (!hasAll(a, p.cost.gold, p.cost.items)) return;
      pay(a, p.cost.gold, p.cost.items);
      a.progress!.flags.push(BUILT + p.id);
      equip(a, a.weapon, a.shield); // stat bonuses apply at once
      w.events.push({ type: "built", id: a.id, project: p.id });
      return;
    }
    case "danger": {
      const d = findDanger(cmd.rift);
      const tier = Math.floor(cmd.tier);
      if (!d || tier < 0 || tier > d.costs.length) return;
      const brazier = map.objects.find((o) => o.interact?.kind === "service" && o.interact.service === "rift-danger" && o.interact.ref === cmd.rift);
      if (!brazier || Math.hypot(brazier.x - a.x, brazier.y - map.tileSize / 2 - a.y) > SERVICE_RANGE) return;
      // Raising pays the difference; lowering is free (the dust is already burnt).
      const cost = Math.max(0, (d.costs[tier - 1] ?? 0) - (d.costs[a.riftDanger - 1] ?? 0));
      if (cost > 0 && (a.bag[d.item] ?? 0) < cost) return;
      if (cost > 0) take(a, d.item, cost);
      a.riftDanger = tier;
      w.events.push({ type: "danger", id: a.id, rift: d.rift, tier });
      return;
    }
    case "cosmetic": {
      if (cmd.id !== null) {
        const c = findCosmetic(cmd.id);
        if (!c || c.kind !== cmd.slot || !a.cosmetics.owned.includes(c.id)) return;
      }
      a.cosmetics[cmd.slot] = cmd.id;
      w.events.push({ type: "cosmetic", id: a.id, slot: cmd.slot, cosmetic: cmd.id });
      return;
    }
  }
}

/** The map object a player can interact with (rest point, service), within reach, or null. */
export function objectTarget(map: GameMap, a: Pick<Actor, "x" | "y" | "progress">, reach: number) {
  let best: GameMap["objects"][number] | null = null;
  let bestD = reach;
  for (const o of map.objects) {
    // A village project's object only exists for players who built it.
    if (!o.interact || (o.ifFlag && !a.progress?.flags.includes(o.ifFlag))) continue;
    const d = Math.hypot(o.x - a.x, o.y - map.tileSize / 2 - a.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** Resting at the Lantern: whole again, statuses gone. */
export function rest(events: SimEvent[], a: Actor, maxStamina: number): void {
  a.hp = a.stats.maxHp;
  a.stamina = maxStamina;
  a.statuses = [];
  a.poise = a.stats.maxPoise;
  events.push({ type: "rest", id: a.id });
}

/** What a lit Rift danger tier adds to each multiplier (the party uses the highest tier any of them lit). */
export function dangerMods(rift: string, tier: number): Partial<Record<string, number>> {
  const d = findDanger(rift);
  if (!d || tier <= 0) return {};
  return Object.fromEntries(Object.entries(d.perTier).map(([k, v]) => [k, (v ?? 0) * tier]));
}

export { baseOf, economy };
