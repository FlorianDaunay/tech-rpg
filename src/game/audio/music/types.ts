/**
 * Song format (data). Kept serialisable so it can move to a JSON content type later.
 *
 * Patterns are tracker-like strings. Bars are separated by "|"; the tokens of a bar split it evenly,
 * so a bar can be written in quarters ("C4 . E4 G4") or sixteenths, and bars may differ.
 * Tokens:
 *   C4 / Eb3 / F#5      a note           C3+Eb3+G3   a chord
 *   -                   rest             .           hold (extends the previous note, also across bars)
 *   x  X  o  g          unpitched hit: normal / accent / soft / ghost (drums)
 *   suffix :0..9        velocity (C4:9 = loud, x:3 = soft). Default 7 (0.8), X = 9, o = 4, g = 2.
 * A pattern shorter than its section repeats; a longer one is cut.
 */

/** Adaptive stems. Their gains crossfade with the music state. */
export type Layer = "pad" | "melody" | "perc" | "combat" | "tension";
export const LAYERS: readonly Layer[] = ["pad", "melody", "perc", "combat", "tension"];

export type MusicState = "explore" | "combat" | "boss" | "danger-low-hp" | "silence";

export type InstrumentId =
  | "pad"
  | "warmPad"
  | "choir"
  | "pluck"
  | "harp"
  | "celesta"
  | "bell"
  | "toll"
  | "bass"
  | "subBass"
  | "drone"
  | "flute"
  | "horn"
  | "strings"
  | "glass"
  | "kick"
  | "snare"
  | "hat"
  | "taiko"
  | "frame"
  | "metal"
  | "shaker"
  | "heartbeat"
  | "whisper";

export interface InstrumentParams {
  /** Lowpass cutoff base (Hz) for filtered instruments. */
  cutoff?: number;
  attack?: number;
  release?: number;
  /** Detune spread in cents for multi-oscillator voices. */
  detune?: number;
  /** Transposition in semitones. */
  transpose?: number;
  /** Generic brightness / modulation index 0..1. */
  bright?: number;
  /** Vowel for choir: "a" | "o" | "u" | "e". */
  vowel?: "a" | "o" | "u" | "e";
  /** Multiplier on note durations (legato > 1, staccato < 1). */
  gate?: number;
}

export interface Track {
  instrument: InstrumentId;
  layer: Layer;
  /** Linear gain 0..1 (pre layer). */
  gain: number;
  /** Stereo position -1..1. */
  pan?: number;
  /** Hall reverb send 0..1. */
  reverb?: number;
  /** Tempo-synced delay send 0..1. */
  delay?: number;
  /** Timing humanisation in milliseconds (±). */
  humanize?: number;
  /** Velocity humanisation (± fraction). */
  velJitter?: number;
  params?: InstrumentParams;
}

export interface Section {
  bars: number;
  /** trackId → pattern. Missing tracks are silent in this section. */
  tracks: Record<string, string>;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  /** Quarter-note beats per bar (3 for 3/4). */
  beatsPerBar: number;
  /** For documentation / generative helpers ("D dorian"). */
  key: string;
  tracks: Record<string, Track>;
  sections: Record<string, Section>;
  /** Section ids, in order. */
  arrangement: string[];
  /** Index in `arrangement` where the loop restarts. Omit for one-shot stings. */
  loopFrom?: number;
  /** Swing amount 0..0.5 applied to off-beat eighths. */
  swing?: number;
}

/** A note event after compilation, times in beats from the song start. */
export interface NoteEvent {
  beat: number;
  dur: number;
  /** MIDI notes, empty for unpitched hits. */
  notes: number[];
  vel: number;
  track: string;
}

export interface CompiledSong {
  song: Song;
  /** Beats before the loop point (played once). */
  introBeats: number;
  /** Length of the looping region in beats (0 for one-shots). */
  loopBeats: number;
  totalBeats: number;
  /** Sorted by beat. */
  events: NoteEvent[];
  /** Beat at which each arrangement entry starts. */
  sectionStarts: number[];
}
