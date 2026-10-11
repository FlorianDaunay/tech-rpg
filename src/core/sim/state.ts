import { createActor, PLAYER_STATS, type Actor } from "../combat/actor";
import { PET_TELEPORT, thinkEnemy, thinkNpc, thinkPet } from "../combat/ai";
import { findNpc } from "../narrative/defs";
import { trackProgress } from "../narrative/progress";
import { applyCommand } from "../combat/commands";
import { findPet, getEnemy, type PetDef } from "../combat/defs";
import { equip } from "../combat/equipment";
import { refreshLoadout } from "../combat/skills";
import { dropLoot, resolveMelee, separate, stepActor, stepHazards, stepLifecycle, stepPickups, stepProjectiles, type CombatWorld } from "../combat/step";
import { createRng, type Rng } from "../math/rng";
import { awardXp } from "../progression/level";
import { isSolidCell, type GameMap } from "../world/map";
import { RIFT_PREFIX } from "../world/riftgen";
import { emptyIntent, type Intent } from "./intent";
import type { Modifiers } from "../combat/modifiers";
import { combineMods, normalizeRules, scaleEnemy, type WorldRules } from "./rules";
import { createPvp } from "../combat/pvp";
import { applyTradeCommand, stepTrades, tradeTarget, type Trade } from "../trade/trade";
import { recordPositions, rewinder } from "./lagcomp";

/** Simulation runs at a fixed rate everywhere (solo, host, client prediction, replays). */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export interface SimState extends CombatWorld {
  tick: number;
  mapId: string;
  /** Seeded RNG state: every random roll comes from here, so a sim is reproducible. */
  rngState: number;
  /** Difficulty, Omens, NG+ cycle, and their combined multipliers (`applyRules` keeps them in sync). */
  rules: WorldRules;
  mods: Modifiers;
  /** Extra multipliers of this map on top of the rules (Rift depth), kept when the rules change. */
  extra: Partial<Modifiers>;
  /** Enemy spawn points of the map (respawn bookkeeping). */
  spawners: Spawner[];
  /** Chests of the map (interact point = the chest's cell centre). */
  chests: Chest[];
  /** Boss arenas: a ring that seals while the boss fights. */
  arenas: Arena[];
  /** Trades between players in progress (see core/trade). */
  trades: Trade[];
  /** Portals still sealed (their required enemies stand). Updated each step; opening emits `portal-open`. */
  sealed: string[];
}

/** Host-side inputs of a step that aren't player intents. */
export interface StepOptions {
  /** PvP lag compensation: each remote attacker's delay (ms) between the world and what they see. */
  lagMs?: Record<string, number>;
}

/**
 * A boss arena: a circle around the boss's spawn. While sealed, whoever was inside when the fight
 * started (and the adds it calls) can't leave, and nobody else can enter. It opens when the boss
 * falls, or when nobody inside is left standing (the boss then heals back and can be retried).
 */
export interface Arena {
  boss: string;
  x: number;
  y: number;
  radius: number;
  sealed: boolean;
  /** Actor ids held inside while sealed. */
  inside: string[];
  /** Adds the boss summoned during this fight (removed if the party wipes). */
  adds?: string[];
}

export interface Chest {
  key: string;
  loot: string;
  x: number;
  y: number;
  opened: boolean;
}

/** An enemy spawn point: who stands there now, and when its enemy comes back. */
export interface Spawner {
  /** `map:spawn`, the id recorded in progress for one-time spawns. */
  key: string;
  enemy: string;
  x: number;
  y: number;
  actor: string | null;
  every: number | "never";
  /** Sim time when it may respawn (null = occupied, or never). */
  at: number | null;
}

/** Players this close to a spawn point keep it from respawning (no popping in under their nose). */
export const RESPAWN_CLEARANCE = 180;

/** `time` is the shared world clock (day/night): carried over when the party changes map. */
export function createSim(mapId: string, seed: number, time = 0, rules?: Partial<WorldRules>, extra: Partial<Modifiers> = {}): SimState {
  const r = normalizeRules(rules);
  return { tick: 0, time, mapId, rngState: seed >>> 0, actors: {}, projectiles: [], pickups: [], events: [], nextId: 1, rules: r, mods: combineMods(r, extra), extra, spawners: [], chests: [], arenas: [], trades: [], pvp: null, sealed: [], hazards: [] };
}

export function spawnPlayer(state: SimState, id: string, look: string, x: number, y: number, gear: { weapon?: string | null; shield?: string | null } = {}): Actor {
  const a = createActor({ id, team: "players", kind: "player", type: "embersworn", look, x, y, stats: PLAYER_STATS });
  equip(a, gear.weapon ?? null, gear.shield ?? null);
  refreshLoadout(null, a);
  state.actors[id] = a;
  return a;
}

export function spawnEnemy(state: SimState, type: string, x: number, y: number): Actor {
  const def = getEnemy(type);
  const id = `e${state.nextId++}`;
  const a = createActor({ id, team: "enemies", kind: "enemy", type, look: def.look, x, y, stats: def.stats, radius: def.radius });
  scaleEnemy(a, state.mods);
  state.actors[id] = a;
  if (def.boss) state.arenas.push({ boss: id, x, y, radius: def.boss.arena, sealed: false, inside: [] });
  return a;
}

/**
 * Places a map's enemies and NPCs. One-time spawns listed in `cleared` (slain for good) are skipped.
 */
export function populateMap(state: SimState, map: GameMap, cleared: ReadonlySet<string> = new Set(), defaultRespawn = 180): void {
  // Chests opened and guardians slain inside a Rift run only matter during that run.
  if (!map.id.startsWith(RIFT_PREFIX))
    for (const p of players(state)) if (p.progress) p.progress.cleared = p.progress.cleared.filter((k) => !k.startsWith(RIFT_PREFIX));
  // A companion someone adopted walks with them, not around the hub.
  const adoptedNpcs = new Set(players(state).flatMap((p) => (p.pet ? [findPet(p.pet)?.npc ?? ""] : [])));
  for (const o of map.objects)
    if (o.chest) state.chests.push({ key: o.chest.key, loot: o.chest.loot, x: o.x, y: o.y - map.tileSize / 2, opened: cleared.has(o.chest.key) });
  for (const s of map.spawns) {
    if (s.kind === "npc" && s.ref && !adoptedNpcs.has(s.ref)) spawnNpc(state, s.ref, s.x, s.y);
    if (s.kind !== "enemy" || !s.ref) continue;
    const key = `${map.id}:${s.id}`;
    if (s.respawn === "never" && cleared.has(key)) continue;
    const a = spawnEnemy(state, s.ref, s.x, s.y);
    state.spawners.push({ key, enemy: s.ref, x: s.x, y: s.y, actor: a.id, every: s.respawn ?? defaultRespawn, at: null });
  }
}

/** Makes the map a PvP arena: players fight each other, fallen ones return at the map's player spawns. */
export function enablePvp(state: SimState, map: GameMap): void {
  state.pvp = createPvp(map.spawns.filter((s) => s.kind === "player").map((s) => ({ x: s.x, y: s.y })));
}

/** Nearest unopened chest within reach, or null (NPCs take priority: see the interact step). */
export function chestTarget(state: SimState, player: Actor): Chest | null {
  let best: Chest | null = null;
  let bestD = TALK_RANGE;
  for (const c of state.chests) {
    if (c.opened) continue;
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Opens a chest once for the whole party: loot spills towards the opener, the chest is remembered. */
function openChest(state: SimState, player: Actor, c: Chest, rng: Rng): void {
  c.opened = true;
  for (const p of players(state)) if (p.progress && !p.progress.cleared.includes(c.key)) p.progress.cleared.push(c.key);
  state.events.push({ type: "chest", id: player.id, chest: c.key, x: c.x, y: c.y });
  const toward = Math.atan2(player.y - c.y, player.x - c.x);
  dropLoot(state, c.loot, c.x, c.y + 6, rng, { angle: [toward - 1.1, toward + 1.1] });
}

/** Starts respawn timers when spawn enemies die; brings them back when due and no player is near. */
function stepSpawners(state: SimState): void {
  for (const sp of state.spawners) {
    if (sp.actor) {
      const a = state.actors[sp.actor];
      if (a && a.action.kind !== "dead") continue;
      sp.actor = null;
      if (sp.every === "never") {
        // The whole party has cleared it (co-op partners share the guardian).
        for (const p of players(state)) if (p.progress && !p.progress.cleared.includes(sp.key)) p.progress.cleared.push(sp.key);
      } else sp.at = state.time + sp.every;
      continue;
    }
    if (sp.at === null || state.time < sp.at) continue;
    if (players(state).some((p) => p.action.kind !== "dead" && Math.hypot(p.x - sp.x, p.y - sp.y) < RESPAWN_CLEARANCE)) continue;
    const a = spawnEnemy(state, sp.enemy, sp.x, sp.y);
    sp.actor = a.id;
    sp.at = null;
    state.events.push({ type: "spawn", id: a.id });
  }
}

/** A boss arena is sealed (exits shut). */
export const arenaLocked = (state: SimState): boolean => state.arenas.some((r) => r.sealed);

const alive = (a: Actor | undefined): a is Actor => !!a && a.action.kind !== "dead";

/**
 * Seals arenas when their boss engages, opens them when it falls or when nobody inside is left
 * standing, and keeps everyone on their side of the wall (position clamped, outward speed dropped).
 */
/** A walkable spot just outside an arena's wall, on the side facing `toward` (the player's way in). */
export function outsideArena(map: GameMap, r: Arena, toward: { x: number; y: number }): { x: number; y: number } {
  const base = Math.atan2(toward.y - r.y, toward.x - r.x);
  const ts = map.tileSize;
  const free = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 0], [-8, 0], [8, 0], [0, -8], [0, 8]] as const) if (isSolidCell(map, Math.floor((x + dx) / ts), Math.floor((y + dy) / ts))) return false;
    return x > 0 && y > 0 && x < map.width * ts && y < map.height * ts;
  };
  for (const extra of [28, 48, 72])
    for (let k = 0; k < 16; k++) {
      // base, then alternating either side of it.
      const ang = base + Math.ceil(k / 2) * (k % 2 ? 1 : -1) * (Math.PI / 8);
      const x = r.x + Math.cos(ang) * (r.radius + extra);
      const y = r.y + Math.sin(ang) * (r.radius + extra);
      if (free(x, y)) return { x, y };
    }
  return toward;
}

/** The party wiped: the boss is whole again, back home, its adds gone (the next try starts fresh). */
function resetBoss(state: SimState, r: Arena): void {
  const boss = state.actors[r.boss];
  if (boss && boss.action.kind !== "dead") {
    Object.assign(boss, { x: boss.home.x, y: boss.home.y, vx: 0, vy: 0, hp: boss.stats.maxHp, poise: boss.stats.maxPoise, statuses: [] });
    boss.action = { kind: "free" };
    if (boss.ai) Object.assign(boss.ai, { target: null, regen: 0, move: null });
    state.events.push({ type: "respawn", id: boss.id });
  }
  for (const id of r.adds ?? []) {
    if (!state.actors[id]) continue;
    delete state.actors[id];
    state.events.push({ type: "despawn", id });
  }
  r.adds = [];
}

function stepArenas(state: SimState, map: GameMap): void {
  for (const r of state.arenas) {
    const boss = state.actors[r.boss];
    if (!r.sealed) {
      if (!alive(boss) || !boss.ai?.target) continue;
      r.sealed = true;
      r.inside = Object.values(state.actors)
        .filter((a) => alive(a) && a.kind !== "npc" && Math.hypot(a.x - r.x, a.y - r.y) < r.radius)
        .map((a) => a.id);
      if (!r.inside.includes(r.boss)) r.inside.push(r.boss);
      state.events.push({ type: "arena", id: r.boss, sealed: true, x: r.x, y: r.y, radius: r.radius });
    }
    // Fallen players leave the fight; they come back just outside the wall, on their way in.
    for (const id of r.inside) {
      const p = state.actors[id];
      if (p?.kind === "player" && p.action.kind === "dead" && !p.respawnAt) p.respawnAt = outsideArena(map, r, p.home);
    }
    r.inside = r.inside.filter((id) => alive(state.actors[id]) || (id === r.boss && !!state.actors[id]));
    const playersIn = r.inside.some((id) => state.actors[id]?.kind === "player");
    if (!alive(boss) || !playersIn) {
      if (alive(boss)) resetBoss(state, r);
      r.sealed = false;
      r.inside = [];
      state.events.push({ type: "arena", id: r.boss, sealed: false, x: r.x, y: r.y, radius: r.radius });
      continue;
    }
    for (const a of Object.values(state.actors)) {
      if (!alive(a) || a.kind === "npc") continue;
      const dx = a.x - r.x;
      const dy = a.y - r.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      const out = a.vx * nx + a.vy * ny;
      const side = a.kind === "pet" && a.owner ? a.owner : a.id;
      if (r.inside.includes(side)) {
        const max = r.radius - a.radius;
        if (d <= max) continue;
        Object.assign(a, { x: r.x + nx * max, y: r.y + ny * max });
        if (out > 0) Object.assign(a, { vx: a.vx - out * nx, vy: a.vy - out * ny });
      } else {
        const min = r.radius + a.radius;
        if (d >= min) continue;
        Object.assign(a, { x: r.x + nx * min, y: r.y + ny * min });
        if (out < 0) Object.assign(a, { vx: a.vx - out * nx, vy: a.vy - out * ny });
      }
    }
  }
  // A boss gone for good leaves no arena behind.
  state.arenas = state.arenas.filter((r) => r.sealed || !!state.actors[r.boss]);
}

/** Spawns the adds bosses called this step, in a ring around them, keeping at most `count` of that type alive. */
function spawnSummons(state: SimState, map: GameMap, rng: Rng): void {
  for (const ev of [...state.events]) {
    if (ev.type !== "summon") continue;
    const boss = state.actors[ev.id];
    if (!boss) continue;
    // Only adds already inside its arena count against the cap (the zone's own enemies of that type don't).
    const arena = getEnemy(boss.type).boss?.arena ?? 0;
    const alive = Object.values(state.actors).filter((a) => a.type === ev.enemy && a.action.kind !== "dead" && Math.hypot(a.x - boss.home.x, a.y - boss.home.y) <= arena).length;
    for (let i = 0; i < ev.count - alive; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const r = rng.range(40, 70);
      const x = boss.x + Math.cos(ang) * r;
      const y = boss.y + Math.sin(ang) * r;
      if (isSolidCell(map, Math.floor(x / map.tileSize), Math.floor(y / map.tileSize))) continue;
      const add = spawnEnemy(state, ev.enemy, x, y);
      add.ai!.target = boss.ai?.target ?? null;
      for (const r of state.arenas)
        if (r.boss === boss.id && r.sealed) {
          r.inside.push(add.id);
          (r.adds ??= []).push(add.id);
        }
      state.events.push({ type: "spawn", id: add.id });
    }
  }
}

/** A pet's stats at its owner's level. */
function petStats(def: PetDef, level: number) {
  const s = { ...def.stats };
  for (const [k, v] of Object.entries(def.perLevel) as [keyof PetDef["perLevel"], number][]) s[k] += v * (level - 1);
  return s;
}

/**
 * Keeps each player's companion in the world: spawned beside its owner (on every map, after any
 * change of pet), levelled with its owner, brought back to heel when left far behind.
 */
export function syncPets(state: SimState): void {
  // The hub NPC of an adopted pet leaves at once (it walks with its owner now).
  const adopted = new Set(players(state).flatMap((p) => (p.pet ? [findPet(p.pet)?.npc ?? ""] : [])));
  for (const a of Object.values(state.actors))
    if (a.kind === "npc" && adopted.has(a.type)) {
      delete state.actors[a.id];
      state.events.push({ type: "despawn", id: a.id });
    }
  for (const p of players(state)) {
    const def = p.pet ? findPet(p.pet) : undefined;
    const current = Object.values(state.actors).find((a) => a.kind === "pet" && a.owner === p.id);
    if (current && current.type !== def?.id) delete state.actors[current.id];
    if (!def) continue;
    let pet = current && current.type === def.id ? current : undefined;
    if (!pet) {
      pet = createActor({ id: `pet-${p.id}`, team: "players", kind: "pet", type: def.id, look: def.look, x: p.x + 10, y: p.y + 6, stats: petStats(def, p.level), radius: def.radius });
      pet.owner = p.id;
      pet.level = p.level;
      state.actors[pet.id] = pet;
      state.events.push({ type: "spawn", id: pet.id });
    }
    if (pet.level !== p.level) {
      const ratio = pet.hp / pet.stats.maxHp;
      pet.level = p.level;
      pet.baseStats = petStats(def, p.level);
      pet.stats = { ...pet.baseStats };
      if (pet.action.kind !== "dead") pet.hp = Math.max(1, Math.round(pet.stats.maxHp * ratio));
    }
    if (pet.action.kind !== "dead" && p.action.kind !== "dead" && Math.hypot(pet.x - p.x, pet.y - p.y) > PET_TELEPORT) {
      Object.assign(pet, { x: p.x + 10, y: p.y + 6, vx: 0, vy: 0 });
      pet.ai!.target = null;
      state.events.push({ type: "spawn", id: pet.id });
    }
  }
}

/** Living actors of the enemy spawns a portal requires (empty = open). */
export function portalWardens(state: SimState, map: GameMap, portal: GameMap["portals"][number]): Actor[] {
  const out: Actor[] = [];
  for (const id of portal.requires) {
    const sp = state.spawners.find((s) => s.key === `${map.id}:${id}`);
    const a = sp?.actor ? state.actors[sp.actor] : undefined;
    if (a && a.action.kind !== "dead") out.push(a);
  }
  return out;
}

/** Re-checks sealed portals; a portal whose wardens all fell opens (once, with an event). */
function stepSeals(state: SimState, map: GameMap): void {
  const now = map.portals.filter((p) => p.requires.length && portalWardens(state, map, p).length > 0).map((p) => p.id);
  for (const id of state.sealed ?? []) {
    if (now.includes(id)) continue;
    const p = map.portals.find((x) => x.id === id);
    if (p) state.events.push({ type: "portal-open", portal: id, x: p.x + p.w / 2, y: p.y + p.h / 2 });
  }
  state.sealed = now;
}

/** Living players standing inside a portal rectangle (feet position). Shut while a boss fights or while sealed. */
function detectPortals(state: SimState, map: GameMap): void {
  if (!map.portals.length || arenaLocked(state)) return;
  for (const a of players(state)) {
    if (a.action.kind === "dead") continue;
    const p = map.portals.find((r) => !state.sealed.includes(r.id) && a.x >= r.x && a.x < r.x + r.w && a.y >= r.y && a.y < r.y + r.h);
    if (p) state.events.push({ type: "portal", id: a.id, portal: p.id, to: p.to, arrive: p.arrive });
  }
}

const NPC_STATS = { maxHp: 1, power: 0, defense: 0, critChance: 0, critMultiplier: 1, maxPoise: 999, speed: 34 };
/** Reach for the interact action (px from the player's feet to the NPC's). */
export const TALK_RANGE = 34;

export function spawnNpc(state: SimState, npc: string, x: number, y: number): Actor | null {
  const def = findNpc(npc);
  if (!def) return null;
  const id = `n${state.nextId++}`;
  const a = createActor({ id, team: "neutral", kind: "npc", type: npc, look: def.look, x, y, stats: NPC_STATS });
  state.actors[id] = a;
  return a;
}

/** Nearest NPC a player can talk to, or null. Shared by the sim (interact) and the HUD prompt. */
export function talkTarget(state: SimState, player: Actor): Actor | null {
  let best: Actor | null = null;
  let bestD = TALK_RANGE;
  for (const a of Object.values(state.actors)) {
    if (a.kind !== "npc") continue;
    const d = Math.hypot(a.x - player.x, a.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export const players = (state: SimState) => Object.values(state.actors).filter((a) => a.kind === "player");

/**
 * Advances the simulation by one fixed step. Mutates `state` in place (the sim owns its state;
 * snapshots for the network/saves are copies taken outside). `state.events` holds what happened
 * during this step only.
 */
export function stepSim(state: SimState, map: GameMap, intents: Record<string, Intent>, opts: StepOptions = {}): void {
  state.tick++;
  state.time += SIM_DT;
  state.events = [];
  syncPets(state);
  const rng = createRng(state.rngState);
  for (const id of Object.keys(state.actors).sort()) {
    const a = state.actors[id]!;
    const intent =
      a.kind === "player"
        ? (intents[id] ?? emptyIntent())
        : a.kind === "npc"
          ? thinkNpc(state, a, rng, SIM_DT, findNpc(a.type)?.wander ?? 0)
          : a.kind === "pet"
            ? thinkPet(state, a, findPet(a.type)!, rng, SIM_DT)
            : thinkEnemy(state, a, rng, SIM_DT);
    for (const cmd of intent.commands ?? [])
      if (cmd.type === "trade") applyTradeCommand(state, a, cmd);
      else applyCommand(state.events, a, cmd, a.kind === "player" ? state.mods.healing : 1);
    if (a.kind === "player" && intent.pressed.includes("interact") && a.action.kind === "free") {
      const npc = talkTarget(state, a);
      const def = npc && findNpc(npc.type);
      if (npc && def) state.events.push({ type: "talk", id: a.id, npc: npc.type, actor: npc.id, dialogue: def.dialogue });
      else {
        const chest = chestTarget(state, a);
        const mate = !chest && !state.pvp ? tradeTarget(state, a) : null;
        if (chest) openChest(state, a, chest, rng);
        else if (mate) applyTradeCommand(state, a, { type: "trade", op: "ask", to: mate.id });
      }
    }

    stepActor(state, map, rng, a, intent, SIM_DT);
  }
  spawnSummons(state, map, rng);
  separate(state, map);
  stepArenas(state, map);
  resolveMelee(state, rng, state.pvp && opts.lagMs ? rewinder(state, opts.lagMs) : undefined);
  stepProjectiles(state, map, rng, SIM_DT);
  stepHazards(state, rng, SIM_DT);
  stepPickups(state, map, SIM_DT);
  stepLifecycle(state);
  stepSpawners(state);
  stepSeals(state, map);
  detectPortals(state, map);
  for (const a of players(state)) if (a.progress) trackProgress(state.events, { id: a.id, bag: a.bag, progress: a.progress }, state.mapId);
  awardXp(state.events, state.actors);
  stepTrades(state);
  if (state.pvp) recordPositions(state);
  state.rngState = rng.state;
}
