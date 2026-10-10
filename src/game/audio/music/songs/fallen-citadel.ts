import { arps, bassline, chords, seq } from "../compose";
import type { Song } from "../types";

/**
 * Fallen Citadel — martial lament. C minor, taiko march, string ostinato, a horn carrying the main theme
 * (G–C–D–E♭) as a call to arms for a fallen order.
 */
const A = ["Cm", "G#", "D#", "A#", "Cm", "G#", "Fm", "G"];
const B = ["G#", "D#", "A#", "Cm", "G#", "D#", "Fm", "G"];
const ROOTS_A = ["C2", "G#1", "D#2", "A#1", "C2", "G#1", "F1", "G1"];
const ROOTS_B = ["G#1", "D#2", "A#1", "C2", "G#1", "D#2", "F1", "G1"];

const HORN_A = seq(
  "G4:7 . . . C5 . D5:6 .",
  "D#5:9 . . . . . D5:6 C5",
  "A#4:8 . . . . . C5:6 D5",
  "A#4:7 . . . . . - -",
  "G4:7 . . . C5 . D5:6 .",
  "D#5:9 . . . F5:7 . G5 .",
  "G#5:9 . . . G5:7 . F5 .",
  "G5:8 . . . . . - -"
);
const STR_B = seq(
  "C6:8 . . . A#5:6 . G#5 .",
  "G5:8 . . . . . D#5:6 .",
  "F5:7 . . . D5:6 . A#4 .",
  "C5:7 . . . . . . .",
  "C6:8 . . . A#5:6 . G#5 .",
  "G5:8 . . . A#5:6 . C6 .",
  "C6:9 . . . G#5:6 . F5 .",
  "G5:8 . . . . . - -"
);
const OST = [0, 2, 1, 2, 0, 2, 1, 2] as const;
const PERC = {
  taiko: "X - - - x - - - | X - - - x - x -",
  snare: "- - - - x - - g | - - - - x - g g",
  frame: "- - x - - - x - | - - x - - x - -",
};
const COMBAT = {
  roll: "g g g g x g g g g g g g x g X g",
  ctaiko: "- - x - - - x x | - - x - - x x x:9",
};

export const fallenCitadel: Song = {
  id: "fallen-citadel",
  title: "Banners in Ash",
  bpm: 100,
  beatsPerBar: 4,
  key: "C minor",
  tracks: {
    choir: { instrument: "choir", layer: "pad", gain: 0.4, reverb: 0.6, params: { vowel: "o", attack: 0.8, release: 1.6 } },
    ost: { instrument: "strings", layer: "pad", gain: 0.38, pan: 0.2, reverb: 0.3, humanize: 4, params: { attack: 0.015, release: 0.12, gate: 0.55, cutoff: 1900 } },
    bass: { instrument: "bass", layer: "pad", gain: 0.5, params: { cutoff: 380 } },
    horn: { instrument: "horn", layer: "melody", gain: 0.55, pan: -0.15, reverb: 0.5, humanize: 6 },
    strings: { instrument: "strings", layer: "melody", gain: 0.5, pan: 0.1, reverb: 0.5, params: { attack: 0.12, release: 0.8 } },
    taiko: { instrument: "taiko", layer: "perc", gain: 0.6, reverb: 0.4, humanize: 5 },
    snare: { instrument: "snare", layer: "perc", gain: 0.35, pan: 0.15, reverb: 0.3, humanize: 5, velJitter: 0.2 },
    frame: { instrument: "frame", layer: "perc", gain: 0.35, pan: -0.25, reverb: 0.3, humanize: 6 },
    roll: { instrument: "snare", layer: "combat", gain: 0.3, pan: -0.1, reverb: 0.25, humanize: 3, velJitter: 0.2 },
    ctaiko: { instrument: "taiko", layer: "combat", gain: 0.55, reverb: 0.35, params: { transpose: 5 } },
    hb: { instrument: "heartbeat", layer: "tension", gain: 0.7 },
  },
  sections: {
    intro: {
      bars: 2,
      tracks: {
        taiko: "X - - - - - - - | X - - - x - x x",
        horn: "G3:7 . . . C4:8 . . . | G3:7 . . . . . - -",
        bass: "C2 | .",
      },
    },
    a: {
      bars: 8,
      tracks: {
        choir: chords(A, 3),
        ost: arps(A, 3, [...OST], 6),
        bass: bassline(ROOTS_A, "x . . . x . x ."),
        horn: HORN_A,
        ...PERC,
        ...COMBAT,
        hb: "x - - - x - - -",
      },
    },
    b: {
      bars: 8,
      tracks: {
        choir: chords(B, 4),
        ost: arps(B, 3, [...OST], 6),
        bass: bassline(ROOTS_B, "x . . . x . x ."),
        strings: STR_B,
        horn: seq("G#3:6 . . . . . . .", "G3:6 . . . . . . .", "F3:6 . . . . . . .", "G3:6 . . . . . . ."),
        ...PERC,
        ...COMBAT,
        hb: "x - - - x - - -",
      },
    },
    c: {
      bars: 8,
      tracks: {
        choir: chords(["Cm", "Cm", "G#", "G#", "Fm", "Fm", "G", "G"], 3),
        bass: "C2 | . | G#1 | . | F1 | . | G1 | .",
        horn: seq("G4:5 . . . C5 . D5 .", "D#5:6 . . . . . . .", "C5:5 . . . . . . .", "- - - - - - - -", "C5:5 . . . F5 . G5 .", "G#5:6 . . . . . . .", "G5:6 . . . . . . .", "- - - - - - - -"),
        taiko: "X - - - - - - - | - - - - - - - -",
        ...COMBAT,
        hb: "x - - - x - - -",
      },
    },
    a2: {
      bars: 8,
      tracks: {
        choir: chords(A, 4),
        ost: arps(A, 3, [...OST], 7),
        bass: bassline(ROOTS_A, "x . . x x . x ."),
        horn: HORN_A,
        strings: seq("G5:6 . . . . . . .", "D#5:6 . . . . . . .", "D#5:6 . . . . . . .", "D5:6 . . . . . . .", "D#5:6 . . . . . . .", "C5:6 . . . . . . .", "C5:6 . . . . . . .", "B4:6 . . . . . - -"),
        ...PERC,
        ...COMBAT,
        hb: "x - - - x - - -",
      },
    },
  },
  arrangement: ["intro", "a", "b", "c", "a2"],
  loopFrom: 1,
};
