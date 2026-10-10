import { z } from "zod";
import { Id, LocalizedText } from "./common";

export const LORE_CATEGORIES = ["world", "history", "faction", "place", "herald", "people", "relic"] as const;

/** A codex/lore page. Bodies are light markdown (paragraphs, *italics*, **bold**). */
export const LoreSchema = z
  .object({
    id: Id,
    category: z.enum(LORE_CATEGORIES),
    title: LocalizedText,
    /** One line shown in lists and tooltips. */
    summary: LocalizedText,
    body: LocalizedText,
    /** Ordering inside its category. */
    order: z.number().int().default(0),
    /**
     * When the codex reveals it: "start" (known from the beginning) or a flag id set by quests,
     * kills or discoveries. Spoilers (the true history, endings) stay hidden until then.
     */
    unlock: z.string().default("start"),
    /** Spoiler: never shown on the public showcase, only in the admin. */
    secret: z.boolean().default(false),
    /** Optional illustration asset key. */
    image: z.string().optional(),
  })
  .describe("Lore entry");

export type LoreEntry = z.infer<typeof LoreSchema>;
