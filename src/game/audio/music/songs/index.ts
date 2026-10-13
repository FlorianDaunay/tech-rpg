import type { Song } from "../types";
import { ashenGraveyard } from "./ashen-graveyard";
import { boss } from "./boss";
import { cinderhold } from "./cinderhold";
import { deepMines } from "./deep-mines";
import { fallenCitadel } from "./fallen-citadel";
import { frostfellReach } from "./frostfell-reach";
import { hollowRift } from "./hollow-rift";
import { defeat, victory } from "./stings";
import { title } from "./title";
import { whisperingWilds } from "./whispering-wilds";

const ALL = [title, cinderhold, whisperingWilds, ashenGraveyard, deepMines, fallenCitadel, hollowRift, frostfellReach, boss, victory, defeat];

export const SONGS: Record<string, Song> = Object.fromEntries(ALL.map((s) => [s.id, s]));
export const SONG_IDS = ALL.map((s) => s.id);

/** Zone id → song id. Zones not listed use the song with the same id. Procedural rifts share the rift theme. */
export const ZONE_SONGS: Record<string, string> = {
  hub: "cinderhold",
  rift: "hollow-rift",
  "daily-rift": "hollow-rift",
  "goblin-warren": "deep-mines",
};
