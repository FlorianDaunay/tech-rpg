/**
 * Instrument library. Each instrument renders one note into `out` and returns its Voice.
 * Gains are calibrated so that a track gain of ~0.5 sits well in the mix.
 */
import { midiToFreq } from "../theory";
import type { InstrumentId, InstrumentParams } from "../music/types";
import { adsr, type Ctx, filter, gain, ksBuffer, lfo, makeVoice, noise, osc, panner, perc, sweep, type Voice } from "./core";

export interface NoteOpts {
  t: number;
  dur: number;
  /** NaN for unpitched hits. */
  midi: number;
  vel: number;
  params: InstrumentParams;
  rnd: () => number;
}

export type InstrumentFn = (ctx: Ctx, out: AudioNode, n: NoteOpts) => Voice;

const hz = (n: NoteOpts, fallback: number) =>
  Number.isFinite(n.midi) ? midiToFreq(n.midi + (n.params.transpose ?? 0)) : fallback;

/** Lower notes get a lower cutoff so chords stay warm. */
const keyTrack = (f: number, base: number) => base * Math.pow(f / 261.6, 0.35);

// ---------------------------------------------------------------- sustained

/** Detuned saw pad, slow attack, breathing lowpass. Stereo spread by panning the outer saws. */
const pad: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 220);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const lp = filter(ctx, "lowpass", 200, 0.9, n.t);
  const cutoff = keyTrack(f, p.cutoff ?? 1400) * (0.7 + 0.5 * n.vel);
  lp.frequency.setValueAtTime(cutoff * 0.35, n.t);
  lp.frequency.setTargetAtTime(cutoff, n.t, (p.attack ?? 1.2) * 0.6);
  const det = p.detune ?? 9;
  const spread = [-1, 0, 1];
  for (const s of spread) {
    const o = v.add(osc(ctx, "sawtooth", f, n.t, s * det + (n.rnd() - 0.5) * 4));
    if (s === 0) o.connect(lp);
    else o.connect(panner(ctx, s * 0.55)).connect(lp);
  }
  const sub = v.add(osc(ctx, "triangle", f / 2, n.t));
  sub.connect(gain(ctx, 0.35)).connect(lp);
  v.add(lfo(ctx, 0.12 + n.rnd() * 0.1, 260, lp.detune, n.t));
  lp.connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 1), { a: p.attack ?? 1.2, d: 1.5, s: 0.85, r: p.release ?? 2.2 }, 0.075 * n.vel);
  return v.finish(end);
};

/** Softer pad from triangles: hearth warmth for the hub. */
const warmPad: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 220);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const lp = filter(ctx, "lowpass", keyTrack(f, p.cutoff ?? 1800), 0.5, n.t);
  const det = p.detune ?? 6;
  for (const s of [-1, 1]) {
    v.add(osc(ctx, "triangle", f, n.t, s * det)).connect(panner(ctx, s * 0.5)).connect(lp);
  }
  v.add(osc(ctx, "sawtooth", f, n.t, 3)).connect(gain(ctx, 0.25)).connect(lp);
  const trem = gain(ctx, 1);
  v.add(lfo(ctx, 4.5, 0.06, trem.gain, n.t)); // tiny tremolo, like a bowed organ
  lp.connect(trem).connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 1), { a: p.attack ?? 0.6, d: 1, s: 0.8, r: p.release ?? 1.6 }, 0.11 * n.vel);
  return v.finish(end);
};

const VOWELS: Record<string, [number, number, number][]> = {
  // [freq, gain, Q] for three formants
  a: [[800, 1, 9], [1150, 0.5, 10], [2900, 0.18, 12]],
  o: [[450, 1, 9], [800, 0.45, 10], [2830, 0.12, 12]],
  u: [[325, 1, 9], [700, 0.3, 10], [2530, 0.08, 12]],
  e: [[400, 1, 9], [1700, 0.35, 11], [2600, 0.15, 12]],
};

/** Choir "ahh": two detuned saws with delayed vibrato into three formant bandpasses. */
const choir: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 220);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const src = gain(ctx, 1);
  for (const d of [-8, 7]) {
    const o = v.add(osc(ctx, "sawtooth", f, n.t, d + (n.rnd() - 0.5) * 6));
    // Vibrato with a slow onset.
    const vib = gain(ctx, 0);
    vib.gain.setValueAtTime(0, n.t);
    vib.gain.linearRampToValueAtTime(14, n.t + 0.9);
    v.add(osc(ctx, "sine", 4.6 + n.rnd() * 0.8, n.t)).connect(vib).connect(o.detune);
    o.connect(src);
  }
  const sum = gain(ctx, 1);
  for (const [ff, g, q] of VOWELS[p.vowel ?? "a"]!) {
    src.connect(filter(ctx, "bandpass", ff, q, n.t)).connect(gain(ctx, g * 2.2)).connect(sum);
  }
  const lp = filter(ctx, "lowpass", p.cutoff ?? 3500, 0.5, n.t);
  sum.connect(lp).connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 1), { a: p.attack ?? 0.5, d: 1, s: 0.9, r: p.release ?? 1.4 }, 0.09 * n.vel);
  return v.finish(end);
};

/** Low drone: octave-down saws + sub sine, very dark, slowly moving filter. */
const drone: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 55);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const lp = filter(ctx, "lowpass", p.cutoff ?? 320, 2, n.t);
  for (const d of [-6, 6]) v.add(osc(ctx, "sawtooth", f, n.t, d)).connect(lp);
  v.add(osc(ctx, "sine", f / 2, n.t)).connect(gain(ctx, 1.4)).connect(amp);
  v.add(lfo(ctx, 0.07 + n.rnd() * 0.05, 500, lp.detune, n.t, "triangle"));
  lp.connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 1), { a: p.attack ?? 2.5, d: 2, s: 0.9, r: p.release ?? 3 }, 0.09 * n.vel);
  return v.finish(end);
};

/** Bowed strings: three saws, band-limited, gentle vibrato. Good for legato lines. */
const strings: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 440);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const hp = filter(ctx, "highpass", 180, 0.5, n.t);
  const lp = filter(ctx, "lowpass", keyTrack(f, p.cutoff ?? 2600) * (0.6 + 0.6 * n.vel), 0.6, n.t);
  const vib = gain(ctx, 0);
  vib.gain.setValueAtTime(0, n.t);
  vib.gain.linearRampToValueAtTime(11, n.t + 0.5);
  const vibOsc = v.add(osc(ctx, "sine", 5.3 + n.rnd() * 0.4, n.t));
  vibOsc.connect(vib);
  for (const d of [-7, 0, 7]) {
    const o = v.add(osc(ctx, "sawtooth", f, n.t, d));
    vib.connect(o.detune);
    o.connect(hp);
  }
  hp.connect(lp).connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 1), { a: p.attack ?? 0.18, d: 0.6, s: 0.85, r: p.release ?? 0.6 }, 0.06 * n.vel);
  return v.finish(end);
};

/** Wooden flute: sine + soft 2nd/3rd harmonics, breath noise, pitch scoop, delayed vibrato. */
const flute: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 660);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const body = gain(ctx, 1);
  const vib = gain(ctx, 0);
  vib.gain.setValueAtTime(0, n.t);
  vib.gain.setValueAtTime(0, n.t + 0.25);
  vib.gain.linearRampToValueAtTime(13, n.t + 0.7);
  v.add(osc(ctx, "sine", 5.1 + n.rnd() * 0.4, n.t)).connect(vib);
  const parts: [OscillatorType, number, number][] = [["sine", 1, 1], ["triangle", 2, 0.12], ["sine", 3, 0.05]];
  for (const [type, mult, g] of parts) {
    const o = v.add(osc(ctx, type, f * mult, n.t));
    o.detune.setValueAtTime(-35, n.t);
    o.detune.linearRampToValueAtTime(0, n.t + 0.06);
    vib.connect(o.detune);
    o.connect(gain(ctx, g)).connect(body);
  }
  const breath = v.add(noise(ctx, "white", n.t, n.rnd));
  breath.connect(filter(ctx, "bandpass", f * 2, 1.5, n.t)).connect(gain(ctx, 0.12 * (p.bright ?? 1))).connect(body);
  body.connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 0.95), { a: p.attack ?? 0.07, d: 0.4, s: 0.8, r: p.release ?? 0.35 }, 0.13 * n.vel);
  return v.finish(end);
};

/** Brass horn: saws through a lowpass that opens with velocity (the "blat" of the attack). */
const horn: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 220);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const lp = filter(ctx, "lowpass", 200, 1.2, n.t);
  const top = Math.min(6000, f * (2.5 + 3 * n.vel * (p.bright ?? 0.7)));
  lp.frequency.setValueAtTime(f * 0.8, n.t);
  lp.frequency.linearRampToValueAtTime(top, n.t + 0.07);
  lp.frequency.setTargetAtTime(top * 0.6, n.t + 0.07, 0.25);
  for (const d of [-5, 5]) {
    const o = v.add(osc(ctx, "sawtooth", f, n.t, d));
    o.detune.setValueAtTime(d - 25, n.t);
    o.detune.linearRampToValueAtTime(d, n.t + 0.05);
    o.connect(lp);
  }
  lp.connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 0.9), { a: p.attack ?? 0.05, d: 0.4, s: 0.75, r: p.release ?? 0.4 }, 0.09 * n.vel);
  return v.finish(end);
};

/** Glass harmonica: pure sines with slow beating and tremolo. Eerie. */
const glass: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 880);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const trem = gain(ctx, 1);
  v.add(lfo(ctx, 3 + n.rnd() * 1.5, 0.25, trem.gain, n.t));
  v.add(osc(ctx, "sine", f, n.t)).connect(trem);
  v.add(osc(ctx, "sine", f * 1.003, n.t)).connect(gain(ctx, 0.6)).connect(trem);
  v.add(osc(ctx, "sine", f * 2.005, n.t)).connect(gain(ctx, 0.12)).connect(trem);
  trem.connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 1), { a: p.attack ?? 0.35, d: 1, s: 0.7, r: p.release ?? 1.5 }, 0.07 * n.vel);
  return v.finish(end);
};

// ---------------------------------------------------------------- plucked & struck

/** Karplus-Strong lute/pluck. */
const pluck: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 330);
  const v = makeVoice(ctx, out);
  const src = v.add(ctx.createBufferSource());
  src.buffer = ksBuffer(ctx, f, p.bright ?? 0.55, f < 200 ? 2.6 : 1.8);
  const lp = filter(ctx, "lowpass", Math.min(9000, f * (4 + 6 * n.vel)), 0.5, n.t);
  const amp = gain(ctx, 0.32 * n.vel);
  src.connect(lp).connect(amp).connect(v.out);
  src.start(n.t);
  const ring = Math.max(n.dur * (p.gate ?? 1.6), 0.25);
  amp.gain.setTargetAtTime(0, n.t + ring, (p.release ?? 0.4) / 5);
  return v.finish(Math.min(n.t + (src.buffer.duration), n.t + ring + (p.release ?? 0.4)));
};

/** Harp: softer excitation, longer ring, a faint octave sine for body. */
const harp: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 330);
  const v = makeVoice(ctx, out);
  const src = v.add(ctx.createBufferSource());
  src.buffer = ksBuffer(ctx, f, p.bright ?? 0.3, 3);
  const amp = gain(ctx, 0.3 * n.vel);
  src.connect(amp).connect(v.out);
  src.start(n.t);
  const body = v.add(osc(ctx, "sine", f, n.t));
  const bg = gain(ctx, 0);
  perc(bg.gain, n.t, 0.06 * n.vel, 0.004, 0.5);
  body.connect(bg).connect(v.out);
  const ring = Math.max(n.dur * (p.gate ?? 3), 0.5);
  amp.gain.setTargetAtTime(0, n.t + ring, 0.2);
  return v.finish(Math.min(n.t + 3, n.t + ring + 1));
};

/** Celesta / music box: 2-op FM with a decaying index plus a quiet octave partial. The main-theme voice. */
const celesta: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 880);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const car = v.add(osc(ctx, "sine", f, n.t, (n.rnd() - 0.5) * 4));
  const mod = v.add(osc(ctx, "sine", f * 3, n.t));
  const idx = gain(ctx, 0);
  const bright = p.bright ?? 0.6;
  idx.gain.setValueAtTime(f * (0.6 + 1.6 * bright) * n.vel, n.t);
  idx.gain.setTargetAtTime(f * 0.08, n.t, 0.12);
  mod.connect(idx).connect(car.frequency);
  car.connect(amp);
  const oct = v.add(osc(ctx, "sine", f * 2, n.t));
  const og = gain(ctx, 0);
  perc(og.gain, n.t, 0.035 * n.vel, 0.002, 0.25);
  oct.connect(og).connect(v.out);
  const tau = (p.release ?? 1.4) / (1 + f / 1500);
  const end = perc(amp.gain, n.t, 0.16 * n.vel, 0.003, tau);
  return v.finish(Math.min(end, n.t + 4));
};

/** Small glass/tubular bell: inharmonic FM (ratio 3.5). */
const bell: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 660);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const car = v.add(osc(ctx, "sine", f, n.t));
  const mod = v.add(osc(ctx, "sine", f * 3.5, n.t));
  const idx = gain(ctx, 0);
  idx.gain.setValueAtTime(f * 2.2 * n.vel * (p.bright ?? 1), n.t);
  idx.gain.setTargetAtTime(f * 0.3, n.t, 0.6);
  mod.connect(idx).connect(car.frequency);
  car.connect(amp).connect(v.out);
  const end = perc(amp.gain, n.t, 0.1 * n.vel, 0.002, p.release ?? 1.2);
  return v.finish(end);
};

/** Large church bell toll: additive partials with the classic minor-third "tierce" and beating hum. */
const toll: InstrumentFn = (ctx, out, n) => {
  const f = hz(n, 196);
  const v = makeVoice(ctx, out);
  const partials: [number, number, number][] = [
    [0.5, 0.55, 7],
    [0.501, 0.3, 7],
    [1, 0.5, 4.5],
    [1.183, 0.42, 3.8],
    [1.506, 0.22, 2.6],
    [2, 0.35, 3],
    [2.514, 0.16, 1.6],
    [2.662, 0.12, 1.3],
    [3.011, 0.1, 1],
    [4.166, 0.06, 0.6],
  ];
  let end = n.t;
  for (const [ratio, a, tau] of partials) {
    const o = v.add(osc(ctx, "sine", f * ratio, n.t));
    const g = gain(ctx, 0);
    end = Math.max(end, perc(g.gain, n.t, a * 0.09 * n.vel, 0.004, tau / 3));
    o.connect(g).connect(v.out);
  }
  const strike = v.add(noise(ctx, "white", n.t, n.rnd));
  const sg = gain(ctx, 0);
  perc(sg.gain, n.t, 0.05 * n.vel, 0.001, 0.015);
  strike.connect(filter(ctx, "bandpass", f * 4, 2, n.t)).connect(sg).connect(v.out);
  return v.finish(Math.min(end, n.t + 9));
};

// ---------------------------------------------------------------- bass

const bass: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 55);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  const lp = filter(ctx, "lowpass", 100, 1.1, n.t);
  const top = (p.cutoff ?? 700) * (0.6 + 0.6 * n.vel);
  lp.frequency.setValueAtTime(top, n.t);
  lp.frequency.setTargetAtTime(top * 0.4, n.t, 0.12);
  v.add(osc(ctx, "sawtooth", f, n.t, 3)).connect(lp);
  v.add(osc(ctx, "sine", f, n.t)).connect(gain(ctx, 1.6)).connect(amp);
  lp.connect(amp).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 0.9), { a: p.attack ?? 0.008, d: 0.3, s: 0.7, r: p.release ?? 0.15 }, 0.16 * n.vel);
  return v.finish(end);
};

const subBass: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const f = hz(n, 41);
  const v = makeVoice(ctx, out);
  const amp = gain(ctx, 0);
  v.add(osc(ctx, "sine", f, n.t)).connect(amp);
  v.add(osc(ctx, "triangle", f * 2, n.t)).connect(gain(ctx, 0.15)).connect(amp);
  amp.connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur * (p.gate ?? 1), { a: p.attack ?? 0.05, d: 0.5, s: 0.85, r: p.release ?? 0.6 }, 0.22 * n.vel);
  return v.finish(end);
};

// ---------------------------------------------------------------- percussion

const kick: InstrumentFn = (ctx, out, n) => {
  const v = makeVoice(ctx, out);
  const o = v.add(osc(ctx, "sine", 150, n.t));
  sweep(o.frequency, n.t, 140 + n.rnd() * 10, 44, 0.12);
  const g = gain(ctx, 0);
  const end = perc(g.gain, n.t, 0.55 * n.vel, 0.002, 0.13);
  o.connect(g).connect(v.out);
  const click = v.add(noise(ctx, "white", n.t, n.rnd));
  const cg = gain(ctx, 0);
  perc(cg.gain, n.t, 0.05 * n.vel, 0.001, 0.004);
  click.connect(filter(ctx, "highpass", 2500, 0.7, n.t)).connect(cg).connect(v.out);
  return v.finish(end);
};

const snare: InstrumentFn = (ctx, out, n) => {
  const v = makeVoice(ctx, out);
  const nz = v.add(noise(ctx, "white", n.t, n.rnd));
  const ng = gain(ctx, 0);
  const end = perc(ng.gain, n.t, 0.22 * n.vel, 0.001, 0.06 + 0.04 * n.vel);
  nz.connect(filter(ctx, "highpass", 900, 0.7, n.t)).connect(filter(ctx, "peaking", 3500, 1, n.t)).connect(ng).connect(v.out);
  const tone = v.add(osc(ctx, "triangle", 200, n.t));
  sweep(tone.frequency, n.t, 210, 160, 0.06);
  const tg = gain(ctx, 0);
  perc(tg.gain, n.t, 0.2 * n.vel, 0.001, 0.035);
  tone.connect(tg).connect(v.out);
  return v.finish(end);
};

const hat: InstrumentFn = (ctx, out, n) => {
  const v = makeVoice(ctx, out);
  const nz = v.add(noise(ctx, "white", n.t, n.rnd));
  const g = gain(ctx, 0);
  const end = perc(g.gain, n.t, 0.09 * n.vel, 0.001, 0.012 + 0.03 * n.vel * n.vel);
  nz.connect(filter(ctx, "highpass", 7000, 0.7, n.t)).connect(filter(ctx, "bandpass", 10000, 0.8, n.t)).connect(g).connect(v.out);
  return v.finish(end);
};

const shaker: InstrumentFn = (ctx, out, n) => {
  const v = makeVoice(ctx, out);
  const nz = v.add(noise(ctx, "white", n.t, n.rnd));
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0, n.t);
  g.gain.linearRampToValueAtTime(0.06 * n.vel, n.t + 0.018);
  g.gain.setTargetAtTime(0, n.t + 0.018, 0.025);
  nz.connect(filter(ctx, "bandpass", 6000, 1.2, n.t)).connect(g).connect(v.out);
  return v.finish(n.t + 0.2);
};

/** Big taiko: pitch-dropping body + skin slap. Pitched if a note is given (default ~70 Hz). */
const taiko: InstrumentFn = (ctx, out, n) => {
  const f = hz(n, 72);
  const v = makeVoice(ctx, out);
  const body = v.add(osc(ctx, "sine", f, n.t));
  sweep(body.frequency, n.t, f * 1.6, f, 0.07);
  const bg = gain(ctx, 0);
  const end = perc(bg.gain, n.t, 0.6 * n.vel, 0.002, 0.22 + 0.1 * n.vel);
  body.connect(bg).connect(v.out);
  const over = v.add(osc(ctx, "triangle", f * 2.3, n.t));
  sweep(over.frequency, n.t, f * 3.2, f * 2.2, 0.05);
  const og = gain(ctx, 0);
  perc(og.gain, n.t, 0.12 * n.vel, 0.002, 0.08);
  over.connect(og).connect(v.out);
  const slap = v.add(noise(ctx, "pink", n.t, n.rnd));
  const sg = gain(ctx, 0);
  perc(sg.gain, n.t, 0.35 * n.vel, 0.001, 0.025);
  slap.connect(filter(ctx, "lowpass", 1400, 0.8, n.t)).connect(sg).connect(v.out);
  return v.finish(end);
};

/** Frame drum / low tom. */
const frame: InstrumentFn = (ctx, out, n) => {
  const f = hz(n, 140);
  const v = makeVoice(ctx, out);
  const body = v.add(osc(ctx, "sine", f, n.t));
  sweep(body.frequency, n.t, f * 1.4, f, 0.05);
  const bg = gain(ctx, 0);
  const end = perc(bg.gain, n.t, 0.35 * n.vel, 0.002, 0.12);
  body.connect(bg).connect(v.out);
  const slap = v.add(noise(ctx, "pink", n.t, n.rnd));
  const sg = gain(ctx, 0);
  perc(sg.gain, n.t, 0.2 * n.vel, 0.001, 0.02);
  slap.connect(filter(ctx, "bandpass", 900, 1, n.t)).connect(sg).connect(v.out);
  return v.finish(end);
};

/** Metallic clank (anvil, chains, pickaxe on rock): inharmonic square partials through a resonant bandpass. */
const metal: InstrumentFn = (ctx, out, n) => {
  const f = hz(n, 420);
  const v = makeVoice(ctx, out);
  const bp = filter(ctx, "bandpass", f * 3, 3, n.t);
  const hp = filter(ctx, "highpass", 400, 0.7, n.t);
  const g = gain(ctx, 0);
  for (const r of [1, 1.47, 2.09, 2.56, 3.71]) v.add(osc(ctx, "square", f * r * (1 + (n.rnd() - 0.5) * 0.01), n.t)).connect(bp);
  const end = perc(g.gain, n.t, 0.07 * n.vel, 0.001, 0.08 + 0.12 * n.vel);
  bp.connect(hp).connect(g).connect(v.out);
  const tick = v.add(noise(ctx, "white", n.t, n.rnd));
  const tg = gain(ctx, 0);
  perc(tg.gain, n.t, 0.12 * n.vel, 0.001, 0.006);
  tick.connect(filter(ctx, "highpass", 3000, 0.7, n.t)).connect(tg).connect(v.out);
  return v.finish(end);
};

/** Heartbeat "lub-dub" (tension stem). */
const heartbeat: InstrumentFn = (ctx, out, n) => {
  const v = makeVoice(ctx, out);
  const lp = filter(ctx, "lowpass", 180, 0.7, n.t);
  lp.connect(v.out);
  let end = n.t;
  for (const [dt, a] of [[0, 1], [0.22, 0.6]] as const) {
    const o = v.add(osc(ctx, "sine", 62, n.t + dt));
    sweep(o.frequency, n.t + dt, 70, 42, 0.12);
    const g = gain(ctx, 0);
    end = perc(g.gain, n.t + dt, 0.7 * a * n.vel, 0.008, 0.06);
    o.connect(g).connect(lp);
  }
  return v.finish(end);
};

/** Whispered noise texture: noise through moving vowel formants. Pitch shifts the formants slightly. */
const whisper: InstrumentFn = (ctx, out, n) => {
  const p = n.params;
  const v = makeVoice(ctx, out);
  const shift = Number.isFinite(n.midi) ? Math.pow(2, (n.midi - 60) / 24) : 1;
  const src = v.add(noise(ctx, "pink", n.t, n.rnd));
  const amp = gain(ctx, 0);
  const sum = gain(ctx, 1);
  const vowels = ["a", "o", "e", "u"] as const;
  const vw = VOWELS[vowels[Math.floor(n.rnd() * vowels.length)]!]!;
  const pan = panner(ctx, (n.rnd() - 0.5) * 1.4);
  for (const [ff, g, q] of vw) {
    const bp = filter(ctx, "bandpass", ff * shift, q * 0.6, n.t);
    bp.frequency.linearRampToValueAtTime(ff * shift * (0.8 + n.rnd() * 0.4), n.t + n.dur);
    src.connect(bp).connect(gain(ctx, g)).connect(sum);
  }
  const trem = gain(ctx, 1);
  v.add(lfo(ctx, 5 + n.rnd() * 4, 0.4, trem.gain, n.t));
  sum.connect(trem).connect(amp).connect(pan).connect(v.out);
  const end = adsr(amp.gain, n.t, n.dur, { a: p.attack ?? 0.4, d: 0.5, s: 0.8, r: p.release ?? 0.8 }, 0.5 * n.vel);
  return v.finish(end);
};

export const INSTRUMENTS: Record<InstrumentId, InstrumentFn> = {
  pad,
  warmPad,
  choir,
  pluck,
  harp,
  celesta,
  bell,
  toll,
  bass,
  subBass,
  drone,
  flute,
  horn,
  strings,
  glass,
  kick,
  snare,
  hat,
  taiko,
  frame,
  metal,
  shaker,
  heartbeat,
  whisper,
};
