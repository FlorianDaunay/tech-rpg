import type { Actor } from "../combat/actor";
import { findItem, findPet, findSkill, findTalent, isShield, isWeapon, SKILL_SLOTS } from "../combat/defs";
import { equip } from "../combat/equipment";
import { normalizeGear } from "../combat/gear";
import { refreshLoadout } from "../combat/skills";
import { STAMINA } from "../combat/moves";
import { findQuest } from "../narrative/defs";
import { emptyProgress, type Progress } from "../narrative/progress";
import { setLevel } from "../progression/level";
import { defaultRules, ngPlusUnlocked, normalizeRules, type WorldRules } from "../sim/rules";

/** Bump when the format changes, and add a step to `MIGRATIONS`. */
export const SAVE_VERSION = 1;

/** Everything a player owns and has learned. Carried across maps and written in saves. */
export interface PlayerState {
  hp: number;
  stamina: number;
  bag: Record<string, number>;
  weapon: string | null;
  shield: string | null;
  progress: Progress;
  level: number;
  xp: number;
  loadout: Actor["loadout"];
  ultCharge: number;
  cooldowns: Record<string, number>;
  talents: Record<string, number>;
  /** Weapon-mastery XP by sword family. */
  mastery: Record<string, number>;
  /** Adopted companion. */
  pet: string | null;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** Epoch ms. */
  savedAt: number;
  /** Seconds played. */
  playtime: number;
  map: string;
  /** Feet position on that map. */
  x: number;
  y: number;
  /** World clock (day/night). */
  time: number;
  /** Difficulty, Omens, NG+ cycle of this run. */
  rules: WorldRules;
  player: PlayerState;
}

export function capturePlayer(a: Actor): PlayerState {
  return {
    hp: a.hp,
    stamina: a.stamina,
    bag: { ...a.bag },
    weapon: a.weapon,
    shield: a.shield,
    progress: structuredClone(a.progress ?? emptyProgress()),
    level: a.level,
    xp: a.xp,
    loadout: { ...a.loadout },
    ultCharge: a.ultCharge,
    cooldowns: { ...a.cooldowns },
    talents: { ...a.talents },
    mastery: { ...a.mastery },
    pet: a.pet,
  };
}

/** Puts a captured state back on a freshly spawned player (gear, talents and level recompute stats). */
export function restorePlayer(a: Actor, s: PlayerState): void {
  a.talents = { ...s.talents };
  a.mastery = { ...s.mastery };
  a.pet = s.pet;
  equip(a, s.weapon, s.shield);
  setLevel(a, s.level, s.xp);
  a.hp = Math.max(1, Math.min(a.stats.maxHp, s.hp));
  a.stamina = Math.min(STAMINA.max, s.stamina);
  a.bag = { ...s.bag };
  a.progress = structuredClone(s.progress);
  a.loadout = { ...a.loadout, ...s.loadout };
  refreshLoadout(null, a); // drops skills no longer unlocked, fills empty slots
  a.ultCharge = s.ultCharge;
  a.cooldowns = { ...s.cooldowns };
}

export function captureSave(a: Actor, map: string, time: number, playtime: number, now: number, rules: WorldRules = defaultRules()): SaveData {
  return { version: SAVE_VERSION, savedAt: now, playtime, map, x: a.x, y: a.y, time, rules: { ...rules, omens: [...rules.omens] }, player: capturePlayer(a) };
}

/** Where a new playthrough begins. */
export const START_MAP = "cinderhold";

/**
 * New Game+ from a finished save (null if the story isn't finished): the story starts over (quests,
 * flags, keys) one cycle harder; level, talents, mastery, skills, gear and gold are kept.
 */
export function newGamePlus(save: SaveData, now: number): SaveData | null {
  if (!ngPlusUnlocked(save.player.progress.flags)) return null;
  const p = save.player;
  const bag = Object.fromEntries(Object.entries(p.bag).filter(([id]) => findItem(id)?.kind !== "key"));
  return {
    ...save,
    savedAt: now,
    map: START_MAP,
    x: -1,
    y: -1,
    time: 0,
    rules: { ...save.rules, omens: [...save.rules.omens], ngPlus: save.rules.ngPlus + 1 },
    player: { ...p, bag, hp: Number.MAX_SAFE_INTEGER, ultCharge: 0, cooldowns: {}, progress: emptyProgress() },
  };
}

// ---- loading -----------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/** Positive numbers by key (whole numbers unless `whole` is false). */
const counts = (v: unknown, keep: (k: string) => boolean = () => true, whole = true): Record<string, number> =>
  Object.fromEntries(Object.entries(obj(v)).filter(([k, n]) => keep(k) && typeof n === "number" && n > 0 && Number.isFinite(n)).map(([k, n]) => [k, whole ? Math.floor(n as number) : (n as number)]));

/** Format upgrades, keyed by the version they upgrade FROM. */
const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  // 1 → 2 goes here when the format changes (e.g. gear instances with affixes).
};

/** Bag content that still exists; gear keys are cleaned (lost affixes dropped), equal keys merged. */
function cleanBag(v: unknown): Record<string, number> {
  const bag: Record<string, number> = {};
  for (const [id, n] of Object.entries(counts(v))) {
    const key = isWeapon(id) || isShield(id) ? normalizeGear(id) : findItem(id) ? id : null;
    if (key) bag[key] = (bag[key] ?? 0) + n;
  }
  return bag;
}

/**
 * Reads anything that claims to be a save: upgrades old versions, fills missing fields, and drops
 * what the current content no longer has (removed items, talents, skills, quests). Returns null
 * when it isn't a save at all or comes from a newer game version. `mapExists` comes from content.
 */
export function migrateSave(input: unknown, mapExists: (id: string) => boolean): SaveData | null {
  let raw = obj(input);
  let version = num(raw.version, 0);
  if (version < 1 || version > SAVE_VERSION) return null;
  while (version < SAVE_VERSION) {
    raw = MIGRATIONS[version]!(raw);
    version++;
  }
  const p = obj(raw.player);
  const map = str(raw.map);
  if (!map) return null;
  const progress = obj(p.progress);
  const quests = Object.fromEntries(
    Object.entries(obj(progress.quests))
      .filter(([id]) => !!findQuest(id))
      .map(([id, q]) => {
        const v = obj(q);
        return [id, { done: v.done === true, counts: counts(v.counts), ...(v.ready === true ? { ready: true } : {}) }];
      })
  );
  const skill = (v: unknown) => {
    const id = str(v);
    return id && findSkill(id) ? id : null;
  };
  const loadout = obj(p.loadout);
  const weapon = str(p.weapon);
  const shield = str(p.shield);
  return {
    version: SAVE_VERSION,
    savedAt: num(raw.savedAt, 0),
    playtime: Math.max(0, num(raw.playtime, 0)),
    // A removed map falls back to the hub; the position is then meaningless.
    map: mapExists(map) ? map : START_MAP,
    x: mapExists(map) ? num(raw.x, -1) : -1,
    y: mapExists(map) ? num(raw.y, -1) : -1,
    time: num(raw.time, 0),
    // Absent before difficulty existed: Normal, no Omens, first playthrough.
    rules: normalizeRules({ difficulty: str(obj(raw.rules).difficulty) ?? undefined, omens: strs(obj(raw.rules).omens), ngPlus: num(obj(raw.rules).ngPlus, 0) }),
    player: {
      hp: num(p.hp, 1),
      stamina: num(p.stamina, STAMINA.max),
      bag: cleanBag(p.bag),
      weapon: weapon && isWeapon(weapon) ? normalizeGear(weapon) : null,
      shield: shield && isShield(shield) ? normalizeGear(shield) : null,
      progress: { flags: strs(progress.flags), quests, kills: counts(progress.kills), met: strs(progress.met), visited: strs(progress.visited), cleared: strs(progress.cleared) },
      level: Math.max(1, Math.floor(num(p.level, 1))),
      xp: Math.max(0, num(p.xp, 0)),
      loadout: Object.fromEntries(SKILL_SLOTS.map((s) => [s, skill(loadout[s])])) as Actor["loadout"],
      ultCharge: Math.max(0, num(p.ultCharge, 0)),
      cooldowns: counts(p.cooldowns, undefined, false),
      // Ranks above what the talent now allows are clamped (the extra points come back).
      talents: Object.fromEntries(Object.entries(counts(p.talents, (id) => !!findTalent(id))).map(([id, r]) => [id, Math.min(r, findTalent(id)!.ranks)])),
      // Absent before mastery existed: starts untrained. Families are kept as-is (a renamed family just stops counting).
      mastery: counts(p.mastery, undefined, false),
      pet: (() => {
        const id = str(p.pet);
        return id && findPet(id) ? id : null;
      })(),
    },
  };
}
