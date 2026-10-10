/** Registry of procedural generators. Each gets its own seeded rng (seed = generator name). */
import type { Generator } from "../types";
import { buildings } from "./buildings";
import { nature } from "./nature";
import { tiles } from "./tiles";
import { ui } from "./ui";
import { vfx } from "./vfx";

export const GENERATORS: Record<string, Generator> = {
  tiles,
  nature,
  buildings,
  vfx,
  ui,
};
