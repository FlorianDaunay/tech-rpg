import { arps, bassline, chords, rep, seq } from "../compose";
import type { Song } from "../types";

/**
 * Cinderhold — the hub. F major (the relative major of the main theme), lute and hearth-warm pad.
 * The flute opens with the theme's rising 5-1-2-3 gesture; section C quotes the D-minor motif literally,
 * reminding that the flame is fragile even here.
 */
const A = ["F", "C/E", "Dm", "A#", "F", "C", "A#", "C"];
const B = ["Dm", "A#", "F", "C", "Dm", "A#", "Gm", "C"];
const BASS_A = ["F2", "E2", "D2", "A#1", "F2", "C2", "A#1", "C2"];
const BASS_B = ["D2", "A#1", "F2", "C2", "D2", "A#1", "G1", "C2"];
const LUTE = [0, 2, 3, 2, 4, 2, 3, 2] as const;

const FLUTE_A = seq(
  "C5 . F5 G5 A5 . . .",
  "G5 . F5 . E5 . C5 .",
  "D5 . . . F5 . A5 .",
  "G5 . . . . . - -",
  "C5 . F5 G5 A5 . . .",
  "G5 . A5 . A#5 . C6 .",
  "D6:8 . C6 . A#5 . A5 .",
  "G5 . . . . . - -"
);
const FLUTE_B = seq(
  "A5 . . . F5 . D5 .",
  "F5 . . . D5 . A#4 .",
  "C5 . . . A4 . C5 .",
  "E5 . . . . . - -",
  "A4:6 . D5 E5 F5:8 . . .",
  "E5 . D5 . C5 . A#4 .",
  "A4 . . . A#4 . D5 .",
  "C5 . . . . . - -"
);
const CELESTA_HINT = seq("C6:5 . . . F6:6 . G6:5 .", "A6:7 . . . G6:5 . F6:5 .", "E6:6 . . . . . - -", "- - - - - - - -");

export const cinderhold: Song = {
  id: "cinderhold",
  title: "Cinderhold Hearth",
  bpm: 84,
  beatsPerBar: 4,
  key: "F major",
  swing: 0.12,
  tracks: {
    lute: { instrument: "pluck", layer: "pad", gain: 0.55, pan: 0.2, reverb: 0.25, humanize: 9, velJitter: 0.15, params: { bright: 0.45 } },
    pad: { instrument: "warmPad", layer: "pad", gain: 0.45, reverb: 0.4, params: { attack: 0.9, release: 1.8, cutoff: 1400 } },
    bass: { instrument: "bass", layer: "pad", gain: 0.5, params: { cutoff: 450, gate: 0.95 } },
    flute: { instrument: "flute", layer: "melody", gain: 0.55, pan: -0.15, reverb: 0.4, delay: 0.12, humanize: 8 },
    celesta: { instrument: "celesta", layer: "melody", gain: 0.5, reverb: 0.5, delay: 0.25, params: { release: 1.5 } },
    harp: { instrument: "harp", layer: "melody", gain: 0.35, pan: -0.3, reverb: 0.4, humanize: 10 },
    frame: { instrument: "frame", layer: "perc", gain: 0.5, pan: -0.1, reverb: 0.2, humanize: 8 },
    shaker: { instrument: "shaker", layer: "perc", gain: 0.6, pan: 0.35, humanize: 6, velJitter: 0.25 },
    taiko: { instrument: "taiko", layer: "combat", gain: 0.5, reverb: 0.3 },
    hb: { instrument: "heartbeat", layer: "tension", gain: 0.6 },
  },
  sections: {
    intro: {
      bars: 2,
      tracks: { lute: arps(["F", "C/E"], 3, [...LUTE], 5) },
    },
    a: {
      bars: 8,
      tracks: {
        lute: arps(A, 3, [...LUTE]),
        pad: chords(A, 3),
        bass: bassline(BASS_A, "x . . . x . . ."),
      },
    },
    b: {
      bars: 8,
      tracks: {
        lute: arps(A, 3, [...LUTE]),
        pad: chords(A, 3),
        bass: bassline(BASS_A, "x . . . x . . ."),
        flute: FLUTE_A,
        frame: rep("x - - - o - - - | x - - o - - o -", 1),
        shaker: "o g o g o g o g",
        taiko: "x - - - - - - - | - - - - x - - -",
        hb: "x - - - x - - -",
      },
    },
    c: {
      bars: 8,
      tracks: {
        lute: arps(B, 3, [...LUTE]),
        pad: chords(B, 3),
        bass: bassline(BASS_B, "x . . x - - x ."),
        flute: FLUTE_B,
        frame: "x - - - o - - - | x - - o - - o -",
        shaker: "o g o g o g o g",
        taiko: "x - - - - - - - | - - - - x - - -",
        hb: "x - - - x - - -",
      },
    },
    d: {
      bars: 8,
      tracks: {
        pad: chords(A, 3),
        bass: bassline(BASS_A, "x . . . . . . ."),
        harp: arps(A, 4, [0, "-", 1, "-", 2, "-", 3, "-"], 4),
        celesta: rep(CELESTA_HINT, 2),
        taiko: "x - - - - - - - | - - - - x - - -",
        hb: "x - - - x - - -",
      },
    },
  },
  arrangement: ["intro", "a", "b", "c", "d"],
  loopFrom: 1,
};
