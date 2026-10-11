import type { Actor } from "../combat/actor";
import { getEnemy } from "../combat/defs";
import { MODIFIERS, NEUTRAL_MODS, type Modifier, type Modifiers } from "../combat/modifiers";

/** A difficulty level (Story / Normal / Hard / Nightmare). */
export interface DifficultyDef {
  id: string;
  /** Position in pickers, easiest first. */
  order: number;
  mods: Partial<Modifiers>;
}

/** An optional world modifier the player opts into: harder in some way, richer in another. */
export interface OmenDef {
  id: string;
  mods: Partial<Modifiers>;
}

/** New Game+: unlocked by a story flag; each cycle adds `perCycle` to the modifiers (+0.5 → ×1.5, ×2…). */
export interface NgPlusDef {
  unlockFlag: string;
  perCycle: Partial<Modifiers>;
}

export interface RulesData {
  difficulties: Record<string, DifficultyDef>;
  omens: Record<string, OmenDef>;
  ngPlus?: NgPlusDef;
}

/** What a run is played with. Host-authoritative, saved with the run. */
export interface WorldRules {
  difficulty: string;
  omens: string[];
  /** 0 = first playthrough. */
  ngPlus: number;
}

export const DEFAULT_DIFFICULTY = "normal";
export const defaultRules = (): WorldRules => ({ difficulty: DEFAULT_DIFFICULTY, omens: [], ngPlus: 0 });

let data: RulesData = { difficulties: {}, omens: {} };
export const registerRules = (d: RulesData) => void (data = d);
export const findDifficulty = (id: string): DifficultyDef | undefined => data.difficulties[id];
export const findOmen = (id: string): OmenDef | undefined => data.omens[id];
export const allDifficulties = (): DifficultyDef[] => Object.values(data.difficulties).sort((a, b) => a.order - b.order);
export const allOmens = (): OmenDef[] => Object.values(data.omens);
export const ngPlusDef = (): NgPlusDef | undefined => data.ngPlus;

/** Rules cleaned against the content: unknown difficulty → normal, unknown or repeated omens dropped. */
export function normalizeRules(r: Partial<WorldRules> | undefined): WorldRules {
  const difficulty = r?.difficulty && findDifficulty(r.difficulty) ? r.difficulty : DEFAULT_DIFFICULTY;
  const omens = [...new Set((r?.omens ?? []).filter((o) => !!findOmen(o)))];
  const ngPlus = Math.max(0, Math.floor(Number(r?.ngPlus) || 0));
  return { difficulty, omens, ngPlus };
}

/** Combined multipliers: difficulty × each Omen × (1 + cycles × NG+ step). */
export function combineMods(r: WorldRules): Modifiers {
  const out = { ...NEUTRAL_MODS };
  const apply = (mods: Partial<Modifiers> | undefined) => {
    for (const [k, v] of Object.entries(mods ?? {}) as [Modifier, number][]) out[k] *= v;
  };
  apply(findDifficulty(r.difficulty)?.mods);
  for (const o of r.omens) apply(findOmen(o)?.mods);
  if (r.ngPlus > 0 && data.ngPlus) for (const m of MODIFIERS) out[m] *= 1 + r.ngPlus * (data.ngPlus.perCycle[m] ?? 0);
  return out;
}

/** An enemy's stats under the modifiers (from its definition, so rescaling never compounds). Keeps the hp ratio. */
export function scaleEnemy(a: Actor, mods: Modifiers): void {
  const def = getEnemy(a.type);
  const ratio = a.stats.maxHp > 0 ? a.hp / a.stats.maxHp : 1;
  const s = { ...def.stats };
  s.maxHp = Math.max(1, Math.round(s.maxHp * mods.enemyHp));
  s.power *= mods.enemyDamage;
  s.speed *= mods.enemySpeed;
  a.baseStats = s;
  a.stats = { ...s };
  // A boss keeps its current phase's pace.
  const phase = def.boss?.phases[a.ai?.phase ?? 0];
  if (phase) a.stats.speed = s.speed * phase.speed;
  if (a.action.kind !== "dead") a.hp = Math.max(1, Math.round(s.maxHp * ratio));
}

/** Sets a world's rules and rescales the enemies already in it. */
export function applyRules(state: { rules: WorldRules; mods: Modifiers; actors: Record<string, Actor> }, rules: WorldRules): void {
  state.rules = normalizeRules(rules);
  state.mods = combineMods(state.rules);
  for (const a of Object.values(state.actors)) if (a.kind === "enemy") scaleEnemy(a, state.mods);
}

/** True when this progress has finished the story (NG+ is offered). */
export const ngPlusUnlocked = (flags: readonly string[]): boolean => !!data.ngPlus && flags.includes(data.ngPlus.unlockFlag);
