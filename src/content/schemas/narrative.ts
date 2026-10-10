import { z } from "zod";
import type { DialogueDef, NpcDef, QuestDef } from "@/core/narrative/defs";
import { AssetKey, Id, LocalizedText, ref, refAny } from "./common";

/**
 * Narrative content: NPCs, dialogue trees, quests. Conditions and effects are small tagged objects
 * the rules in `core/narrative` evaluate; refs are validated like every other content reference.
 */

const QUEST_STATES = ["none", "active", "ready", "done"] as const;
const ItemRef = refAny(["item", "sword", "shield"]);

export const ConditionSchema = z
  .union([
    z.object({ quest: ref("quest"), is: z.union([z.enum(QUEST_STATES), z.array(z.enum(QUEST_STATES))]) }).strict(),
    z.object({ flag: z.string(), set: z.boolean() }).strict(),
    z.object({ item: ItemRef, count: z.number().int().min(1) }).strict(),
  ])
  .describe("Condition");

export const EffectSchema = z
  .union([
    z.object({ startQuest: ref("quest") }).strict(),
    z.object({ completeQuest: ref("quest") }).strict(),
    z.object({ setFlag: z.string() }).strict(),
    z.object({ clearFlag: z.string() }).strict(),
    z.object({ give: ItemRef, count: z.number().int().min(1) }).strict(),
    z.object({ take: ItemRef, count: z.number().int().min(1) }).strict(),
  ])
  .describe("Effect");

export const NpcSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    title: LocalizedText.optional().describe("Shown under the name (role)"),
    description: LocalizedText.describe("Codex entry"),
    look: AssetKey.describe("Character sheet (3×4 Pipoya layout)"),
    dialogue: ref("dialogue"),
    wander: z.number().nonnegative().default(24).describe("Idle stroll radius (px), 0 = stands still"),
  })
  .describe("NPC");

const ChoiceSchema = z.object({
  text: LocalizedText,
  if: z.array(ConditionSchema).default([]),
  do: z.array(EffectSchema).default([]),
  next: z.string().optional().describe("Node id; empty ends the conversation"),
});

const NodeSchema = z.object({
  speaker: z.enum(["npc", "player"]).default("npc"),
  text: LocalizedText,
  choices: z.array(ChoiceSchema).default([]).describe("None = one 'continue' to next (or end)"),
  next: z.string().optional(),
});

export const DialogueSchema = z
  .object({
    id: Id,
    entries: z.array(z.object({ if: z.array(ConditionSchema), node: z.string() })).default([]).describe("First match picks the opening node"),
    start: z.string().describe("Opening node when no entry matches"),
    nodes: z.record(z.string(), NodeSchema),
  })
  .superRefine((d, ctx) => {
    const has = (n: string | undefined, where: string) => n === undefined || d.nodes[n] || ctx.addIssue({ code: "custom", message: `${where}: unknown node "${n}"` });
    has(d.start, "start");
    d.entries.forEach((e, i) => has(e.node, `entries[${i}]`));
    for (const [id, n] of Object.entries(d.nodes)) {
      has(n.next, `node ${id}.next`);
      n.choices.forEach((c, i) => has(c.next, `node ${id}.choices[${i}].next`));
    }
  })
  .describe("Dialogue");

const ObjectiveSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("kill"), enemy: ref("enemy"), count: z.number().int().min(1), text: LocalizedText }),
  z.object({ id: z.string(), kind: z.literal("collect"), item: ItemRef, count: z.number().int().min(1), text: LocalizedText }),
  z.object({ id: z.string(), kind: z.literal("talk"), npc: ref("npc"), text: LocalizedText }),
  z.object({ id: z.string(), kind: z.literal("reach"), map: ref("map"), text: LocalizedText }),
]);

export const QuestSchema = z
  .object({
    id: Id,
    title: LocalizedText,
    summary: LocalizedText.describe("Journal description"),
    type: z.enum(["main", "side", "bounty"]),
    giver: ref("npc").optional(),
    objectives: z.array(ObjectiveSchema).min(1),
    rewards: z.object({ gold: z.number().int().nonnegative().default(0), xp: z.number().int().nonnegative().default(0).describe("Experience granted on turn-in"), items: z.array(z.object({ item: ItemRef, count: z.number().int().min(1).default(1) })).default([]) }).default({ gold: 0, xp: 0, items: [] }),
    consumeItems: z.boolean().default(true).describe("Collected items are handed over on turn-in"),
    next: ref("quest").optional().describe("Starts when this one completes"),
  })
  .refine((q) => new Set(q.objectives.map((o) => o.id)).size === q.objectives.length, "objective ids must be unique")
  .describe("Quest");

export type NpcContent = z.infer<typeof NpcSchema>;
export type DialogueContent = z.infer<typeof DialogueSchema>;
export type QuestContent = z.infer<typeof QuestSchema>;

type Assert<T extends true> = T;
type Fits<A, B> = A extends B ? true : false;
export type _Contracts = [Assert<Fits<NpcContent, NpcDef>>, Assert<Fits<DialogueContent, DialogueDef>>, Assert<Fits<QuestContent, QuestDef>>];
