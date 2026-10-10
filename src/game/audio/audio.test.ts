import { describe, expect, it } from "vitest";
import { compileSong, parsePattern, parseToken, songSeconds } from "./music/pattern";
import { Lookahead, type Timer } from "./music/scheduler";
import { SONGS } from "./music/songs";
import { encodeWav, levels } from "./render";
import { spatialize } from "./sfx";
import { chordNotes, midiToFreq, midiToNote, noteToMidi, quantizeToScale, scaleDegree } from "./theory";

describe("theory", () => {
  it("parses note names", () => {
    expect(noteToMidi("C4")).toBe(60);
    expect(noteToMidi("A4")).toBe(69);
    expect(noteToMidi("Eb3")).toBe(51);
    expect(noteToMidi("F#5")).toBe(78);
    expect(() => noteToMidi("H2")).toThrow();
    expect(midiToNote(61)).toBe("C#4");
  });

  it("converts to equal-tempered frequencies", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });

  it("walks scales and quantizes", () => {
    expect(scaleDegree(62, "dorian", 0)).toBe(62);
    expect(scaleDegree(62, "dorian", 7)).toBe(74);
    expect(scaleDegree(62, "dorian", -1)).toBe(60);
    expect(quantizeToScale(61, 60, "major")).toBe(60); // tie goes down
    expect(quantizeToScale(66, 60, "minor")).toBe(65);
  });

  it("builds chords with slash basses", () => {
    expect(chordNotes("Dm", 4)).toEqual([62, 65, 69]);
    expect(chordNotes("Dm/A", 4)).toEqual([57, 62, 65, 69]);
    expect(() => chordNotes("Dxyz", 4)).toThrow();
  });
});

describe("pattern", () => {
  it("parses tokens", () => {
    expect(parseToken("-")).toEqual({ kind: "rest" });
    expect(parseToken(".")).toEqual({ kind: "hold" });
    expect(parseToken("X")).toEqual({ kind: "hit", notes: [], vel: 1 });
    expect(parseToken("C4+E4:9")).toEqual({ kind: "hit", notes: [60, 64], vel: 1 });
    expect(() => parseToken("Q4")).toThrow();
  });

  it("splits bars", () => {
    expect(parsePattern("C4 . - - | D4 - - -").map((b) => b.length)).toEqual([4, 4]);
  });

  it("every song compiles and has a sane length", () => {
    for (const song of Object.values(SONGS)) {
      const c = compileSong(song);
      expect(c.events.length, song.id).toBeGreaterThan(0);
      const { intro, loop } = songSeconds(c);
      expect(intro + loop, song.id).toBeGreaterThan(2);
      expect(intro + loop, song.id).toBeLessThan(240);
      // Events are sorted and inside the song.
      for (let i = 1; i < c.events.length; i++) expect(c.events[i]!.beat).toBeGreaterThanOrEqual(c.events[i - 1]!.beat);
      expect(c.events.at(-1)!.beat).toBeLessThan(c.totalBeats + 1e-6);
    }
  });
});

describe("lookahead scheduler", () => {
  const fake = () => {
    let fn: (() => void) | null = null;
    const timer: Timer = { set: (f) => ((fn = f), 1), clear: () => (fn = null) };
    return { timer, fire: () => fn?.() };
  };

  it("hands out contiguous windows without gaps or overlaps", () => {
    let now = 0;
    const windows: [number, number][] = [];
    const t = fake();
    const la = new Lookahead({ clock: { now: () => now }, timer: t.timer, lookahead: 0.1, onWindow: (a, b) => windows.push([a, b]) });
    la.start();
    for (let i = 0; i < 10; i++) {
      now += 0.025;
      t.fire();
    }
    expect(windows[0]).toEqual([0, 0.1]);
    for (let i = 1; i < windows.length; i++) expect(windows[i]![0]).toBeCloseTo(windows[i - 1]![1]);
    expect(la.scheduledUntil).toBeCloseTo(now + 0.1);
  });

  it("skips ahead after a starved timer instead of bursting late notes", () => {
    let now = 0;
    const windows: [number, number][] = [];
    const t = fake();
    const la = new Lookahead({ clock: { now: () => now }, timer: t.timer, maxLate: 0.2, onWindow: (a, b) => windows.push([a, b]) });
    la.start();
    now = 5;
    t.fire();
    expect(windows.at(-1)![0]).toBe(5);
  });
});

describe("sfx spatialization", () => {
  it("is full volume at the listener, panned by side, silent far away", () => {
    const l = { x: 0, y: 0 };
    expect(spatialize(l, 0, 0)!.gain).toBeCloseTo(1);
    expect(spatialize(l, -200, 0)!.pan).toBeLessThan(0);
    expect(spatialize(l, 200, 0)!.pan).toBeGreaterThan(0);
    expect(spatialize(l, 400, 0)!.gain).toBeLessThan(spatialize(l, 100, 0)!.gain);
    expect(spatialize(l, 5000, 0)).toBeNull();
  });
});

describe("wav encoding", () => {
  it("writes a valid 16-bit header and clamps samples", () => {
    const wav = encodeWav([new Float32Array([0, 1, -2]), new Float32Array([0.5, 0, 0])], 22050);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(40, true)).toBe(3 * 2 * 2);
    expect(v.getInt16(48, true)).toBe(0x7fff);
    expect(v.getInt16(52, true)).toBe(-0x8000);
  });

  it("measures levels", () => {
    expect(levels([new Float32Array([0.5, -0.5])]).peakDb).toBeCloseTo(-6.02, 1);
  });
});
