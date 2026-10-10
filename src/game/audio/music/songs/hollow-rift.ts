import { seq } from "../compose";
import type { Song } from "../types";

/**
 * Hollow Rift — where the light was torn out. Clusters and tritones over a D pedal, wide-detuned pads that
 * phase against each other, whispers, and the main motif corrupted: A–D–E♭–F, then a tritone fall.
 */
const CL = {
  a: "D3+D#3+A3",
  b: "C#3+G3+G#3",
  c: "D3+F3+G#3+A3",
  d: "C3+F#3+A#3",
  e: "D#3+A3+D4",
  f: "E3+A#3+B3",
};
const PADS_A = `${CL.a} | . | ${CL.b} | . | ${CL.c} | . | ${CL.d} | ${CL.b}`;
const PADS_B = `${CL.e} | . | ${CL.f} | . | ${CL.a} | . | ${CL.d} | .`;
const MEL = seq(
  "A4:6 . . . D5 . D#5:6 .",
  "F5:8 . . . . . . .",
  "B4:7 . . . . . A4:5 .",
  "- - - - - - - -",
  "A4:6 . . . D5 . D#5:6 .",
  "F5:8 . . . G#5:7 . . .",
  "A5:8 . . . D#5:6 . . .",
  "D5:7 . . . . . - -"
);
const COMBAT = {
  taiko: "X - - x - - x - | X - x - - x X -",
  cmetal: "x - g x - g x g",
  pulse: "D2 D2:5 G#1 D2 D2:5 D2 G#1:5 A1",
};

export const hollowRift: Song = {
  id: "hollow-rift",
  title: "The Hollow Between",
  bpm: 70,
  beatsPerBar: 4,
  key: "D (atonal clusters, tritone axis D–G♯)",
  tracks: {
    pad: { instrument: "pad", layer: "pad", gain: 0.42, reverb: 0.7, delay: 0.2, params: { attack: 2.5, release: 3.5, cutoff: 1000, detune: 32 } },
    drone: { instrument: "drone", layer: "pad", gain: 0.5, reverb: 0.4, params: { cutoff: 240, attack: 3, release: 4 } },
    glass: { instrument: "glass", layer: "melody", gain: 0.55, reverb: 0.7, delay: 0.3, params: { attack: 0.4, release: 2 } },
    choir: { instrument: "choir", layer: "melody", gain: 0.35, reverb: 0.8, pan: 0.3, params: { vowel: "u", attack: 1.5, release: 2.5 } },
    whisper: { instrument: "whisper", layer: "melody", gain: 0.4, reverb: 0.8, delay: 0.3, humanize: 60 },
    metal: { instrument: "metal", layer: "perc", gain: 0.3, reverb: 0.7, delay: 0.4, pan: -0.4, humanize: 25, params: { transpose: -12 } },
    taikoFar: { instrument: "taiko", layer: "perc", gain: 0.45, reverb: 0.7, humanize: 10, params: { transpose: -3 } },
    taiko: { instrument: "taiko", layer: "combat", gain: 0.6, reverb: 0.4 },
    cmetal: { instrument: "metal", layer: "combat", gain: 0.25, pan: 0.3, reverb: 0.3 },
    pulse: { instrument: "bass", layer: "combat", gain: 0.5, params: { cutoff: 600, gate: 0.55 } },
    hb: { instrument: "heartbeat", layer: "tension", gain: 0.75 },
    trill: { instrument: "glass", layer: "tension", gain: 0.3, reverb: 0.6, params: { attack: 0.03, release: 0.3 } },
  },
  sections: {
    intro: {
      bars: 2,
      tracks: {
        drone: "D1 | .",
        pad: `${CL.a} | .`,
        whisper: "C4 . . . . . . . | - - - - G#4 . . .",
      },
    },
    a: {
      bars: 8,
      tracks: {
        drone: "D1 | . | . | . | . | . | . | .",
        pad: PADS_A,
        glass: MEL,
        whisper: "- - - - - - - - | - - - - - - - - | F4 . . . . . . . | - - - - - - - -",
        metal: "x:4 - - - - - - - | - - - - - - - - | - - - - - - x:3 - | - - - - - - - -",
        taikoFar: "x:5 - - - - - - - | - - - - - - - - | - - - - x:4 - - - | - - - - - - - -",
        ...COMBAT,
        hb: "x - - - x - - -",
        trill: "D7:3 D#7:3 D7:3 D#7:3 D7:3 D#7:3 D7:3 D#7:3 | - - - - - - - -",
      },
    },
    b: {
      bars: 8,
      tracks: {
        drone: "D#1 | . | . | . | D1 | . | . | .",
        pad: PADS_B,
        choir: "A3 . . . . . . . | G#3 . . . . . . . | A#3 . . . . . . . | A3 . . . . . . . | D4 . . . . . . . | C#4 . . . . . . . | C4 . . . . . . . | . . . . . . - -",
        whisper: "D4 . . . . . . . | - - - - - - - - | - - - - A4 . . . | - - - - - - - -",
        metal: "x:4 - - - - - - - | - - - - - - - - | - - - - - - x:3 - | - - - - - - - -",
        taikoFar: "x:5 - - - - - - - | - - - - - - - - | - - - - x:4 - - - | - - - - - - - -",
        ...COMBAT,
        hb: "x - - - x - - -",
        trill: "D7:3 D#7:3 D7:3 D#7:3 D7:3 D#7:3 D7:3 D#7:3 | - - - - - - - -",
      },
    },
    c: {
      bars: 8,
      tracks: {
        drone: "D1 | . | . | . | . | . | . | .",
        pad: PADS_A,
        glass: seq("D6:5 . . . . . . .", "G#5:5 . . . . . . .", "- - - - - - - -", "- - - - - - - -", "A5:5 . . . D#6:5 . . .", "D6:5 . . . . . . .", "- - - - - - - -", "- - - - - - - -"),
        choir: "D3 . . . . . . . | . | C#3 . . . . . . . | . | D3 . . . . . . . | . | G#2 . . . . . . . | .",
        whisper: "- - - - - - - - | E4 . . . . . . . | - - - - - - - - | A#3 . . . . . . .",
        metal: "x:4 - - - - - - - | - - - - - - - - | - - - - - - x:3 - | - - - - - - - -",
        ...COMBAT,
        hb: "x - - - x - - -",
        trill: "D7:3 D#7:3 D7:3 D#7:3 D7:3 D#7:3 D7:3 D#7:3 | - - - - - - - -",
      },
    },
  },
  arrangement: ["intro", "a", "b", "c"],
  loopFrom: 1,
};
