/**
 * Pure music theory helpers: note names, frequencies, scales, chord symbols.
 * No Web Audio here so it can be unit-tested in node.
 */

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-G])(#{1,2}|b{1,2})?(-?\d)$/;
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** "C4" → 60, "A4" → 69, "Eb3" → 51, "F#5" → 78. Throws on invalid input. */
export function noteToMidi(name: string): number {
  const m = NOTE_RE.exec(name);
  if (!m) throw new Error(`Invalid note name "${name}"`);
  const [, letter, acc = "", oct] = m;
  const shift = acc.startsWith("#") ? acc.length : -acc.length;
  return (Number(oct) + 1) * 12 + (LETTER[letter!] ?? 0) + shift;
}

export function isNoteName(s: string): boolean {
  return NOTE_RE.test(s);
}

export function midiToNote(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  return `${SHARP_NAMES[pc]}${Math.floor(midi / 12) - 1}`;
}

/** Equal temperament, A4 = 440 Hz. */
export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export const noteToFreq = (name: string) => midiToFreq(noteToMidi(name));

/** Semitone offsets of modes and scales used by the soundtrack. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  minorPentatonic: [0, 3, 5, 7, 10],
} as const;
export type ScaleName = keyof typeof SCALES;

/** MIDI note of the n-th degree (0-based, may be negative or exceed the octave) of a scale rooted at `rootMidi`. */
export function scaleDegree(rootMidi: number, scale: ScaleName, degree: number): number {
  const steps = SCALES[scale];
  const n = steps.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return rootMidi + oct * 12 + (steps[idx] ?? 0);
}

/** Snap a MIDI note to the closest note of a scale (ties go down). */
export function quantizeToScale(midi: number, rootMidi: number, scale: ScaleName): number {
  const steps = SCALES[scale];
  let best = midi;
  let bestDist = Infinity;
  for (let o = -1; o <= 1; o++) {
    for (const s of steps) {
      const base = rootMidi + 12 * (Math.floor((midi - rootMidi) / 12) + o) + s;
      const d = Math.abs(base - midi);
      if (d < bestDist || (d === bestDist && base < best)) {
        best = base;
        bestDist = d;
      }
    }
  }
  return best;
}

const CHORD_QUALITIES: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "5": [0, 7, 12],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  m6: [0, 3, 7, 9],
  dim7: [0, 3, 6, 9],
};
const CHORD_RE = /^([A-G])(#|b)?([a-z0-9]*)$/;

/**
 * Chord symbol → MIDI notes, root placed in `octave`. "Dm" → [62, 65, 69] for octave 4.
 * Supports the qualities in CHORD_QUALITIES. Optional slash bass ("Dm/A") adds the bass an octave below.
 */
export function chordNotes(symbol: string, octave: number): number[] {
  const [main = "", bass] = symbol.split("/");
  const m = CHORD_RE.exec(main);
  if (!m) throw new Error(`Invalid chord "${symbol}"`);
  const [, letter, acc = "", quality = ""] = m;
  const intervals = CHORD_QUALITIES[quality];
  if (!intervals) throw new Error(`Unknown chord quality "${quality}" in "${symbol}"`);
  const root = noteToMidi(`${letter}${acc}${octave}`);
  const notes = intervals.map((i) => root + i);
  if (bass) {
    let b = noteToMidi(`${bass}${octave}`);
    while (b >= root) b -= 12;
    notes.unshift(b);
  }
  return notes;
}

/** Chord symbol → pattern token ("D4+F4+A4"). */
export function chordToken(symbol: string, octave: number): string {
  return chordNotes(symbol, octave).map(midiToNote).join("+");
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Linear slider value (0..1) to a perceptual gain. */
export const sliderToGain = (v: number) => {
  const c = clamp(v, 0, 1);
  return c * c;
};

/** Small deterministic PRNG (mulberry32) so offline renders and tests are reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
