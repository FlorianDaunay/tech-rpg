import type { z } from "zod";
import { EnemySchema, ItemSchema, LootTableSchema, MoveSchema, ReactionSchema, ShieldSchema, StatusSchema, SwordSchema } from "./schemas/combat";
import { LoreSchema } from "./schemas/lore";
import { MapSchema } from "./schemas/map";
import { DialogueSchema, NpcSchema, QuestSchema } from "./schemas/narrative";
import { ZoneSchema } from "./schemas/zone";

/**
 * Every content type: its schema and its JSON files (one entry per file, `data/<type>/<id>.json`).
 * Files are bundled at build time and validated when first accessed. See content-type-recipe skill.
 */
const sources = {
  zone: { schema: ZoneSchema, folder: "zones", files: import.meta.glob("./data/zones/*.json", { eager: true, import: "default" }) },
  map: { schema: MapSchema, folder: "maps", files: import.meta.glob("./data/maps/*.json", { eager: true, import: "default" }) },
  lore: { schema: LoreSchema, folder: "lore", files: import.meta.glob("./data/lore/*.json", { eager: true, import: "default" }) },
  move: { schema: MoveSchema, folder: "moves", files: import.meta.glob("./data/moves/*.json", { eager: true, import: "default" }) },
  enemy: { schema: EnemySchema, folder: "enemies", files: import.meta.glob("./data/enemies/*.json", { eager: true, import: "default" }) },
  status: { schema: StatusSchema, folder: "statuses", files: import.meta.glob("./data/statuses/*.json", { eager: true, import: "default" }) },
  reaction: { schema: ReactionSchema, folder: "reactions", files: import.meta.glob("./data/reactions/*.json", { eager: true, import: "default" }) },
  sword: { schema: SwordSchema, folder: "swords", files: import.meta.glob("./data/swords/*.json", { eager: true, import: "default" }) },
  shield: { schema: ShieldSchema, folder: "shields", files: import.meta.glob("./data/shields/*.json", { eager: true, import: "default" }) },
  item: { schema: ItemSchema, folder: "items", files: import.meta.glob("./data/items/*.json", { eager: true, import: "default" }) },
  npc: { schema: NpcSchema, folder: "npcs", files: import.meta.glob("./data/npcs/*.json", { eager: true, import: "default" }) },
  dialogue: { schema: DialogueSchema, folder: "dialogues", files: import.meta.glob("./data/dialogues/*.json", { eager: true, import: "default" }) },
  quest: { schema: QuestSchema, folder: "quests", files: import.meta.glob("./data/quests/*.json", { eager: true, import: "default" }) },
  loot: { schema: LootTableSchema, folder: "loot", files: import.meta.glob("./data/loot/*.json", { eager: true, import: "default" }) },
} as const;

/** Folder under `src/content/data/` per content type (admin write path). */
export const folders = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.folder])) as Record<ContentType, string>;

/** Schemas by content type (admin forms, reference checks). */
export const schemas = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.schema])) as { [K in ContentType]: (typeof sources)[K]["schema"] };

export type ContentType = keyof typeof sources;
type EntryOf<T extends ContentType> = z.infer<(typeof sources)[T]["schema"]>;

export interface Collection<T> {
  get(id: string): T;
  find(id: string): T | undefined;
  all(): T[];
}

const cache = new Map<ContentType, Map<string, unknown>>();

function load<T extends ContentType>(type: T): Map<string, EntryOf<T>> {
  const hit = cache.get(type);
  if (hit) return hit as Map<string, EntryOf<T>>;
  const { schema, files } = sources[type];
  const entries = new Map<string, EntryOf<T>>();
  for (const [path, raw] of Object.entries(files)) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error(`Invalid ${type} in ${path}:\n${parsed.error.message}`);
    const entry = parsed.data as EntryOf<T>;
    const id = (entry as { id: string }).id;
    const fileId = path.split("/").pop()!.replace(/\.json$/, "");
    if (fileId !== id) throw new Error(`${type} file ${path} must be named after its id "${id}"`);
    if (entries.has(id)) throw new Error(`Duplicate ${type} id "${id}" (${path})`);
    entries.set(id, entry);
  }
  cache.set(type, entries);
  return entries;
}

function collection<T extends ContentType>(type: T): Collection<EntryOf<T>> {
  return {
    get: (id) => {
      const entry = load(type).get(id);
      if (!entry) throw new Error(`Unknown ${type} "${id}"`);
      return entry;
    },
    find: (id) => load(type).get(id),
    all: () => [...load(type).values()],
  };
}

export const content = {
  zones: collection("zone"),
  maps: collection("map"),
  lore: collection("lore"),
  moves: collection("move"),
  enemies: collection("enemy"),
  statuses: collection("status"),
  reactions: collection("reaction"),
  swords: collection("sword"),
  shields: collection("shield"),
  items: collection("item"),
  loot: collection("loot"),
  npcs: collection("npc"),
  dialogues: collection("dialogue"),
  quests: collection("quest"),
};

/** Ids of every entry of a type (reference checks). */
export const idsOf = (type: ContentType): Set<string> => new Set(load(type).keys());

/** Validates everything eagerly (tests, `npm run content:check`). Returns error messages. */
export function validateAllContent(): string[] {
  const errors: string[] = [];
  for (const type of Object.keys(sources) as ContentType[]) {
    try {
      load(type);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return errors;
}
