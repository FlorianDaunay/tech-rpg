import { z } from "zod";

/** Stable content id: kebab-case, used in saves and cross-references. */
export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case id");

/** Player-visible text. English is required; other languages fall back to it. */
export const LocalizedText = z.object({ en: z.string().min(1), fr: z.string().optional() }).describe("Localized text");
export type LocalizedText = z.infer<typeof LocalizedText>;

/**
 * Reference to another content entry. The registry checks it exists; the admin renders a picker.
 * The target type is stored in the schema metadata.
 */
export const ref = (type: string) => Id.meta({ ref: type }).describe(`Reference to a ${type}`);
