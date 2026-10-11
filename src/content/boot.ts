import { registerCombatData } from "@/core/combat/defs";
import { registerNarrativeData } from "@/core/narrative/defs";
import { registerProgression } from "@/core/progression/level";
import { registerRules } from "@/core/sim/rules";
import { content } from "./registry";
import { combatData } from "./combat";
import { narrativeData, playerProgression } from "./narrative";

let done = false;

/**
 * Hands the content to the rules in core (core never imports content). Idempotent: the game calls it
 * at boot, and anything that runs core rules earlier (reading saves on the title screen) calls it too.
 */
export function registerContent(): void {
  if (done) return;
  done = true;
  registerCombatData(combatData());
  registerNarrativeData(narrativeData());
  registerProgression(playerProgression());
  const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((e) => [e.id, e]));
  registerRules({ difficulties: byId(content.difficulties.all()), omens: byId(content.omens.all()), ngPlus: playerProgression().ngPlus });
}
