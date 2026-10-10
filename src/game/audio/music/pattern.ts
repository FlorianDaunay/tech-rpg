import { isNoteName, noteToMidi } from "../theory";
import type { CompiledSong, NoteEvent, Song } from "./types";

export type Step =
  | { kind: "rest" }
  | { kind: "hold" }
  | { kind: "hit"; notes: number[]; vel: number };

const HIT_VEL: Record<string, number> = { x: 0.8, X: 1, o: 0.45, g: 0.25 };
const EPS = 1e-6;

/** Velocity digit 0..9 → 0.1..1. */
const digitVel = (d: number) => 0.1 + (d / 9) * 0.9;

/** Parse one pattern token. Throws with a readable message on bad input. */
export function parseToken(token: string): Step {
  if (token === "-") return { kind: "rest" };
  if (token === ".") return { kind: "hold" };
  const [body = "", velStr] = token.split(":");
  let vel: number | undefined;
  if (velStr !== undefined) {
    if (!/^\d$/.test(velStr)) throw new Error(`Bad velocity in token "${token}"`);
    vel = digitVel(Number(velStr));
  }
  if (body in HIT_VEL) return { kind: "hit", notes: [], vel: vel ?? HIT_VEL[body]! };
  const parts = body.split("+");
  if (!parts.every(isNoteName)) throw new Error(`Bad pattern token "${token}"`);
  return { kind: "hit", notes: parts.map(noteToMidi), vel: vel ?? 0.8 };
}

/** Pattern string → bars of steps. */
export function parsePattern(pattern: string): Step[][] {
  return pattern
    .split("|")
    .map((bar) => bar.trim())
    .filter((bar) => bar.length > 0)
    .map((bar) => bar.split(/\s+/).map(parseToken));
}

/** Seconds per beat. */
export const beatSeconds = (bpm: number) => 60 / bpm;

/**
 * Expand a song into a flat list of note events (beats). Holds are resolved, swing applied.
 * Pure: the same song always yields the same events.
 */
export function compileSong(song: Song): CompiledSong {
  const events: NoteEvent[] = [];
  const sectionStarts: number[] = [];
  const parsed = new Map<string, Step[][]>();
  const lastByTrack = new Map<string, NoteEvent>();
  let beat = 0;
  const loopFrom = song.loopFrom;
  let introBeats = 0;

  song.arrangement.forEach((sectionId, idx) => {
    const section = song.sections[sectionId];
    if (!section) throw new Error(`Song ${song.id}: unknown section "${sectionId}"`);
    if (idx === loopFrom) {
      introBeats = beat;
      lastByTrack.clear(); // holds never cross the loop point
    }
    sectionStarts.push(beat);
    for (const [trackId, pattern] of Object.entries(section.tracks)) {
      if (!song.tracks[trackId]) throw new Error(`Song ${song.id}: unknown track "${trackId}"`);
      let bars = parsed.get(pattern);
      if (!bars) {
        bars = parsePattern(pattern);
        parsed.set(pattern, bars);
      }
      if (bars.length === 0) continue;
      for (let b = 0; b < section.bars; b++) {
        const steps = bars[b % bars.length]!;
        const stepBeats = song.beatsPerBar / steps.length;
        const barStart = beat + b * song.beatsPerBar;
        steps.forEach((step, i) => {
          const at = barStart + i * stepBeats;
          if (step.kind === "rest") {
            lastByTrack.delete(trackId);
          } else if (step.kind === "hold") {
            const last = lastByTrack.get(trackId);
            if (last && Math.abs(last.beat + last.dur - at) < EPS) {
              last.dur = at + stepBeats - last.beat;
            }
          } else {
            const ev: NoteEvent = { beat: at, dur: stepBeats, notes: step.notes, vel: step.vel, track: trackId };
            events.push(ev);
            lastByTrack.set(trackId, ev);
          }
        });
      }
    }
    // A track absent from the next section must not be extended by its holds.
    for (const trackId of [...lastByTrack.keys()]) {
      if (!(trackId in section.tracks)) lastByTrack.delete(trackId);
    }
    beat += section.bars * song.beatsPerBar;
  });

  if (song.swing) {
    for (const ev of events) {
      const s = swingShift(song, ev.beat);
      ev.beat += s;
      ev.dur = Math.max(0.05, ev.dur - s);
    }
  }
  events.sort((a, b) => a.beat - b.beat);
  const total = beat;
  if (loopFrom === undefined) introBeats = total;
  return { song, introBeats, loopBeats: total - introBeats, totalBeats: total, events, sectionStarts };
}

/** Off-beat eighths are delayed by `swing` × half a beat. */
function swingShift(song: Song, beat: number): number {
  if (!song.swing) return 0;
  const frac = beat - Math.floor(beat);
  return Math.abs(frac - 0.5) < EPS ? song.swing * 0.5 : 0;
}

/** Length of a song's loop region in seconds (one-shots: whole length). */
export function songSeconds(c: CompiledSong): { intro: number; loop: number } {
  const spb = beatSeconds(c.song.bpm);
  return { intro: c.introBeats * spb, loop: c.loopBeats * spb };
}
