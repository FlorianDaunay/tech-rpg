import { chordToken } from "../../theory";
import { arp, seq } from "../compose";
import type { Song } from "../types";

const C = chordToken;

/** Victory — the main motif resolved into D major (F → F♯): the flame flares. One-shot, ~8 s. */
export const victory: Song = {
  id: "victory",
  title: "Victory",
  bpm: 90,
  beatsPerBar: 4,
  key: "D major",
  tracks: {
    horn: { instrument: "horn", layer: "melody", gain: 0.6, reverb: 0.5, params: { bright: 0.85 } },
    strings: { instrument: "strings", layer: "pad", gain: 0.45, reverb: 0.55, params: { attack: 0.08, release: 1.8 } },
    choir: { instrument: "choir", layer: "pad", gain: 0.4, reverb: 0.7, params: { vowel: "a", attack: 0.3, release: 2.5 } },
    harp: { instrument: "harp", layer: "melody", gain: 0.45, pan: 0.3, reverb: 0.5 },
    celesta: { instrument: "celesta", layer: "melody", gain: 0.5, reverb: 0.6, delay: 0.3 },
    bass: { instrument: "subBass", layer: "pad", gain: 0.55, params: { release: 2 } },
    taiko: { instrument: "taiko", layer: "perc", gain: 0.6, reverb: 0.5 },
  },
  sections: {
    s: {
      bars: 3,
      tracks: {
        horn: "A4:7 . D5:7 E5:7 F#5:9 . . . | A5:9 . . . . . . . | . . . . . . - -",
        strings: `- - - - ${C("D", 4)} . . . | ${C("G", 3)} . ${C("A", 3)} . | ${C("D", 4)} . . -`,
        choir: `- - - - - - - - | ${C("Dmaj7", 3)} . . . . . . . | . . . . . . - -`,
        harp: seq(arp("D", 4, [0, 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 5, 6, 7], 5), "- - - - - - - -", "- - - - - - - -"),
        celesta: "- - - - - - - - | - - - - A6:5 - F#6:5 - | D7:6 - - - - - - -",
        bass: "- - - - D2 . . . | G1 . A1 . | D2 . . .",
        taiko: "- - - - X - - - | X - - - x - x x | X:9 - - - - - - -",
      },
    },
  },
  arrangement: ["s"],
};

/** Defeat — the motif falling instead of rising, the last chord left open. One-shot, ~9 s. */
export const defeat: Song = {
  id: "defeat",
  title: "The Flame Gutters",
  bpm: 60,
  beatsPerBar: 4,
  key: "D minor",
  tracks: {
    celesta: { instrument: "celesta", layer: "melody", gain: 0.6, reverb: 0.65, delay: 0.25, params: { release: 2.2 } },
    pad: { instrument: "pad", layer: "pad", gain: 0.5, reverb: 0.7, params: { attack: 0.8, release: 3, cutoff: 900 } },
    bass: { instrument: "subBass", layer: "pad", gain: 0.5, params: { release: 3 } },
    toll: { instrument: "toll", layer: "pad", gain: 0.5, reverb: 0.8 },
  },
  sections: {
    s: {
      bars: 2,
      tracks: {
        celesta: "F5:7 . E5:6 . D5:6 . C#5:5 . | D5:5 . . . . . - -",
        pad: `${C("Dm", 3)} ${C("A#", 2)} ${C("Gm", 3)} ${C("A", 2)} | ${C("Dm", 3)} . . -`,
        bass: "D2 A#1 G1 A1 | D1 . . -",
        toll: "D3:6 - - - | - - - -",
      },
    },
  },
  arrangement: ["s"],
};
