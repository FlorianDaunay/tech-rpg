import { arps, chords, rep, seq } from "../compose";
import type { Song } from "../types";

/**
 * Ashen Graveyard — a slow requiem. A minor with a phrygian B♭, choir "ahh"/"ooh", a great bell tolling every
 * two bars, and the main theme on celesta transposed a fifth up, like a music box left on a grave.
 */
const A = ["Am", "F", "G", "Esus4", "Am", "F", "Dm", "E"];
const B = ["F", "C", "Dm", "Am", "A#", "F", "Dm", "E"];
const THEME = seq(
  "E5:6 . . . A5 . B5:6 .",
  "C6:8 . . . B5:6 . A5 .",
  "G5:7 . . . A5:5 . G5:5 .",
  "E5:7 . . . . . - -",
  "E5:6 . . . A5 . B5:6 .",
  "C6:8 . . . D6:6 . E6 .",
  "F6:8 . . . E6:6 . D6 .",
  "E6:8 . . . . . - -"
);
const LAMENT = seq(
  "A4 . . . C5 . . .",
  "G4 . . . . . E4 .",
  "F4 . . . A4 . . .",
  "E4 . . . . . . .",
  "D4 . . . F4 . . .",
  "C4 . . . . . F4 .",
  "A4 . . . F4 . D4 .",
  "E4 . . . . . . -"
);
const COMBAT = {
  taiko: "X - - - - - x - | X - - - x - x -",
  ost: "A2 A2:5 A2 A2:5 C3 C3:5 B2 B2:5",
  hb: "x - - - x - - -",
};

export const ashenGraveyard: Song = {
  id: "ashen-graveyard",
  title: "Requiem of Ash",
  bpm: 58,
  beatsPerBar: 4,
  key: "A minor (phrygian colour)",
  tracks: {
    choir: { instrument: "choir", layer: "pad", gain: 0.5, reverb: 0.7, params: { attack: 1.2, release: 2.5, vowel: "a" } },
    choirLow: { instrument: "choir", layer: "pad", gain: 0.35, reverb: 0.7, pan: -0.2, params: { attack: 1.5, release: 2.5, vowel: "u" } },
    bass: { instrument: "subBass", layer: "pad", gain: 0.5, params: { attack: 0.8, release: 2 } },
    toll: { instrument: "toll", layer: "pad", gain: 0.5, reverb: 0.8, pan: 0.25, humanize: 0 },
    celesta: { instrument: "celesta", layer: "melody", gain: 0.6, reverb: 0.6, delay: 0.2, humanize: 12, params: { release: 2, bright: 0.45 } },
    strings: { instrument: "strings", layer: "melody", gain: 0.5, reverb: 0.6, pan: -0.15, params: { attack: 0.5, release: 1.4, cutoff: 1600 } },
    harp: { instrument: "harp", layer: "melody", gain: 0.3, pan: 0.35, reverb: 0.5, humanize: 12 },
    frame: { instrument: "frame", layer: "perc", gain: 0.45, reverb: 0.5, params: { transpose: -7 } },
    taiko: { instrument: "taiko", layer: "combat", gain: 0.65, reverb: 0.45 },
    ost: { instrument: "strings", layer: "combat", gain: 0.42, reverb: 0.3, params: { attack: 0.02, release: 0.2, gate: 0.55, cutoff: 1500 } },
    hb: { instrument: "heartbeat", layer: "tension", gain: 0.7 },
  },
  sections: {
    intro: {
      bars: 2,
      tracks: {
        toll: "A2 - - - - - - - | - - - - - - - -",
        choirLow: chords(["Am", "Am"], 3),
        bass: "A1 | .",
      },
    },
    a: {
      bars: 8,
      tracks: {
        choir: chords(A, 4),
        choirLow: chords(A.map((c) => c.replace(/sus4$/, "")), 3),
        bass: "A1 | F1 | G1 | E1 | A1 | F1 | D1 | E1",
        toll: "A2:6 - - - - - - - | - - - - - - - -",
        celesta: THEME,
        frame: "x - - - - - - - | - - - - - - - -",
        ...COMBAT,
      },
    },
    b: {
      bars: 8,
      tracks: {
        choir: chords(B, 4),
        bass: "F1 | C2 | D1 | A1 | A#1 | F1 | D1 | E1",
        toll: "E2:5 - - - - - - - | - - - - - - - -",
        strings: LAMENT,
        harp: arps(B, 4, [0, 1, 2, 3, "-", "-", "-", "-"], 4),
        frame: "x - - - - - - - | - - - - - - - -",
        ...COMBAT,
      },
    },
    a2: {
      bars: 8,
      tracks: {
        choir: chords(A, 4),
        choirLow: chords(A.map((c) => c.replace(/sus4$/, "")), 3),
        bass: "A1 | F1 | G1 | E1 | A1 | F1 | D1 | E1",
        toll: "A2:6 - - - - - - - | - - - - - - - -",
        celesta: THEME,
        strings: rep("A3 . . . . . . . | . | . | G#3 . . . . . . .", 2),
        frame: "x - - - - - - - | - - - - - - - -",
        ...COMBAT,
      },
    },
  },
  arrangement: ["intro", "a", "b", "a2"],
  loopFrom: 1,
};
