import type { z } from "zod";
import { LoreSchema } from "./schemas/lore";
import { MapSchema } from "./schemas/map";

/**
 * Every content type: its schema and its JSON files (one entry per file, `data/<type>/<id>.json`).
 * Files are bundled at build time and validated when first accessed. See content-type-recipe skill.
 */
const sources = {
  map: { schema: MapSchema, files: import.meta.glob("./data/maps/*.json", { eager: true, import: "default" }) },
  lore: { schema: LoreSchema, files: import.meta.glob("./data/lore/*.json", { eager: true, import: "default" }) },
} as const;

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
  maps: collection("map"),
  lore: collection("lore"),
};

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
