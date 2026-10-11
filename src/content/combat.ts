import type { CombatData } from "@/core/combat/defs";
import { content } from "./registry";
import { playerProgression } from "./narrative";

const byId = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((e) => [e.id, e]));

/** Builds the data the combat rules read (core never imports content: the game registers this at boot). */
export function combatData(): CombatData {
  return {
    moves: byId(content.moves.all()),
    enemies: byId(content.enemies.all()),
    statuses: byId(content.statuses.all()),
    reactions: content.reactions.all(),
    weapons: byId(content.swords.all()),
    shields: byId(content.shields.all()),
    loot: byId(content.loot.all()),
    items: byId(content.items.all()),
    skills: byId(content.skills.all()),
    talents: byId(content.talents.all()),
    affixes: byId(content.affixes.all()),
    pets: byId(content.pets.all()),
    sets: byId(content.sets.all()),
    affixCount: playerProgression().affixesByRarity,
  };
}
