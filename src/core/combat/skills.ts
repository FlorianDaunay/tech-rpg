import type { Actor } from "./actor";
import { allSkills, allTalents, findSkill, findTalent, SKILL_SLOTS, type SkillDef, type SkillSlot } from "./defs";
import type { SimEvent } from "./events";

const cooldownKey = (skill: string) => `skill:${skill}`;
/** Talents can't shorten cooldowns by more than this. */
const MAX_COOLDOWN_CUT = 0.5;

/** Seconds left before the skill can be used again. */
export const skillCooldown = (a: Actor, skill: string) => a.cooldowns[cooldownKey(skill)] ?? 0;

/** Skill modifiers from learned talents. */
export function talentMods(a: Actor): { cooldown: number; ultGain: number } {
  let cooldown = 0;
  let ultGain = 0;
  for (const [id, rank] of Object.entries(a.talents)) {
    const def = findTalent(id);
    if (!def) continue;
    cooldown += def.cooldown * rank;
    ultGain += def.ultGain * rank;
  }
  return { cooldown: Math.min(MAX_COOLDOWN_CUT, cooldown), ultGain };
}

/** Unlocked by level, or early by a learned talent. */
export const isSkillUnlocked = (a: Actor, s: SkillDef) => s.unlockLevel <= a.level || allTalents().some((t) => t.skill === s.id && (a.talents[t.id] ?? 0) > 0);

/** Ids of every skill the actor may slot. */
export const unlockedSkills = (a: Actor): string[] => allSkills().filter((s) => isSkillUnlocked(a, s)).map((s) => s.id);

/** 0..1 fill of the Ember gauge for the equipped ultimate (0 without one). */
export function ultimateFill(a: Actor): number {
  const ult = a.loadout.ultimate ? findSkill(a.loadout.ultimate) : undefined;
  return ult ? Math.min(1, a.ultCharge / Math.max(1, ult.charge)) : 0;
}

/** Why a slot can't be used right now (null = ready). */
export function skillBlocker(a: Actor, slot: SkillSlot): "empty" | "cooldown" | "charge" | null {
  const id = a.loadout[slot];
  const def = id ? findSkill(id) : undefined;
  if (!def) return "empty";
  if (skillCooldown(a, def.id) > 0) return "cooldown";
  if (def.kind === "ultimate" && a.ultCharge < def.charge) return "charge";
  return null;
}

/**
 * Uses the skill in `slot` through `start` (the sim's attack starter, which spends stamina).
 * On success: cooldown (shortened by talents), gauge spent for ultimates, `skill` event.
 */
export function castSkill(events: SimEvent[], a: Actor, slot: SkillSlot, start: (move: string) => boolean): boolean {
  if (skillBlocker(a, slot)) return false;
  const def = findSkill(a.loadout[slot]!)!;
  if (!start(def.move)) return false;
  a.cooldowns[cooldownKey(def.id)] = def.cooldown * (1 - talentMods(a).cooldown);
  if (def.kind === "ultimate") a.ultCharge = 0;
  events.push({ type: "skill", id: a.id, skill: def.id, slot });
  return true;
}

/** Damage dealt fills the gauge (talents speed it up; capped at the equipped ultimate's need). */
export function chargeUltimate(a: Actor, damage: number, move?: string): void {
  const ult = a.loadout.ultimate ? findSkill(a.loadout.ultimate) : undefined;
  // The ultimate's own hits don't refill the gauge they just spent.
  if (!ult || move === ult.move) return;
  a.ultCharge = Math.min(ult.charge, a.ultCharge + damage * (1 + talentMods(a).ultGain));
}

/**
 * Keeps the loadout valid and filled: slots holding a skill no longer unlocked (talent refund) are
 * cleared, then empty slots take unlocked skills (lowest unlock level first). Slots already set are
 * kept: choosing is the player's call. With `before` (unlocked ids before the change), announces
 * newly unlocked skills.
 */
export function refreshLoadout(events: SimEvent[] | null, a: Actor, before?: string[]): void {
  const unlocked = allSkills()
    .filter((s) => isSkillUnlocked(a, s))
    .sort((x, y) => x.unlockLevel - y.unlockLevel || x.id.localeCompare(y.id));
  if (events && before) for (const s of unlocked) if (!before.includes(s.id)) events.push({ type: "skill-unlocked", id: a.id, skill: s.id });
  const ok = new Set(unlocked.map((s) => s.id));
  for (const slot of SKILL_SLOTS) if (a.loadout[slot] && !ok.has(a.loadout[slot]!)) a.loadout[slot] = null;
  const used = new Set(Object.values(a.loadout));
  for (const slot of SKILL_SLOTS) {
    if (a.loadout[slot]) continue;
    const kind = slot === "ultimate" ? "ultimate" : "skill";
    const next = unlocked.find((s) => s.kind === kind && !used.has(s.id));
    if (next) {
      a.loadout[slot] = next.id;
      used.add(next.id);
    }
  }
}

/** Puts an unlocked skill in a slot of its kind; if it sat in the other slot, the two swap. */
export function setLoadout(events: SimEvent[], a: Actor, slot: SkillSlot, skill: string): boolean {
  const def = findSkill(skill);
  if (!def || !isSkillUnlocked(a, def) || (slot === "ultimate") !== (def.kind === "ultimate")) return false;
  if (a.loadout[slot] === skill) return false;
  const other = SKILL_SLOTS.find((s) => s !== slot && a.loadout[s] === skill);
  if (other) a.loadout[other] = a.loadout[slot];
  a.loadout[slot] = skill;
  events.push({ type: "loadout", id: a.id, slot, skill });
  return true;
}
