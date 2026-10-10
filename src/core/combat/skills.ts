import type { Actor } from "./actor";
import { allSkills, findSkill, SKILL_SLOTS, type SkillSlot } from "./defs";
import type { SimEvent } from "./events";

const cooldownKey = (skill: string) => `skill:${skill}`;

/** Seconds left before the skill can be used again. */
export const skillCooldown = (a: Actor, skill: string) => a.cooldowns[cooldownKey(skill)] ?? 0;

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
 * On success: cooldown, gauge spent for ultimates, `skill` event.
 */
export function castSkill(events: SimEvent[], a: Actor, slot: SkillSlot, start: (move: string) => boolean): boolean {
  if (skillBlocker(a, slot)) return false;
  const def = findSkill(a.loadout[slot]!)!;
  if (!start(def.move)) return false;
  a.cooldowns[cooldownKey(def.id)] = def.cooldown;
  if (def.kind === "ultimate") a.ultCharge = 0;
  events.push({ type: "skill", id: a.id, skill: def.id, slot });
  return true;
}

/** Damage dealt fills the gauge (capped at the equipped ultimate's need). */
export function chargeUltimate(a: Actor, damage: number, move?: string): void {
  const ult = a.loadout.ultimate ? findSkill(a.loadout.ultimate) : undefined;
  // The ultimate's own hits don't refill the gauge they just spent.
  if (!ult || move === ult.move) return;
  a.ultCharge = Math.min(ult.charge, a.ultCharge + damage);
}

/**
 * Fills empty slots with skills unlocked at the actor's level (lowest unlock level first). Slots
 * already set are kept: choosing skills is the player's call (loadout screen / talents).
 * Emits `skill-unlocked` for skills that became available at this level.
 */
export function refreshLoadout(events: SimEvent[] | null, a: Actor, previousLevel = a.level): void {
  const unlocked = allSkills()
    .filter((s) => s.unlockLevel <= a.level)
    .sort((x, y) => x.unlockLevel - y.unlockLevel || x.id.localeCompare(y.id));
  if (events) for (const s of unlocked) if (s.unlockLevel > previousLevel) events.push({ type: "skill-unlocked", id: a.id, skill: s.id });
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
