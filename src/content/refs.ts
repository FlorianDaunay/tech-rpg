import { z } from "zod";

/** A cross-reference found in a content entry: `types` are the content types it may point to. */
export interface FoundRef {
  types: string[];
  id: string;
  path: string;
}

type JsonSchema = {
  ref?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  const?: unknown;
};

/**
 * Walks a value alongside the JSON Schema of its zod schema and collects every field marked
 * with `ref(...)` / `refAny(...)` metadata. Generic: new content types get reference checks for free.
 */
export function findRefs(schema: z.ZodType, value: unknown): FoundRef[] {
  const out: FoundRef[] = [];
  walk(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema, value, "", out);
  return out;
}

function walk(s: JsonSchema, v: unknown, path: string, out: FoundRef[]): void {
  if (v === undefined || v === null) return;
  if (s.ref && typeof v === "string") out.push({ types: s.ref.split(","), id: v, path });
  // Union variants: only the one whose discriminator (a `const` property) matches the value.
  for (const alt of [...(s.anyOf ?? []), ...(s.oneOf ?? [])]) if (fits(alt, v)) walk(alt, v, path, out);
  if (Array.isArray(v) && s.items) v.forEach((item, i) => walk(s.items!, item, `${path}[${i}]`, out));
  if (typeof v === "object" && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    for (const [k, sub] of Object.entries(s.properties ?? {})) walk(sub, obj[k], path ? `${path}.${k}` : k, out);
    if (typeof s.additionalProperties === "object")
      for (const [k, val] of Object.entries(obj)) if (!s.properties?.[k]) walk(s.additionalProperties, val, `${path}.${k}`, out);
  }
}

function fits(s: JsonSchema, v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return true;
  return Object.entries(s.properties ?? {}).every(([k, sub]) => sub.const === undefined || (v as Record<string, unknown>)[k] === sub.const);
}
