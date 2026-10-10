import type { NarrativeData } from "@/core/narrative/defs";
import { content } from "./registry";

const byId = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((e) => [e.id, e]));

/** Narrative data for the rules (registered at boot next to the combat data). */
/** The player growth curve (registered at boot). */
export const playerProgression = () => content.progression.get("player");

export function narrativeData(): NarrativeData {
  return { quests: byId(content.quests.all()), dialogues: byId(content.dialogues.all()), npcs: byId(content.npcs.all()) };
}
