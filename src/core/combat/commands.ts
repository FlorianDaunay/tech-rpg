import type { Command } from "../sim/intent";
import { isAlive, type Actor } from "./actor";
import { findItem, isShield, isWeapon } from "./defs";
import { equip } from "./equipment";
import type { SimEvent } from "./events";
import { STAMINA } from "./moves";
import { applyStatus } from "./status";
import { chooseDialogue } from "../narrative/progress";
import { learnTalent, resetTalents } from "../progression/talents";
import { setLoadout } from "./skills";

const take = (a: Actor, item: string): boolean => {
  const n = a.bag[item] ?? 0;
  if (n < 1) return false;
  if (n === 1) delete a.bag[item];
  else a.bag[item] = n - 1;
  return true;
};
const give = (a: Actor, item: string) => (a.bag[item] = (a.bag[item] ?? 0) + 1);

/**
 * Applies a menu command. Everything is checked against the actor's own state (the host never
 * trusts a client: you can only equip or drink what is in your bag). Invalid commands are ignored.
 */
export function applyCommand(events: SimEvent[], a: Actor, cmd: Command, healing = 1): void {
  if (!isAlive(a)) return;
  // Trades involve two players: the sim routes them to core/trade.
  if (cmd.type === "trade" || cmd.type === "buy" || cmd.type === "sell" || cmd.type === "forge" || cmd.type === "build" || cmd.type === "danger" || cmd.type === "cosmetic") return;
  if (cmd.type === "dialogue") {
    if (a.progress) {
      const progress = a.progress;
      // The actor's own fields, so effects can also adopt a pet.
      const story = { id: a.id, bag: a.bag, progress, get pet() { return a.pet; }, set pet(v: string | null | undefined) { a.pet = v ?? null; } };
      chooseDialogue(events, story, cmd.dialogue, cmd.node, cmd.choice);
    }
    return;
  }
  if (cmd.type === "talent") return void learnTalent(events, a, cmd.talent);
  if (cmd.type === "respec") return resetTalents(events, a);
  if (cmd.type === "loadout") return void setLoadout(events, a, cmd.slot, cmd.skill);
  if (cmd.type === "equip") {
    const current = cmd.slot === "weapon" ? a.weapon : a.shield;
    if (cmd.item === current) return;
    if (cmd.item !== null) {
      const fits = cmd.slot === "weapon" ? isWeapon(cmd.item) : isShield(cmd.item);
      if (!fits || !take(a, cmd.item)) return;
    }
    if (current) give(a, current);
    if (cmd.slot === "weapon") equip(a, cmd.item, a.shield);
    else equip(a, a.weapon, cmd.item);
    events.push({ type: "equip", id: a.id, slot: cmd.slot, item: cmd.item });
    return;
  }
  const def = findItem(cmd.item);
  if (!def?.effect || def.kind !== "consumable") return;
  if (!take(a, cmd.item)) return;
  const heal = Math.min(Math.round((def.effect.heal ?? 0) * healing), a.stats.maxHp - a.hp);
  a.hp += heal;
  if (def.effect.stamina) a.stamina = Math.min(STAMINA.max, a.stamina + def.effect.stamina);
  if (def.effect.status) applyStatus(events, a, def.effect.status, a.id, a.stats.power);
  events.push({ type: "use", id: a.id, item: cmd.item, heal });
}
