import { chords, seq } from "../compose";
import type { Song } from "../types";

/**
 * Deep Mines — E phrygian. A low drone that never leaves, distant pickaxes as pitched metal percussion,
 * water-drop celesta, and the main motif sung low by a horn with the phrygian F (E–A–B–C → B–E–F–G).
 */
const A = ["Em", "F", "Em", "Dm", "Em", "F", "G", "F"];
const THEME = seq(
  "B3:6 . . . E4 . F4:6 .",
  "G4:8 . . . F4:6 . E4 .",
  "D4:7 . . . E4:5 . D4 .",
  "B3:7 . . . . . - -",
  "B3:6 . . . E4 . F4:6 .",
  "G4:8 . . . A4:6 . B4 .",
  "C5:8 . . . B4:6 . A4 .",
  "B4:8 . . . . . - -"
);
const DRIPS = "B5:3 - - - - - - - | - - - - - - E6:2 - | - - - - - - - - | - - G5:3 - - - - -";
const PICKS = "E5 - - B4:5 - - E5:6 - | - - F5:4 - - - B4:5 -";
const COMBAT = {
  taiko: "X - - x - - X - | X - x - X - x x",
  kick: "x - x - x - x -",
  ost: "E1 E1:5 E1 E1:5 F1 F1:5 E1 G1:5",
};

export const deepMines: Song = {
  id: "deep-mines",
  title: "Veins of the Deep",
  bpm: 92,
  beatsPerBar: 4,
  key: "E phrygian",
  tracks: {
    drone: { instrument: "drone", layer: "pad", gain: 0.55, reverb: 0.4, params: { cutoff: 260, attack: 3, release: 4 } },
    pad: { instrument: "pad", layer: "pad", gain: 0.35, reverb: 0.55, params: { cutoff: 600, attack: 2, release: 3, detune: 11 } },
    metal: { instrument: "metal", layer: "perc", gain: 0.45, pan: 0.35, reverb: 0.5, delay: 0.25, humanize: 12, velJitter: 0.25 },
    kickSoft: { instrument: "kick", layer: "perc", gain: 0.4, humanize: 4 },
    hat: { instrument: "hat", layer: "perc", gain: 0.35, pan: -0.3, humanize: 6, velJitter: 0.3 },
    drips: { instrument: "celesta", layer: "melody", gain: 0.4, pan: -0.35, reverb: 0.7, delay: 0.35, humanize: 30, params: { release: 1, bright: 0.2 } },
    horn: { instrument: "horn", layer: "melody", gain: 0.5, reverb: 0.55, params: { bright: 0.45, release: 0.8 } },
    strings: { instrument: "strings", layer: "melody", gain: 0.45, reverb: 0.55, params: { attack: 0.3, release: 1, cutoff: 1500 } },
    taiko: { instrument: "taiko", layer: "combat", gain: 0.6, reverb: 0.35 },
    kick: { instrument: "kick", layer: "combat", gain: 0.5 },
    ost: { instrument: "bass", layer: "combat", gain: 0.55, params: { cutoff: 500, gate: 0.6 } },
    hb: { instrument: "heartbeat", layer: "tension", gain: 0.7 },
    tdrip: { instrument: "metal", layer: "tension", gain: 0.25, reverb: 0.6, delay: 0.4 },
  },
  sections: {
    intro: {
      bars: 4,
      tracks: {
        drone: "E1 | . | . | .",
        metal: "- - - - - - - - | - - - - - - - - | E5:4 - - - - - - - | - - - - B4:3 - - -",
        drips: DRIPS,
      },
    },
    a: {
      bars: 8,
      tracks: {
        drone: "E1 | . | . | . | . | . | . | .",
        pad: chords(A, 3),
        metal: PICKS,
        kickSoft: "x - - - - - - - | x - - - - - x -",
        hat: "- - g - - - g - | - - g - - g - g",
        drips: DRIPS,
        ...COMBAT,
        hb: "x - - - x - - -",
        tdrip: "- - - - - - - - | - - - - - - F6:3 -",
      },
    },
    b: {
      bars: 8,
      tracks: {
        drone: "E1 | . | . | . | . | . | . | .",
        pad: chords(A, 3),
        metal: PICKS,
        kickSoft: "x - - - - - - - | x - - - - - x -",
        hat: "- - g - - - g - | - - g - - g - g",
        horn: THEME,
        ...COMBAT,
        hb: "x - - - x - - -",
        tdrip: "- - - - - - - - | - - - - - - F6:3 -",
      },
    },
    c: {
      bars: 8,
      tracks: {
        drone: "E1 | . | . | . | . | . | . | .",
        pad: chords(["Em", "Em", "F", "F", "Em", "Em", "Dm", "F"], 2),
        metal: "E5:4 - - - - - - - | - - - - - - - - | - - - - B4:3 - - - | - - - - - - - -",
        drips: "B5:3 - - - E6:2 - - - | - - G5:3 - - - - - | - - - - F6:2 - - - | E6:3 - - - - - - -",
        ...COMBAT,
        hb: "x - - - x - - -",
        tdrip: "- - - - - - - - | - - - - - - F6:3 -",
      },
    },
    b2: {
      bars: 8,
      tracks: {
        drone: "E1 | . | . | . | . | . | . | .",
        pad: chords(A, 3),
        metal: PICKS,
        kickSoft: "x - - - - - - - | x - - - - - x -",
        hat: "- - g - - - g - | - - g - - g - g",
        strings: THEME,
        horn: seq("E3:5 . . . . . . .", "F3:5 . . . . . . .", "E3:5 . . . . . . .", "D3:5 . . . . . . .", "E3:5 . . . . . . .", "F3:5 . . . . . . .", "G3:5 . . . . . . .", "F3:5 . . . . . - -"),
        ...COMBAT,
        hb: "x - - - x - - -",
        tdrip: "- - - - - - - - | - - - - - - F6:3 -",
      },
    },
  },
  arrangement: ["intro", "a", "b", "c", "b2"],
  loopFrom: 1,
};
