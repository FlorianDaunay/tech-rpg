import { arps, chords, seq } from "../compose";
import type { Song } from "../types";

/**
 * Herald of the Hollow — boss battle. D minor, 140 bpm. Taiko + driving bass ostinato, 16th-note strings,
 * and the main theme in augmentation on horns and choir: the Last Flame fighting back. The breakdown drops to
 * the lonely celesta of the title before everything returns.
 */
const ost = (root: string, o: number) =>
  `${root}${o} ${root}${o}:5 ${root}${o + 1} ${root}${o}:5 ${root}${o} ${root}${o}:5 ${root}${o + 1}:9 ${root}${o}:5`;
const BASS = { D: ost("D", 2), A_: ost("A#", 1), C: ost("C", 2), A: ost("A", 1), G: ost("G", 1), F: ost("F", 1) };

const A = ["Dm", "Dm", "A#", "C", "Dm", "Dm", "Gm", "A"];
const BASS_A = seq(BASS.D, BASS.D, BASS.A_, BASS.C, BASS.D, BASS.D, BASS.G, BASS.A);
const T1 = ["Dm", "Dm", "A#", "A#", "C", "C", "A", "A"];
const BASS_T1 = seq(BASS.D, BASS.D, BASS.A_, BASS.A_, BASS.C, BASS.C, BASS.A, BASS.A);
const T2 = ["Dm", "Dm", "A#", "A#", "Gm", "Gm", "A", "A"];
const BASS_T2 = seq(BASS.D, BASS.D, BASS.A_, BASS.A_, BASS.G, BASS.G, BASS.A, BASS.A);
const STR16 = [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 3, 2];

// Main theme in augmentation (each title bar = two boss bars).
const THEME1 = seq("A4:7 . . . . . . .", "D5:8 . . . E5:7 . . .", "F5:9 . . . . . . .", "E5:7 . . . D5 . . .", "C5:8 . . . . . . .", "D5:7 . . . C5 . . .", "A4:8 . . . . . . .", ". . . . . . - -");
const THEME2 = seq("A4:7 . . . . . . .", "D5:8 . . . E5:7 . . .", "F5:9 . . . . . . .", "G5:8 . . . A5:8 . . .", "A#5:9 . . . . . . .", "A5:8 . . . G5 . . .", "A5:9 . . . . . . .", ". . . . . . - -");
const CELESTA = seq("A5:5 . . D6 E6 . F6:6 .", ". . E6 . D6 . . .", "C6:5 . . . D6 . C6 .", "A5:5 . . . . . - -");

const DRUMS = {
  kick: "x - - - - - x - | x - - x - - x -",
  snare: "- - x - - - x - | - - x - - - x g",
  hat: "g g o g g g o g g g o g g g o g",
};
const COMBAT = { taiko: "X - - x - - x - | X - x - X x X x" };

export const boss: Song = {
  id: "boss",
  title: "Herald of the Hollow",
  bpm: 140,
  beatsPerBar: 4,
  key: "D minor",
  tracks: {
    choir: { instrument: "choir", layer: "pad", gain: 0.42, reverb: 0.55, params: { vowel: "a", attack: 0.3, release: 1 } },
    bass: { instrument: "bass", layer: "pad", gain: 0.6, humanize: 3, params: { cutoff: 900, gate: 0.7 } },
    horn: { instrument: "horn", layer: "melody", gain: 0.55, pan: -0.15, reverb: 0.45, params: { bright: 0.8 } },
    choirMel: { instrument: "choir", layer: "melody", gain: 0.4, pan: 0.2, reverb: 0.6, params: { vowel: "o", attack: 0.15, release: 0.8 } },
    celesta: { instrument: "celesta", layer: "melody", gain: 0.6, reverb: 0.6, delay: 0.25, params: { release: 1.6 } },
    kick: { instrument: "kick", layer: "perc", gain: 0.55, humanize: 2 },
    snare: { instrument: "snare", layer: "perc", gain: 0.38, reverb: 0.25, humanize: 3, velJitter: 0.15 },
    hat: { instrument: "hat", layer: "perc", gain: 0.4, pan: 0.3, humanize: 3, velJitter: 0.25 },
    taiko: { instrument: "taiko", layer: "combat", gain: 0.6, reverb: 0.35, humanize: 3 },
    strings: { instrument: "strings", layer: "combat", gain: 0.36, pan: 0.15, reverb: 0.3, humanize: 2, params: { attack: 0.01, release: 0.08, gate: 0.6, cutoff: 2400 } },
    hb: { instrument: "heartbeat", layer: "tension", gain: 0.7 },
  },
  sections: {
    intro: {
      bars: 4,
      tracks: {
        taiko: "X - - x - - x - | X - x - X x X x | X - - x - - x - | X x X x X x X:9 X:9",
        bass: seq(BASS.D, BASS.D, BASS.D, BASS.D),
        choir: chords(["Dm", "Dm", "Dm", "A"], 3),
      },
    },
    a: {
      bars: 8,
      tracks: {
        choir: chords(A, 3),
        bass: BASS_A,
        ...DRUMS,
        ...COMBAT,
        strings: arps(A, 4, STR16, 6),
      },
    },
    b: {
      bars: 8,
      tracks: {
        choir: chords(T1, 3),
        bass: BASS_T1,
        horn: THEME1,
        ...DRUMS,
        ...COMBAT,
        strings: arps(T1, 4, STR16, 6),
      },
    },
    c: {
      bars: 8,
      tracks: {
        choir: chords(T2, 3),
        bass: BASS_T2,
        horn: THEME2,
        choirMel: THEME2,
        ...DRUMS,
        ...COMBAT,
        strings: arps(T2, 4, STR16, 7),
      },
    },
    d: {
      bars: 8,
      tracks: {
        choir: chords(["Dm", "Dm", "A#", "A#", "Gm", "Gm", "A", "A"], 3),
        bass: "D2 . . . . . . . | . | A#1 . . . . . . . | . | G1 . . . . . . . | . | A1 . . . . . . . | .",
        celesta: CELESTA,
        taiko: "X - - - - - - - | - - - - x - - - | X - - - - - - - | - - - - x - x -",
        hb: "x - - - x - - -",
      },
    },
    e: {
      bars: 8,
      tracks: {
        choir: chords(T1, 4),
        bass: BASS_T1,
        horn: THEME1,
        choirMel: THEME1,
        ...DRUMS,
        ...COMBAT,
        strings: arps(T1, 4, STR16, 7),
      },
    },
  },
  arrangement: ["intro", "a", "b", "c", "d", "e"],
  loopFrom: 1,
};
