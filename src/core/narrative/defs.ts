/**
 * Narrative data the rules need (quests, dialogue, NPCs), as plain interfaces. Content JSON
 * satisfies them; the game registers them at boot like the combat data. Core never imports content.
 */

export type QuestState = "none" | "active" | "ready" | "done";

export type Objective =
  | { id: string; kind: "kill"; enemy: string; count: number }
  | { id: string; kind: "collect"; item: string; count: number }
  | { id: string; kind: "talk"; npc: string }
  | { id: string; kind: "reach"; map: string };

export interface QuestDef {
  id: string;
  type: "main" | "side" | "bounty";
  objectives: Objective[];
  rewards: { gold: number; items: { item: string; count: number }[] };
  /** Collect objectives' items are handed over on turn-in. */
  consumeItems: boolean;
  /** Started automatically when this one completes. */
  next?: string;
}

export type Condition =
  | { quest: string; is: QuestState | QuestState[] }
  | { flag: string; set: boolean }
  | { item: string; count: number };

export type Effect =
  | { startQuest: string }
  | { completeQuest: string }
  | { setFlag: string }
  | { clearFlag: string }
  | { give: string; count: number }
  | { take: string; count: number };

export interface DialogueChoice {
  if: Condition[];
  do: Effect[];
  /** Node to go to, or absent to end the conversation. */
  next?: string;
}

export interface DialogueNode {
  /** Choices shown; a node without choices continues to `next` (or ends). */
  choices: DialogueChoice[];
  next?: string;
}

export interface DialogueDef {
  id: string;
  /** First entry whose conditions hold picks the opening node (quest-aware greetings). */
  entries: { if: Condition[]; node: string }[];
  start: string;
  nodes: Record<string, DialogueNode>;
}

export interface NpcDef {
  id: string;
  look: string;
  dialogue: string;
  /** Idle wander radius around the spawn (px); 0 = stands still. */
  wander: number;
}

export interface NarrativeData {
  quests: Record<string, QuestDef>;
  dialogues: Record<string, DialogueDef>;
  npcs: Record<string, NpcDef>;
}

let data: NarrativeData = { quests: {}, dialogues: {}, npcs: {} };
export const registerNarrativeData = (d: NarrativeData) => void (data = d);
export const findQuest = (id: string): QuestDef | undefined => data.quests[id];
export const findDialogue = (id: string): DialogueDef | undefined => data.dialogues[id];
export const findNpc = (id: string): NpcDef | undefined => data.npcs[id];
export const allQuests = (): QuestDef[] => Object.values(data.quests);
