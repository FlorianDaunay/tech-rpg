import type { Command } from "../sim/intent";
import { isAlive, type Actor } from "./actor";
import { findItem, isShield, isWeapon } from "./defs";
import { equip } from "./equipment";
import type { SimEvent } from "./events";
import { STAMINA } from "./moves";
import { applyStatus } from "./status";

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
export function applyCommand(events: SimEvent[], a: Actor, cmd: Command): void {
  if (!isAlive(a)) return;
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
  const heal = Math.min(def.effect.heal ?? 0, a.stats.maxHp - a.hp);
  a.hp += heal;
  if (def.effect.stamina) a.stamina = Math.min(STAMINA.max, a.stamina + def.effect.stamina);
  if (def.effect.status) applyStatus(events, a, def.effect.status, a.id, a.stats.power);
  events.push({ type: "use", id: a.id, item: cmd.item, heal });
}
