import { arps, chords, seq } from "../compose";
import type { Song } from "../types";

/**
 * Whispering Wilds — eerie forest. D dorian (the raised B gives an uneasy brightness), glass harmonica melody
 * that bends the main motif (A–D–E–F → G…B), off-kilter 3+3+2 harp, whispered noise voices.
 */
const A = ["Dm", "Em/D", "Dm", "C", "Dm", "Em/D", "F", "G"];
const B = ["F", "G", "Am", "Dm", "F", "G", "C", "Dm"];
const HARP = [0, "-", 2, 1, "-", 3, "-", 2] as (number | "-")[];

const MEL_A = seq(
  "A4 . . D5 E5 . F5 .",
  "G5 . . . E5 . . .",
  "F5 . . . D5 . A4 .",
  "G4 . . . . . - -",
  "A4 . . D5 E5 . F5 .",
  "G5 . . . B5:8 . . .",
  "A5 . . . C6 . A5 .",
  "B5:8 . . . . . - -"
);
const MEL_B = seq(
  "C6 . . . A5 . . .",
  "B5 . . . G5 . . .",
  "A5 . . . E5 . . .",
  "F5 . . . . . - -",
  "C6 . . . A5 . F5 .",
  "D6 . . . B5 . G5 .",
  "E5 . . . G5 . C6 .",
  "A5 . . . . . - -"
);
const COMBAT_PERC = {
  taiko: "X - - x - - x - | X - - x - x x x:9",
  cframe: "o g g o o g g o o g g o o g o o",
  ost: "D3 D3:5 A3 D3:5 D3 A3:5 F3 E3:5",
};

export const whisperingWilds: Song = {
  id: "whispering-wilds",
  title: "The Whispering Wilds",
  bpm: 76,
  beatsPerBar: 4,
  key: "D dorian",
  tracks: {
    pad: { instrument: "pad", layer: "pad", gain: 0.42, reverb: 0.6, params: { attack: 2, release: 3, cutoff: 900, detune: 14 } },
    drone: { instrument: "subBass", layer: "pad", gain: 0.45, params: { attack: 1, release: 2 } },
    harp: { instrument: "harp", layer: "pad", gain: 0.4, pan: 0.3, reverb: 0.5, delay: 0.15, humanize: 14, velJitter: 0.2, params: { bright: 0.2 } },
    whisper: { instrument: "whisper", layer: "melody", gain: 0.35, reverb: 0.7, humanize: 40 },
    glass: { instrument: "glass", layer: "melody", gain: 0.6, pan: -0.15, reverb: 0.6, delay: 0.2, params: { attack: 0.25, release: 1.6 } },
    flute: { instrument: "flute", layer: "melody", gain: 0.5, pan: -0.2, reverb: 0.55, delay: 0.15, humanize: 10, params: { bright: 1.4 } },
    frame: { instrument: "frame", layer: "perc", gain: 0.42, pan: 0.15, reverb: 0.35, humanize: 10 },
    shaker: { instrument: "shaker", layer: "perc", gain: 0.5, pan: -0.4, humanize: 15, velJitter: 0.3 },
    taiko: { instrument: "taiko", layer: "combat", gain: 0.6, reverb: 0.35, humanize: 5 },
    cframe: { instrument: "frame", layer: "combat", gain: 0.35, pan: -0.25, reverb: 0.2, humanize: 5 },
    ost: { instrument: "strings", layer: "combat", gain: 0.4, pan: 0.2, reverb: 0.3, params: { attack: 0.02, release: 0.15, gate: 0.6, cutoff: 2000 } },
    hb: { instrument: "heartbeat", layer: "tension", gain: 0.65 },
    trill: { instrument: "glass", layer: "tension", gain: 0.3, reverb: 0.6, params: { attack: 0.05, release: 0.4 } },
  },
  sections: {
    intro: {
      bars: 4,
      tracks: {
        pad: chords(["Dm", "Dm", "Em/D", "Em/D"], 3),
        drone: "D2 | . | . | .",
        harp: seq("- - - - - - - -", "- - - - - - - -", "A4:3 - - - E5:3 - - -", "D5:3 - - - B4:3 - - -"),
        whisper: "C4 . . . . . . . | - - - - - - - - | - - - - G4 . . . | . . - - - - - -",
      },
    },
    a: {
      bars: 8,
      tracks: {
        pad: chords(A, 3),
        drone: "D2 | . | . | C2 | D2 | . | F1 | G1",
        harp: arps(A, 3, HARP, 5),
        glass: MEL_A,
        frame: "x - - - - - o - | - - x - - - - -",
        shaker: "- - o - - - o g",
        whisper: "- - - - - - - - | - - - - - - - - | E4 . . . . . . . | - - - - - - - -",
        ...COMBAT_PERC,
        hb: "x - - - x - - -",
        trill: "B6:3 C7:3 B6:3 C7:3 B6:3 C7:3 B6:3 C7:3 | - - - - - - - -",
      },
    },
    b: {
      bars: 8,
      tracks: {
        pad: chords(B, 3),
        drone: "F1 | G1 | A1 | D2 | F1 | G1 | C2 | D2",
        harp: arps(B, 4, HARP, 4),
        glass: MEL_B,
        flute: "- - - - - - - - | - - - - - - - - | - - - - - - - - | A4:5 . D5 E5 F5 . . . | - - - - - - - - | - - - - - - - - | - - - - - - - - | E5:5 . D5 . . . - -",
        frame: "x - - - - - o - | - - x - - - - -",
        shaker: "- - o - - - o g",
        ...COMBAT_PERC,
        hb: "x - - - x - - -",
        trill: "- - - - - - - - | A6:3 B6:3 A6:3 B6:3 A6:3 B6:3 A6:3 B6:3",
      },
    },
    a2: {
      bars: 8,
      tracks: {
        pad: chords(A, 3),
        drone: "D2 | . | . | C2 | D2 | . | F1 | G1",
        harp: arps(A, 3, HARP, 5),
        flute: MEL_A,
        glass: seq("- - - - - - - -", "B5:4 . . . . . . .", "- - - - - - - -", "E5:4 . . . . . . .", "- - - - - - - -", "D6:4 . . . . . . .", "- - - - - - - -", "D6:4 . . . . . . ."),
        whisper: "- - - - - - - - | G4 . . . . . . . | - - - - - - - - | - - - - - - - -",
        frame: "x - - - - - o - | - - x - - - o -",
        shaker: "- - o - - - o g",
        ...COMBAT_PERC,
        hb: "x - - - x - - -",
        trill: "B6:3 C7:3 B6:3 C7:3 B6:3 C7:3 B6:3 C7:3 | - - - - - - - -",
      },
    },
  },
  arrangement: ["intro", "a", "b", "a2"],
  loopFrom: 1,
};
