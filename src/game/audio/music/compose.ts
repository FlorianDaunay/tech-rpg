/** Small helpers to write songs as readable data. Pure. */
import { chordNotes, chordToken, midiToNote } from "../theory";

/** Join bars into a pattern. */
export const seq = (...bars: string[]) => bars.join(" | ");

/** Repeat a (multi-bar) pattern n times. */
export const rep = (pattern: string, n: number) => Array.from({ length: n }, () => pattern).join(" | ");

/** Whole-bar chords for pads: one token per bar, repeated chords are held ("."). */
export function chords(symbols: string[], octave: number): string {
  let prev = "";
  return symbols
    .map((s) => {
      const tok = s === "-" ? "-" : s === prev ? "." : chordToken(s, octave);
      prev = s;
      return tok;
    })
    .join(" | ");
}

/**
 * Arpeggiate a chord over one bar. `shape` lists chord-tone indices (beyond the chord size → next octave),
 * "-" for a rest and "." for a hold. Example: arp("Dm", 3, [0, 1, 2, 3, 2, 1]) → "D3 F3 A3 D4 A3 F3".
 */
export function arp(symbol: string, octave: number, shape: (number | "-" | ".")[], vel?: number): string {
  const notes = chordNotes(symbol.split("/")[0]!, octave).slice(0, 3);
  const suffix = vel !== undefined ? `:${vel}` : "";
  return shape
    .map((i) => {
      if (i === "-" || i === ".") return i;
      const n = notes[i % notes.length]! + 12 * Math.floor(i / notes.length);
      return midiToNote(n) + suffix;
    })
    .join(" ");
}

/** Arpeggiate a chord progression with the same shape (one bar each). */
export const arps = (symbols: string[], octave: number, shape: (number | "-" | ".")[], vel?: number) =>
  seq(...symbols.map((s) => arp(s, octave, shape, vel)));

/**
 * Rhythm template → notes: in `rhythm`, "x" becomes `note`, "X" an accented note, "o" a soft one.
 * Example: hits("x . x x", "D2") → "D2 . D2 D2".
 */
export function hits(rhythm: string, note: string): string {
  return rhythm
    .split(/\s+/)
    .map((tok) => (tok === "x" ? note : tok === "X" ? `${note}:9` : tok === "o" ? `${note}:4` : tok))
    .join(" ");
}

/** One bar per root, each with the same rhythm. */
export const bassline = (roots: string[], rhythm: string) => seq(...roots.map((r) => hits(rhythm, r)));
