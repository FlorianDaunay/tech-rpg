import { chords, seq } from "../compose";
import type { Song } from "../types";

/**
 * Frostfell Reach — D aeolian. Wind-chime celesta falling like snow over a hollow drone, a slow
 * string lament (D–F–E–C → A–Bb–A), and a bell tolling once a phrase for the frozen dead.
 */
const A = ["Dm", "Bb", "F", "C", "Dm", "Bb", "Gm", "A"];
const THEME = seq(
  "D4:6 . . . F4 . E4:6 .",
  "C4:7 . . . . . - -",
  "A3:6 . . . Bb3 . A3:5 .",
  "F3:6 . . . G3 . A3:6 .",
  "D4:6 . . . F4 . G4:6 .",
  "A4:8 . . . G4:6 . F4 .",
  "E4:7 . . . F4:6 . D4 .",
  "C#4:7 . . . . . - -"
);
const FLAKES = "A5:3 - - - - - F6:2 - | - - - D6:3 - - - - | - E6:2 - - - - - - | - - - - C6:3 - - -";
const BELL = "D4:5 - - - - - - - | - - - - - - - - | - - - - - - - - | - - - - - - - -";
const COMBAT = {
  taiko: "X - - x - - X - | X - - x X - x -",
  kick: "x - - - x - x -",
  ost: "D1 D1:5 D1 F1:5 D1 D1:5 C1 A0:5",
};

export const frostfellReach: Song = {
  id: "frostfell-reach",
  title: "Where the Snow Remembers",
  bpm: 76,
  beatsPerBar: 4,
  key: "D aeolian",
  tracks: {
    drone: { instrument: "drone", layer: "pad", gain: 0.5, reverb: 0.6, params: { cutoff: 320, attack: 3, release: 4 } },
    pad: { instrument: "pad", layer: "pad", gain: 0.32, reverb: 0.65, params: { cutoff: 900, attack: 2.5, release: 3, detune: 8 } },
    flakes: { instrument: "celesta", layer: "melody", gain: 0.38, pan: 0.3, reverb: 0.75, delay: 0.4, humanize: 40, params: { release: 1.4, bright: 0.35 } },
    bell: { instrument: "metal", layer: "perc", gain: 0.3, pan: -0.25, reverb: 0.7, delay: 0.3 },
    hat: { instrument: "hat", layer: "perc", gain: 0.2, pan: 0.2, humanize: 8, velJitter: 0.35 },
    strings: { instrument: "strings", layer: "melody", gain: 0.5, reverb: 0.6, params: { attack: 0.5, release: 1.4, cutoff: 1300 } },
    horn: { instrument: "horn", layer: "melody", gain: 0.4, reverb: 0.6, params: { bright: 0.35, release: 1 } },
    taiko: { instrument: "taiko", layer: "combat", gain: 0.6, reverb: 0.4 },
    kick: { instrument: "kick", layer: "combat", gain: 0.45 },
    ost: { instrument: "bass", layer: "combat", gain: 0.5, params: { cutoff: 450, gate: 0.6 } },
    hb: { instrument: "heartbeat", layer: "tension", gain: 0.7 },
    tbell: { instrument: "metal", layer: "tension", gain: 0.22, reverb: 0.7, delay: 0.4 },
  },
  sections: {
    intro: {
      bars: 4,
      tracks: {
        drone: "D1 | . | . | .",
        flakes: FLAKES,
        bell: BELL,
      },
    },
    a: {
      bars: 8,
      tracks: {
        drone: "D1 | . | . | . | . | . | . | .",
        pad: chords(A, 3),
        flakes: FLAKES,
        bell: BELL,
        hat: "- - - - g - - - | - - - - g - - g",
        ...COMBAT,
        hb: "x - - - x - - -",
        tbell: "- - - - - - - - | - - - - - - Eb6:3 -",
      },
    },
    b: {
      bars: 8,
      tracks: {
        drone: "D1 | . | . | . | . | . | . | .",
        pad: chords(A, 3),
        flakes: FLAKES,
        hat: "- - - - g - - - | - - - - g - - g",
        strings: THEME,
        ...COMBAT,
        hb: "x - - - x - - -",
        tbell: "- - - - - - - - | - - - - - - Eb6:3 -",
      },
    },
    c: {
      bars: 8,
      tracks: {
        drone: "D1 | . | . | . | . | . | . | .",
        pad: chords(["Gm", "Gm", "Dm", "Dm", "Bb", "Bb", "A", "A"], 2),
        flakes: "D6:3 - - - - - - - | - - A5:2 - - - - - | - - - - F6:2 - - - | E6:3 - - - - - - -",
        bell: BELL,
        ...COMBAT,
        hb: "x - - - x - - -",
        tbell: "- - - - - - - - | - - - - - - Eb6:3 -",
      },
    },
    b2: {
      bars: 8,
      tracks: {
        drone: "D1 | . | . | . | . | . | . | .",
        pad: chords(A, 3),
        flakes: FLAKES,
        hat: "- - - - g - - - | - - - - g - - g",
        horn: THEME,
        strings: seq("D3:5 . . . . . . .", "Bb2:5 . . . . . . .", "F3:5 . . . . . . .", "C3:5 . . . . . . .", "D3:5 . . . . . . .", "Bb2:5 . . . . . . .", "G2:5 . . . . . . .", "A2:5 . . . . . - -"),
        ...COMBAT,
        hb: "x - - - x - - -",
        tbell: "- - - - - - - - | - - - - - - Eb6:3 -",
      },
    },
  },
  arrangement: ["intro", "a", "b", "c", "b2"],
  loopFrom: 1,
};
