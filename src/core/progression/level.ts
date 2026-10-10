import type { Actor, CombatStats } from "../combat/actor";
import { PLAYER_STATS } from "../combat/actor";
import { equip } from "../combat/equipment";
import { STAMINA } from "../combat/moves";
import type { SimEvent } from "../combat/events";
import { findQuest } from "../narrative/defs";

/** How a character grows (content: `progression/*.json`). */
export interface ProgressionDef {
  id: string;
  maxLevel: number;
  /** XP to go from level L to L+1 = round(xpBase × L^xpExponent). */
  xpBase: number;
  xpExponent: number;
  /** Stats gained per level above 1. */
  perLevel: Partial<Record<"maxHp" | "power" | "defense" | "critChance" | "maxPoise", number>>;
  /** Talent points earned per level above 1. */
  talentPointsPerLevel: number;
  /** A level-up refills health and stamina. */
  healOnLevelUp: boolean;
}

/** Character growth state on a player actor (carried across maps, saved later). */
export interface Level {
  level: number;
  /** XP earned inside the current level (0 ≤ xp < xpToNext). */
  xp: number;
}

const FALLBACK: ProgressionDef = { id: "player", maxLevel: 1, xpBase: 1, xpExponent: 1, perLevel: {}, talentPointsPerLevel: 0, healOnLevelUp: false };
let curve: ProgressionDef = FALLBACK;
export const registerProgression = (d: ProgressionDef) => void (curve = d);
export const progression = (): ProgressionDef => curve;

/** XP needed to leave `level` (Infinity at the cap). */
export function xpToNext(level: number, def: ProgressionDef = curve): number {
  if (level >= def.maxLevel) return Infinity;
  return Math.max(1, Math.round(def.xpBase * Math.pow(level, def.xpExponent)));
}

/** Player stats at a level, before equipment. */
export function statsAtLevel(level: number, base: CombatStats = PLAYER_STATS, def: ProgressionDef = curve): CombatStats {
  const n = Math.max(0, Math.min(level, def.maxLevel) - 1);
  const s = { ...base };
  for (const [k, v] of Object.entries(def.perLevel) as [keyof ProgressionDef["perLevel"], number][]) s[k] += v * n;
  return s;
}

/** Sets a player's level and recomputes stats (equipment kept, hp ratio kept). */
export function setLevel(a: Actor, level: number, xp = 0): void {
  a.level = Math.max(1, Math.min(level, curve.maxLevel));
  a.xp = a.level >= curve.maxLevel ? 0 : Math.max(0, xp);
  a.baseStats = statsAtLevel(a.level);
  equip(a, a.weapon, a.shield);
}

/** Adds XP, levelling up as many times as it covers. Emits `xp` then one `level-up` per level gained. */
export function grantXp(events: SimEvent[], a: Actor, amount: number): void {
  if (amount <= 0 || a.level >= curve.maxLevel) return;
  a.xp += amount;
  events.push({ type: "xp", id: a.id, amount });
  let gained = 0;
  while (a.level < curve.maxLevel && a.xp >= xpToNext(a.level)) {
    a.xp -= xpToNext(a.level);
    gained++;
    setLevel(a, a.level + 1, a.xp);
    events.push({ type: "level-up", id: a.id, level: a.level });
  }
  if (gained && curve.healOnLevelUp && a.action.kind !== "dead") {
    a.hp = a.stats.maxHp;
    a.stamina = STAMINA.max;
  }
}

/**
 * XP from this step's events: enemy deaths credited to a player (shared by every living player, so
 * co-op partners all progress) and completed quests (to the player who turned it in).
 */
export function awardXp(events: SimEvent[], actors: Record<string, Actor>): void {
  const players = Object.values(actors).filter((a) => a.kind === "player" && a.action.kind !== "dead");
  for (const ev of [...events]) {
    if (ev.type === "death" && ev.xp > 0 && ev.killer && actors[ev.killer]?.kind === "player") {
      for (const p of players) grantXp(events, p, ev.xp);
    } else if (ev.type === "quest" && ev.change === "done") {
      const xp = findQuest(ev.quest)?.rewards.xp ?? 0;
      const p = actors[ev.id];
      if (p && xp > 0) grantXp(events, p, xp);
    }
  }
}
