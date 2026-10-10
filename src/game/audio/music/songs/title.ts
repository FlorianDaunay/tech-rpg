import { arps, chords, seq } from "../compose";
import type { Song } from "../types";

/**
 * "The Last Flame" — the main theme. D minor, 3/4, slow and lonely.
 * Motif (bars 1-4): A–D–E–F rising, falling back to A — the flame flickering up and settling.
 * Every other song quotes this motif.
 */
export const MOTIF_A1 = "A4:6 . . . D5 E5:6 | F5:8 . . . E5:6 D5 | C5:7 . . . D5:5 C5:5 | A4:7 . . . . -";
export const MOTIF_A2 = "A4:6 . . . D5 E5:6 | F5:8 . . . G5:6 A5 | A#5:8 . . . A5:6 G5 | A5:8 . . . . -";
const THEME_B =
  "D6:8 . . . C6:6 A#5 | A5:7 . . . G5:5 F5 | G5:7 . . . F5:5 E5 | F5:7 . . . . - | " +
  "A#5:8 . . . A5:6 G5 | F5:7 . . . E5:5 D5 | E5:8 . . . C#5:6 E5 | D5:7 . . . . -";

const A_CH = ["Dm", "A#", "C", "Asus4", "Dm", "A#", "Gm", "A"];
const B_CH = ["A#", "F", "C", "F", "Gm", "Dm", "A", "Dm"];

export const title: Song = {
  id: "title",
  title: "The Last Flame",
  bpm: 66,
  beatsPerBar: 3,
  key: "D minor",
  tracks: {
    pad: { instrument: "pad", layer: "pad", gain: 0.5, reverb: 0.55, params: { attack: 1.6, release: 2.6, cutoff: 1100 } },
    bass: { instrument: "subBass", layer: "pad", gain: 0.55, params: { attack: 0.4, release: 1.5 } },
    toll: { instrument: "toll", layer: "pad", gain: 0.45, reverb: 0.7, pan: -0.2, humanize: 0 },
    harp: { instrument: "harp", layer: "pad", gain: 0.42, reverb: 0.45, pan: 0.25, humanize: 12, params: { bright: 0.25 } },
    celesta: { instrument: "celesta", layer: "melody", gain: 0.7, reverb: 0.5, delay: 0.18, humanize: 10, params: { release: 1.8, bright: 0.5 } },
    strings: { instrument: "strings", layer: "melody", gain: 0.45, reverb: 0.55, pan: -0.15, params: { attack: 0.6, release: 1.2, cutoff: 1800 } },
    wind: { instrument: "whisper", layer: "tension", gain: 0.25, reverb: 0.5, params: { attack: 1.5, release: 2 } },
  },
  sections: {
    intro: {
      bars: 4,
      tracks: {
        pad: chords(["Dm", "Dm", "A#", "Asus4"], 3),
        bass: "D2 | . | A#1 | A1",
        toll: "D3:6 - - - - - | - | - | -",
        celesta: "- - - - A5:4 . | . . . . - - | - - - - D6:4 . | . . . . - -",
      },
    },
    a: {
      bars: 8,
      tracks: {
        pad: chords(A_CH, 3),
        bass: "D2 | A#1 | C2 | A1 | D2 | A#1 | G1 | A1",
        celesta: seq(MOTIF_A1, MOTIF_A2),
      },
    },
    b: {
      bars: 8,
      tracks: {
        pad: chords(B_CH, 3),
        bass: "A#1 | F1 | C2 | F1 | G1 | D2 | A1 | D2",
        harp: arps(B_CH, 3, [0, 1, 2, 3, 4, 2], 5),
        celesta: THEME_B,
        strings: "D4 . . . . . | C4 . . . . . | E4 . . . . . | F4 . . . . . | D4 . . . . . | F4 . . . . . | E4 . . . C#4 . | D4 . . . . -",
        toll: "A#2:5 - - - - - | - | - | - | - | - | - | -",
      },
    },
    a2: {
      bars: 8,
      tracks: {
        pad: chords(A_CH, 3),
        bass: "D2 | A#1 | C2 | A1 | D2 | A#1 | G1 | A1",
        harp: arps(A_CH, 3, [0, 2, 3, 2, 4, 2], 4),
        celesta: seq(MOTIF_A1, MOTIF_A2),
        strings: "F4 . . . . . | D4 . . . . . | E4 . . . . . | C#4 . . . . . | F4 . . . . . | F4 . . . . . | D4 . . . . . | C#4 . . . . -",
      },
    },
    outro: {
      bars: 4,
      tracks: {
        pad: chords(["Dm", "A#maj7", "Gm", "Asus4"], 3),
        bass: "D2 | A#1 | G1 | A1",
        celesta: "- - - - F5:4 . | E5:4 . . . D5:3 . | - - - - - - | A4:4 . . . . -",
        wind: "C4 . . . . . | . | . | . . . - - -",
      },
    },
  },
  arrangement: ["intro", "a", "b", "a2", "outro"],
  loopFrom: 1,
};
