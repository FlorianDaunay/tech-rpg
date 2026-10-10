/**
 * Named sound-effect presets. Every call is slightly randomised (pitch, timing, filter) so repeats feel organic.
 * A preset builds its graph through a small Kit that tracks sources and the end time.
 */
import type { AudioEngine, BusId, Sends } from "./AudioEngine";
import { type Ctx, filter, gain, ksBuffer, makeVoice, noise, osc, panner, type NoiseColor, type Voice } from "./synth/core";
import { clamp, noteToFreq } from "./theory";

export const SFX_NAMES = [
  // ui
  "ui-hover", "ui-click", "ui-confirm", "ui-back", "ui-error", "ui-open", "ui-close", "notify", "quest-complete", "level-up",
  // combat
  "swing-light", "swing-heavy", "swing-charge", "hit-flesh", "hit-armor", "hit-crit", "parry", "perfect-parry", "block",
  "dodge", "footstep-grass", "footstep-stone", "hurt", "death", "enemy-die", "telegraph", "projectile", "explosion",
  // elements
  "ember-burst", "frost-shatter", "storm-zap", "hollow-pulse",
  // world
  "pickup-coin", "pickup-item", "pickup-rare", "chest-open", "door", "lantern-hum", "portal",
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export interface SfxOptions {
  /** World position: panned and attenuated relative to the listener. */
  x?: number;
  y?: number;
  /** Linear volume multiplier (default 1). */
  volume?: number;
  /** Pitch multiplier (default 1). */
  pitch?: number;
  /** Explicit stereo pan -1..1 (ignored when x/y given). */
  pan?: number;
  /** Delay in seconds. */
  delay?: number;
  /** For swing-charge: riser length in seconds. */
  duration?: number;
}

export interface SfxHandle {
  /** Fade out and stop (required for loops like lantern-hum). */
  stop(fade?: number): void;
}

interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** Glide target frequency and time. */
  to?: number;
  glide?: number;
  at?: number;
  a?: number;
  /** Exponential decay time constant. */
  tau: number;
  peak: number;
  detune?: number;
  dest?: AudioNode;
}

interface NoiseOpts {
  color?: NoiseColor;
  type?: BiquadFilterType;
  f: number;
  to?: number;
  glide?: number;
  q?: number;
  at?: number;
  a?: number;
  tau: number;
  peak: number;
  dest?: AudioNode;
}

export class Kit {
  end: number;
  constructor(readonly ctx: Ctx, readonly out: AudioNode, readonly t: number, readonly rnd: () => number, readonly voice: Voice, readonly pitch: number) {
    this.end = t;
  }

  /** Random factor around 1: ±spread/2. */
  vary(spread: number) {
    return 1 + (this.rnd() - 0.5) * spread;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.rnd() * xs.length)]!;
  }
  mark(end: number) {
    this.end = Math.max(this.end, end);
  }
  node(g = 1, dest: AudioNode = this.out): GainNode {
    const n = gain(this.ctx, g);
    n.connect(dest);
    return n;
  }
  pan(p: number, dest: AudioNode = this.out): AudioNode {
    const n = panner(this.ctx, p);
    n.connect(dest);
    return n;
  }

  /** Oscillator with percussive envelope and optional exponential glide. */
  tone(o: ToneOpts): { osc: OscillatorNode; amp: GainNode } {
    const t = this.t + (o.at ?? 0);
    const f = o.f * this.pitch;
    const s = this.voice.add(osc(this.ctx, o.type ?? "sine", f, t, o.detune ?? 0));
    if (o.to !== undefined) s.frequency.exponentialRampToValueAtTime(Math.max(1, o.to * this.pitch), t + (o.glide ?? o.tau * 2));
    const amp = gain(this.ctx, 0);
    const a = o.a ?? 0.002;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(o.peak, t + a);
    amp.gain.setTargetAtTime(0, t + a, o.tau);
    s.connect(amp).connect(o.dest ?? this.out);
    this.mark(t + a + o.tau * 6);
    return { osc: s, amp };
  }

  /** Filtered noise burst with optional filter glide. */
  noise(o: NoiseOpts): { filt: BiquadFilterNode; amp: GainNode } {
    const t = this.t + (o.at ?? 0);
    const src = this.voice.add(noise(this.ctx, o.color ?? "white", t, this.rnd));
    const filt = filter(this.ctx, o.type ?? "bandpass", o.f, o.q ?? 1, t);
    if (o.to !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.glide ?? o.tau * 2));
    const amp = gain(this.ctx, 0);
    const a = o.a ?? 0.002;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(o.peak, t + a);
    amp.gain.setTargetAtTime(0, t + a, o.tau);
    src.connect(filt).connect(amp).connect(o.dest ?? this.out);
    this.mark(t + a + o.tau * 6);
    return { filt, amp };
  }

  /** Two-operator FM ping (bells, chimes, glints). */
  fm(o: { f: number; ratio: number; index: number; indexTau?: number; at?: number; tau: number; peak: number; dest?: AudioNode }) {
    const t = this.t + (o.at ?? 0);
    const f = o.f * this.pitch;
    const car = this.voice.add(osc(this.ctx, "sine", f, t));
    const mod = this.voice.add(osc(this.ctx, "sine", f * o.ratio, t));
    const idx = gain(this.ctx, 0);
    idx.gain.setValueAtTime(f * o.index, t);
    idx.gain.setTargetAtTime(f * o.index * 0.1, t, o.indexTau ?? o.tau * 0.4);
    mod.connect(idx).connect(car.frequency);
    const amp = gain(this.ctx, 0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(o.peak, t + 0.002);
    amp.gain.setTargetAtTime(0, t + 0.002, o.tau);
    car.connect(amp).connect(o.dest ?? this.out);
    this.mark(t + o.tau * 6);
  }

  /** Karplus-Strong pluck. */
  pluck(o: { f: number; at?: number; peak: number; bright?: number; decay?: number; dest?: AudioNode }) {
    const t = this.t + (o.at ?? 0);
    const src = this.voice.add(this.ctx.createBufferSource());
    src.buffer = ksBuffer(this.ctx, o.f * this.pitch, o.bright ?? 0.5, o.decay ?? 1.5);
    src.connect(gain(this.ctx, o.peak)).connect(o.dest ?? this.out);
    src.start(t);
    this.mark(t + src.buffer.duration);
  }

  /** Sustained detuned-saw swell (chords under jingles, portals). */
  swell(o: { f: number; at?: number; a: number; hold: number; r: number; peak: number; cutoff?: number; dest?: AudioNode }) {
    const t = this.t + (o.at ?? 0);
    const f = o.f * this.pitch;
    const lp = filter(this.ctx, "lowpass", o.cutoff ?? 1800, 0.6, t);
    const amp = gain(this.ctx, 0);
    for (const d of [-9, 0, 9]) this.voice.add(osc(this.ctx, "sawtooth", f, t, d)).connect(lp);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(o.peak, t + o.a);
    amp.gain.setTargetAtTime(0, t + o.a + o.hold, o.r / 5);
    lp.connect(amp).connect(o.dest ?? this.out);
    this.mark(t + o.a + o.hold + o.r);
  }

  /** Random short crackles (fire, debris, electricity). */
  crackle(o: { at?: number; span: number; count: number; peak: number; f?: number; dest?: AudioNode }) {
    for (let i = 0; i < o.count; i++) {
      this.noise({
        type: "bandpass",
        f: (o.f ?? 3000) * this.vary(0.8),
        q: 2,
        at: (o.at ?? 0) + this.rnd() * o.span,
        a: 0.0005,
        tau: 0.003 + this.rnd() * 0.006,
        peak: o.peak * (0.4 + this.rnd() * 0.6),
        dest: o.dest,
      });
    }
  }
}

interface Preset {
  bus: BusId;
  sends: Sends;
  /** Pitch randomisation spread (fraction). */
  vary?: number;
  loop?: boolean;
  play(k: Kit, o: SfxOptions): void;
}

const N = noteToFreq;

/** Generic blade whoosh: band-passed noise sweep up then down, plus an airy top layer. */
function whoosh(k: Kit, o: { lo: number; hi: number; dur: number; peak: number; at?: number; q?: number; color?: NoiseColor }) {
  const at = o.at ?? 0;
  const t = k.t + at;
  const src = k.voice.add(noise(k.ctx, o.color ?? "pink", t, k.rnd));
  const bp = filter(k.ctx, "bandpass", o.lo, o.q ?? 1.4, t);
  const peakT = t + o.dur * 0.42;
  bp.frequency.setValueAtTime(o.lo, t);
  bp.frequency.exponentialRampToValueAtTime(o.hi, peakT);
  bp.frequency.exponentialRampToValueAtTime(o.lo * 0.8, t + o.dur);
  const amp = gain(k.ctx, 0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(o.peak * 0.35, t + o.dur * 0.25);
  amp.gain.linearRampToValueAtTime(o.peak, peakT);
  amp.gain.setTargetAtTime(0, peakT, o.dur * 0.2);
  src.connect(bp).connect(amp).connect(k.out);
  // Air: high, thin, follows the same arc.
  const air = k.voice.add(noise(k.ctx, "white", t, k.rnd));
  const hp = filter(k.ctx, "highpass", o.hi * 1.6, 0.7, t);
  const ag = gain(k.ctx, 0);
  ag.gain.setValueAtTime(0, t);
  ag.gain.linearRampToValueAtTime(o.peak * 0.25, peakT);
  ag.gain.setTargetAtTime(0, peakT, o.dur * 0.12);
  air.connect(hp).connect(ag).connect(k.out);
  k.mark(t + o.dur * 2);
}

/** Meaty impact body: pitch-dropping sine + low-passed thump noise. */
function thud(k: Kit, o: { f: number; peak: number; tau?: number; at?: number }) {
  k.tone({ f: o.f, to: o.f * 0.45, glide: 0.09, tau: o.tau ?? 0.07, peak: o.peak, at: o.at });
  k.noise({ color: "brown", type: "lowpass", f: 900, q: 0.7, tau: 0.04, peak: o.peak * 1.2, at: o.at });
}

/** Ringing metal: inharmonic partials with individual decays. */
function ring(k: Kit, o: { f: number; peak: number; tau: number; at?: number; ratios?: number[]; dest?: AudioNode }) {
  const ratios = o.ratios ?? [1, 2.32, 3.87, 5.41, 6.8];
  ratios.forEach((r, i) => {
    k.tone({ f: o.f * r * k.vary(0.006), tau: o.tau / (1 + i * 0.45), peak: (o.peak / (1 + i * 0.7)) * (0.7 + k.rnd() * 0.3), at: o.at, dest: o.dest });
  });
}

/** Celesta-like chime note. */
function chime(k: Kit, f: number, at: number, peak: number, tau = 0.6, dest?: AudioNode) {
  k.fm({ f, ratio: 3, index: 1.6, indexTau: 0.1, at, tau, peak, dest });
  k.tone({ f: f * 2, at, tau: tau * 0.3, peak: peak * 0.2, dest });
}

const PRESETS: Record<SfxName, Preset> = {
  // ------------------------------------------------------------------ UI (in D, soft, musical)
  "ui-hover": {
    bus: "ui", sends: { room: 0.15 }, vary: 0.04,
    play: (k) => {
      k.tone({ type: "sine", f: 2350, tau: 0.012, peak: 0.05 });
      k.tone({ type: "triangle", f: 1175, tau: 0.02, peak: 0.03 });
    },
  },
  "ui-click": {
    bus: "ui", sends: { room: 0.2 }, vary: 0.05,
    play: (k) => {
      k.tone({ type: "triangle", f: 880, to: 600, glide: 0.03, tau: 0.018, peak: 0.16 });
      k.noise({ type: "bandpass", f: 3200, q: 1.5, tau: 0.006, peak: 0.12 });
    },
  },
  "ui-confirm": {
    bus: "ui", sends: { room: 0.3, delay: 0.1 },
    play: (k) => {
      chime(k, N("A5"), 0, 0.14, 0.35);
      chime(k, N("D6"), 0.07, 0.16, 0.5);
      k.noise({ type: "highpass", f: 6000, tau: 0.01, peak: 0.02 });
    },
  },
  "ui-back": {
    bus: "ui", sends: { room: 0.3 },
    play: (k) => {
      chime(k, N("D6"), 0, 0.1, 0.25);
      chime(k, N("A5"), 0.06, 0.11, 0.35);
    },
  },
  "ui-error": {
    bus: "ui", sends: { room: 0.25 },
    play: (k) => {
      const lp = filter(k.ctx, "lowpass", 900, 0.8, k.t);
      lp.connect(k.out);
      for (const at of [0, 0.11]) {
        k.tone({ type: "sawtooth", f: N("A#2"), tau: 0.05, peak: 0.12, at, dest: lp });
        k.tone({ type: "sawtooth", f: N("B2"), tau: 0.05, peak: 0.1, at, dest: lp });
        k.tone({ type: "sine", f: N("A#1"), tau: 0.06, peak: 0.25, at });
      }
    },
  },
  "ui-open": {
    bus: "ui", sends: { room: 0.3, hall: 0.1 },
    play: (k) => {
      k.noise({ color: "pink", f: 400, to: 2200, glide: 0.18, q: 1.2, a: 0.1, tau: 0.05, peak: 0.12 });
      k.pluck({ f: N("D5"), at: 0.08, peak: 0.12, bright: 0.4, decay: 0.8 });
      k.pluck({ f: N("A5"), at: 0.12, peak: 0.08, bright: 0.4, decay: 0.8 });
    },
  },
  "ui-close": {
    bus: "ui", sends: { room: 0.3 },
    play: (k) => {
      k.noise({ color: "pink", f: 2000, to: 380, glide: 0.16, q: 1.2, a: 0.04, tau: 0.06, peak: 0.1 });
      k.pluck({ f: N("A4"), at: 0.06, peak: 0.1, bright: 0.3, decay: 0.6 });
    },
  },
  notify: {
    bus: "ui", sends: { hall: 0.25, delay: 0.25 },
    play: (k) => {
      chime(k, N("E6"), 0, 0.12, 0.8);
      chime(k, N("A6"), 0.12, 0.1, 1);
    },
  },
  "quest-complete": {
    bus: "ui", sends: { hall: 0.4, delay: 0.15 },
    play: (k) => {
      // D minor → D major lift: the flame answers.
      const arp = ["D5", "F5", "A5", "D6", "F#6", "A6"];
      arp.forEach((n, i) => chime(k, N(n), i * 0.09, 0.11 - i * 0.008, 0.9));
      for (const n of ["D3", "A3", "F#4", "A4"]) k.swell({ f: N(n), at: 0.25, a: 0.5, hold: 0.7, r: 1.4, peak: 0.035, cutoff: 1500 });
      k.fm({ f: N("D4"), ratio: 3.5, index: 1.2, at: 0.25, tau: 1.2, peak: 0.08 });
      k.tone({ f: N("D2"), at: 0.25, a: 0.05, tau: 0.5, peak: 0.12 });
    },
  },
  "level-up": {
    bus: "ui", sends: { hall: 0.45, delay: 0.2 },
    play: (k) => {
      // Rising harp glissando over D (D E F# A B D...), then a wide major-9 bloom with sparkles.
      const gliss = ["D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5", "A5", "B5", "D6"];
      gliss.forEach((n, i) => k.pluck({ f: N(n), at: i * 0.045 + k.rnd() * 0.008, peak: 0.1 + i * 0.006, bright: 0.35, decay: 1.6 }));
      const bloom = 0.52;
      for (const n of ["D3", "A3", "E4", "F#4", "A4", "C#5"]) k.swell({ f: N(n), at: bloom, a: 0.25, hold: 0.9, r: 1.8, peak: 0.032, cutoff: 2600 });
      chime(k, N("A5"), bloom, 0.14, 1.1);
      chime(k, N("D6"), bloom + 0.05, 0.13, 1.2);
      chime(k, N("F#6"), bloom + 0.1, 0.11, 1.3);
      k.tone({ f: N("D2"), at: bloom, a: 0.03, tau: 0.45, peak: 0.22 });
      k.noise({ type: "lowpass", color: "brown", f: 600, at: bloom, tau: 0.08, peak: 0.25 });
      // Sparkles.
      for (let i = 0; i < 10; i++) {
        k.fm({ f: N(k.pick(["A6", "D7", "E7", "F#7"])) * k.vary(0.01), ratio: 2.01, index: 0.8, at: bloom + 0.1 + i * 0.07 + k.rnd() * 0.05, tau: 0.12, peak: 0.03 + k.rnd() * 0.02 });
      }
      k.noise({ type: "highpass", f: 7000, at: bloom - 0.2, a: 0.25, tau: 0.25, peak: 0.04 });
    },
  },

  // ------------------------------------------------------------------ combat
  "swing-light": {
    bus: "sfx", sends: { room: 0.15 }, vary: 0.14,
    play: (k) => {
      const p = k.vary(0.2);
      whoosh(k, { lo: 520 * p, hi: 2700 * p, dur: 0.2 * k.vary(0.2), peak: 0.38 });
      // Faint steel "shing" riding the swing.
      k.tone({ f: 3150 * p, at: 0.05, a: 0.03, tau: 0.06, peak: 0.012 });
      k.tone({ f: 4420 * p, at: 0.05, a: 0.03, tau: 0.04, peak: 0.008 });
    },
  },
  "swing-heavy": {
    bus: "sfx", sends: { room: 0.2 }, vary: 0.1,
    play: (k) => {
      const p = k.vary(0.15);
      whoosh(k, { lo: 260 * p, hi: 1500 * p, dur: 0.38, peak: 0.5, q: 1.1 });
      // Body of the blade moving air.
      const lp = filter(k.ctx, "lowpass", 300, 0.7, k.t);
      lp.connect(k.out);
      k.tone({ type: "triangle", f: 95, to: 60, glide: 0.3, a: 0.12, tau: 0.08, peak: 0.18, dest: lp });
      k.tone({ f: 2400 * p, at: 0.1, a: 0.06, tau: 0.08, peak: 0.01 });
    },
  },
  "swing-charge": {
    bus: "sfx", sends: { room: 0.2, hall: 0.15 },
    play: (k, o) => {
      const d = clamp(o.duration ?? 1, 0.3, 4);
      const t = k.t;
      // Rising filtered noise with tightening resonance.
      const src = k.voice.add(noise(k.ctx, "pink", t, k.rnd));
      const bp = filter(k.ctx, "bandpass", 250, 0.8, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + d);
      bp.Q.linearRampToValueAtTime(6, t + d);
      const ng = gain(k.ctx, 0);
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.35, t + d);
      ng.gain.setTargetAtTime(0, t + d, 0.05);
      src.connect(bp).connect(ng).connect(k.out);
      // Two detuned tones rising a fifth apart, with a shimmering tremolo.
      const lp = filter(k.ctx, "lowpass", 600, 1, t);
      lp.frequency.exponentialRampToValueAtTime(4000, t + d);
      const trem = gain(k.ctx, 1);
      const tl = k.voice.add(osc(k.ctx, "sine", 6, t));
      tl.frequency.linearRampToValueAtTime(18, t + d);
      tl.connect(gain(k.ctx, 0.35)).connect(trem.gain);
      const tg = gain(k.ctx, 0);
      tg.gain.setValueAtTime(0, t);
      tg.gain.linearRampToValueAtTime(0.09, t + d);
      tg.gain.setTargetAtTime(0, t + d, 0.06);
      for (const [f0, f1] of [[146.8, 587], [220, 880]] as const) {
        const s = k.voice.add(osc(k.ctx, "sawtooth", f0 * k.pitch, t, (k.rnd() - 0.5) * 10));
        s.frequency.exponentialRampToValueAtTime(f1 * k.pitch, t + d);
        s.connect(lp);
      }
      lp.connect(trem).connect(tg).connect(k.out);
      // Ready "ting" at full charge.
      chime(k, N("D6"), d, 0.1, 0.4);
      k.mark(t + d + 1);
    },
  },
  "hit-flesh": {
    bus: "sfx", sends: { room: 0.2 }, vary: 0.12,
    play: (k) => {
      const p = k.vary(0.15);
      thud(k, { f: 130 * p, peak: 0.55, tau: 0.06 });
      // Wet slap.
      k.noise({ color: "white", type: "bandpass", f: 1400 * p, q: 1.2, tau: 0.018, peak: 0.35 });
      k.noise({ color: "pink", type: "bandpass", f: 500 * p, q: 2, at: 0.006, tau: 0.03, peak: 0.25 });
    },
  },
  "hit-armor": {
    bus: "sfx", sends: { room: 0.25, hall: 0.05 }, vary: 0.1,
    play: (k) => {
      const p = k.vary(0.15);
      thud(k, { f: 150 * p, peak: 0.35, tau: 0.05 });
      k.noise({ type: "highpass", f: 2200, tau: 0.012, peak: 0.3 });
      ring(k, { f: 540 * p, peak: 0.07, tau: 0.09 });
      k.noise({ type: "bandpass", f: 4200 * p, q: 3, tau: 0.03, peak: 0.08 });
    },
  },
  "hit-crit": {
    bus: "sfx", sends: { room: 0.25, hall: 0.2 }, vary: 0.08,
    play: (k) => {
      thud(k, { f: 110, peak: 0.6, tau: 0.09 });
      k.tone({ f: 62, to: 34, glide: 0.25, a: 0.004, tau: 0.16, peak: 0.45 }); // sub boom
      k.noise({ type: "highpass", f: 2800, tau: 0.02, peak: 0.35 }); // crack
      k.noise({ type: "bandpass", f: 1200, q: 1, tau: 0.03, peak: 0.3 });
      // Bright ring that says "critical".
      k.fm({ f: N("A6"), ratio: 1.41, index: 2, at: 0.01, tau: 0.25, peak: 0.06 });
      k.fm({ f: N("E7"), ratio: 1.41, index: 1.5, at: 0.03, tau: 0.2, peak: 0.04 });
    },
  },
  parry: {
    bus: "sfx", sends: { room: 0.25, hall: 0.15 }, vary: 0.06,
    play: (k) => {
      const p = k.vary(0.08);
      k.noise({ type: "highpass", f: 3000, tau: 0.008, peak: 0.4 });
      k.noise({ type: "bandpass", f: 5200 * p, q: 4, tau: 0.04, peak: 0.12 });
      ring(k, { f: 1180 * p, peak: 0.09, tau: 0.22, ratios: [1, 1.52, 2.21, 2.87, 3.96] });
      thud(k, { f: 180, peak: 0.2, tau: 0.03 });
    },
  },
  "perfect-parry": {
    bus: "sfx", sends: { hall: 0.45, delay: 0.25 },
    play: (k) => {
      // The clash.
      k.noise({ type: "highpass", f: 2600, tau: 0.01, peak: 0.45 });
      ring(k, { f: N("D6"), peak: 0.1, tau: 0.5, ratios: [1, 1.5, 2.0, 2.98, 4.02] });
      thud(k, { f: 160, peak: 0.3, tau: 0.04 });
      // Time slows: a falling tape-stop sweep under a long reverse-like swell.
      const lp = filter(k.ctx, "lowpass", 5000, 2, k.t + 0.05);
      lp.frequency.exponentialRampToValueAtTime(250, k.t + 1.1);
      lp.connect(k.out);
      k.noise({ color: "pink", type: "lowpass", f: 5000, to: 300, glide: 1, at: 0.05, a: 0.15, tau: 0.35, peak: 0.25 });
      k.tone({ type: "sawtooth", f: 880, to: 110, glide: 1.1, at: 0.04, a: 0.08, tau: 0.35, peak: 0.07, dest: lp });
      k.tone({ type: "sawtooth", f: 1320, to: 165, glide: 1.1, at: 0.04, a: 0.08, tau: 0.35, peak: 0.04, dest: lp });
      // Shimmer.
      ["D6", "A6", "D7", "F#7", "A7"].forEach((n, i) => {
        k.fm({ f: N(n) * k.vary(0.004), ratio: 2, index: 0.6, at: 0.03 + i * 0.05, tau: 0.5, peak: 0.045 });
      });
      k.tone({ f: N("D2"), at: 0, a: 0.02, tau: 0.5, peak: 0.25 });
    },
  },
  block: {
    bus: "sfx", sends: { room: 0.25 }, vary: 0.12,
    play: (k) => {
      const p = k.vary(0.15);
      thud(k, { f: 170 * p, peak: 0.45, tau: 0.05 });
      k.noise({ color: "pink", type: "bandpass", f: 650 * p, q: 1.5, tau: 0.035, peak: 0.3 });
      ring(k, { f: 820 * p, peak: 0.025, tau: 0.06, ratios: [1, 2.1, 3.3] });
    },
  },
  dodge: {
    bus: "sfx", sends: { room: 0.12 }, vary: 0.1,
    play: (k) => {
      whoosh(k, { lo: 350, hi: 1300, dur: 0.26, peak: 0.28, q: 0.9 });
      // Cloth flutter: amplitude-modulated low noise.
      const t = k.t;
      const src = k.voice.add(noise(k.ctx, "pink", t, k.rnd));
      const lp = filter(k.ctx, "lowpass", 900, 0.7, t);
      const am = gain(k.ctx, 0.5);
      const mod = k.voice.add(osc(k.ctx, "square", 28 + k.rnd() * 8, t));
      mod.connect(gain(k.ctx, 0.5)).connect(am.gain);
      const env = gain(k.ctx, 0);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.12, t + 0.08);
      env.gain.setTargetAtTime(0, t + 0.08, 0.05);
      src.connect(lp).connect(am).connect(env).connect(k.out);
      // Landing scuff.
      k.noise({ type: "bandpass", f: 1800, q: 1, at: 0.22, a: 0.01, tau: 0.04, peak: 0.06 });
    },
  },
  "footstep-grass": {
    bus: "sfx", sends: {}, vary: 0.2,
    play: (k) => {
      const f = 2600 * k.vary(0.4);
      k.noise({ type: "bandpass", f, q: 1.2, a: 0.004, tau: 0.018, peak: 0.07 });
      k.noise({ type: "bandpass", f: f * 1.4, q: 1.5, at: 0.025 + k.rnd() * 0.02, a: 0.003, tau: 0.012, peak: 0.04 });
      k.noise({ color: "brown", type: "lowpass", f: 400, tau: 0.02, peak: 0.06 });
    },
  },
  "footstep-stone": {
    bus: "sfx", sends: { room: 0.15 }, vary: 0.15,
    play: (k) => {
      k.tone({ f: 120 * k.vary(0.2), to: 80, glide: 0.04, tau: 0.018, peak: 0.12 });
      k.noise({ type: "highpass", f: 1800 * k.vary(0.3), tau: 0.006, peak: 0.05 });
      k.noise({ type: "bandpass", f: 3500, q: 2, at: 0.012, tau: 0.008, peak: 0.02 });
    },
  },
  hurt: {
    bus: "sfx", sends: { room: 0.2 }, vary: 0.1,
    play: (k) => {
      thud(k, { f: 100, peak: 0.45, tau: 0.07 });
      // Muffled pained "hnh": saw through falling vowel formants.
      const t = k.t;
      const src = k.voice.add(osc(k.ctx, "sawtooth", 160 * k.pitch, t));
      src.frequency.exponentialRampToValueAtTime(105 * k.pitch, t + 0.22);
      const sum = gain(k.ctx, 0);
      sum.gain.setValueAtTime(0, t);
      sum.gain.linearRampToValueAtTime(0.18, t + 0.02);
      sum.gain.setTargetAtTime(0, t + 0.08, 0.05);
      for (const [f0, f1, g] of [[750, 450, 1], [1200, 800, 0.4]] as const) {
        const bp = filter(k.ctx, "bandpass", f0, 6, t);
        bp.frequency.exponentialRampToValueAtTime(f1, t + 0.2);
        src.connect(bp).connect(gain(k.ctx, g)).connect(sum);
      }
      sum.connect(k.out);
      k.noise({ type: "bandpass", f: 900, q: 1, tau: 0.03, peak: 0.12 });
      k.mark(t + 0.6);
    },
  },
  death: {
    bus: "sfx", sends: { hall: 0.5 },
    play: (k) => {
      thud(k, { f: 90, peak: 0.6, tau: 0.12 });
      // The light goes out: a falling, closing chord.
      const lp = filter(k.ctx, "lowpass", 2500, 1, k.t);
      lp.frequency.exponentialRampToValueAtTime(120, k.t + 2.5);
      lp.connect(k.out);
      for (const [f, d] of [[N("D3"), -8], [N("F3"), 6], [N("A3"), -4], [N("D2"), 0]] as const) {
        k.tone({ type: "sawtooth", f, to: f * 0.5, glide: 2.4, a: 0.04, tau: 0.7, peak: 0.07, detune: d, dest: lp });
      }
      k.noise({ color: "pink", type: "lowpass", f: 2000, to: 150, glide: 2, a: 0.2, tau: 0.5, peak: 0.15 });
      // Distant toll.
      k.fm({ f: N("D3"), ratio: 1.183, index: 0.8, at: 0.4, tau: 1.2, peak: 0.12 });
    },
  },
  "enemy-die": {
    bus: "sfx", sends: { hall: 0.3 }, vary: 0.12,
    play: (k) => {
      thud(k, { f: 120, peak: 0.35, tau: 0.06 });
      // Dissipating: a falling hollow tone and a dark "poof" of dust.
      k.tone({ type: "triangle", f: 420, to: 90, glide: 0.5, a: 0.01, tau: 0.15, peak: 0.12 });
      k.tone({ type: "sine", f: 630, to: 140, glide: 0.5, a: 0.01, tau: 0.12, peak: 0.06 });
      k.noise({ color: "pink", type: "lowpass", f: 2500, to: 200, glide: 0.6, a: 0.04, tau: 0.18, peak: 0.25 });
      k.crackle({ at: 0.05, span: 0.35, count: 6, peak: 0.08, f: 2500 });
    },
  },
  telegraph: {
    bus: "sfx", sends: { hall: 0.3 }, vary: 0.03,
    play: (k) => {
      // A clear but not shrill warning: rising low swell into a dissonant bell pair (tritone).
      k.noise({ color: "pink", type: "bandpass", f: 200, to: 1400, glide: 0.4, q: 2, a: 0.35, tau: 0.06, peak: 0.18 });
      k.tone({ type: "sawtooth", f: 73, to: 110, glide: 0.4, a: 0.3, tau: 0.08, peak: 0.08 });
      k.fm({ f: N("A5"), ratio: 3.5, index: 0.9, at: 0.32, tau: 0.35, peak: 0.1 });
      k.fm({ f: N("D#5"), ratio: 3.5, index: 0.9, at: 0.32, tau: 0.3, peak: 0.07 });
    },
  },
  projectile: {
    bus: "sfx", sends: { room: 0.15 }, vary: 0.12,
    play: (k) => {
      k.noise({ color: "white", type: "bandpass", f: 2400, to: 700, glide: 0.22, q: 1.6, a: 0.008, tau: 0.07, peak: 0.25 });
      k.tone({ type: "triangle", f: 720, to: 360, glide: 0.15, tau: 0.04, peak: 0.07 });
    },
  },
  explosion: {
    bus: "sfx", sends: { hall: 0.35, room: 0.2 }, vary: 0.1,
    play: (k) => {
      k.tone({ f: 70, to: 28, glide: 0.6, a: 0.004, tau: 0.25, peak: 0.6 });
      k.noise({ color: "brown", type: "lowpass", f: 1800, to: 120, glide: 1.3, a: 0.005, tau: 0.35, peak: 0.7 });
      k.noise({ color: "white", type: "lowpass", f: 6000, to: 800, glide: 0.4, a: 0.002, tau: 0.06, peak: 0.35 });
      k.crackle({ at: 0.04, span: 0.9, count: 18, peak: 0.12, f: 2200 });
    },
  },

  // ------------------------------------------------------------------ elements
  "ember-burst": {
    bus: "sfx", sends: { room: 0.2, hall: 0.2 }, vary: 0.1,
    play: (k) => {
      // Ignition "fwoomp" + crackling embers + warm low bloom.
      k.noise({ color: "pink", type: "bandpass", f: 300, to: 1800, glide: 0.12, q: 0.8, a: 0.03, tau: 0.12, peak: 0.45 });
      k.noise({ color: "brown", type: "lowpass", f: 700, a: 0.01, tau: 0.15, peak: 0.4 });
      k.tone({ f: 90, to: 55, glide: 0.25, a: 0.01, tau: 0.12, peak: 0.3 });
      k.crackle({ at: 0.03, span: 0.6, count: 16, peak: 0.13, f: 3500 });
    },
  },
  "frost-shatter": {
    bus: "sfx", sends: { hall: 0.35 }, vary: 0.06,
    play: (k) => {
      k.noise({ type: "highpass", f: 4000, a: 0.001, tau: 0.04, peak: 0.3 });
      // Ice shards: many short glassy pings scattered in time.
      for (let i = 0; i < 14; i++) {
        k.fm({ f: 2000 + k.rnd() * 4500, ratio: 1.73, index: 0.7, at: k.rnd() * 0.3, tau: 0.04 + k.rnd() * 0.08, peak: 0.03 + k.rnd() * 0.03 });
      }
      // Crystalline ring (E minor add9 cluster, high).
      for (const n of ["E6", "B6", "F#7"]) k.fm({ f: N(n), ratio: 3, index: 0.5, at: 0.01, tau: 0.6, peak: 0.035 });
      k.tone({ f: 200, to: 120, glide: 0.1, tau: 0.04, peak: 0.15 });
    },
  },
  "storm-zap": {
    bus: "sfx", sends: { room: 0.2, hall: 0.15 }, vary: 0.05,
    play: (k) => {
      // Arc: a buzzing saw whose pitch jumps randomly every few ms.
      const t = k.t;
      const s = k.voice.add(osc(k.ctx, "sawtooth", 400, t));
      for (let i = 0; i < 30; i++) s.frequency.setValueAtTime(80 + k.rnd() * 1600, t + i * 0.011);
      const bp = filter(k.ctx, "bandpass", 1800, 0.8, t);
      const g = gain(k.ctx, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.005);
      g.gain.setTargetAtTime(0, t + 0.2, 0.05);
      s.connect(bp).connect(g).connect(k.out);
      k.noise({ type: "highpass", f: 2500, a: 0.001, tau: 0.03, peak: 0.45 }); // crack
      k.crackle({ at: 0, span: 0.3, count: 14, peak: 0.12, f: 5000 });
      // Rolling thunder tail.
      k.noise({ color: "brown", type: "lowpass", f: 300, at: 0.05, a: 0.08, tau: 0.35, peak: 0.3 });
      k.mark(t + 2);
    },
  },
  "hollow-pulse": {
    bus: "sfx", sends: { hall: 0.45 }, vary: 0.05,
    play: (k) => {
      // A void breathing in: sub drop, phasing detuned saws, reversed-feeling swell.
      k.tone({ f: 55, to: 30, glide: 0.8, a: 0.12, tau: 0.25, peak: 0.45 });
      const lp = filter(k.ctx, "lowpass", 200, 4, k.t);
      lp.frequency.linearRampToValueAtTime(1600, k.t + 0.3);
      lp.frequency.exponentialRampToValueAtTime(150, k.t + 1);
      lp.connect(k.out);
      for (const d of [-25, 0, 31]) k.tone({ type: "sawtooth", f: N("D#2"), detune: d, a: 0.3, tau: 0.25, peak: 0.08, dest: lp });
      k.tone({ type: "sawtooth", f: N("A2"), detune: 12, a: 0.3, tau: 0.25, peak: 0.05, dest: lp });
      k.noise({ color: "pink", type: "bandpass", f: 300, to: 900, glide: 0.3, q: 3, a: 0.28, tau: 0.08, peak: 0.2 });
    },
  },

  // ------------------------------------------------------------------ world
  "pickup-coin": {
    bus: "sfx", sends: { room: 0.2 }, vary: 0.02,
    play: (k) => {
      const base = k.pick(["B5", "D6", "E6"]);
      const f = N(base);
      k.fm({ f, ratio: 2.76, index: 0.9, tau: 0.08, peak: 0.08 });
      k.fm({ f: f * 1.5, ratio: 2.76, index: 0.8, at: 0.06, tau: 0.18, peak: 0.08 });
      k.noise({ type: "highpass", f: 6000, tau: 0.004, peak: 0.05 });
    },
  },
  "pickup-item": {
    bus: "sfx", sends: { room: 0.25 },
    play: (k) => {
      k.noise({ color: "pink", f: 500, to: 1800, glide: 0.1, a: 0.04, tau: 0.03, peak: 0.08 });
      k.pluck({ f: N("D5"), at: 0.03, peak: 0.13, bright: 0.5, decay: 1 });
      k.pluck({ f: N("A5"), at: 0.09, peak: 0.1, bright: 0.5, decay: 1 });
    },
  },
  "pickup-rare": {
    bus: "sfx", sends: { hall: 0.45, delay: 0.25 },
    play: (k) => {
      ["A5", "D6", "E6", "A6", "D7"].forEach((n, i) => chime(k, N(n), i * 0.06, 0.09, 0.8));
      for (let i = 0; i < 8; i++) k.fm({ f: 4000 + k.rnd() * 4000, ratio: 2, index: 0.4, at: 0.2 + k.rnd() * 0.6, tau: 0.06, peak: 0.025 });
      for (const n of ["D4", "A4", "E5"]) k.swell({ f: N(n), at: 0.05, a: 0.3, hold: 0.4, r: 1.2, peak: 0.03, cutoff: 3000 });
      k.noise({ type: "highpass", f: 8000, a: 0.3, tau: 0.2, peak: 0.03 });
    },
  },
  "chest-open": {
    bus: "sfx", sends: { room: 0.3 },
    play: (k) => {
      creak(k, 0, 0.45, 95, 1);
      k.tone({ f: 140, to: 90, glide: 0.06, at: 0.48, tau: 0.06, peak: 0.35 });
      k.noise({ color: "pink", type: "bandpass", f: 700, q: 1.2, at: 0.48, tau: 0.04, peak: 0.25 });
      ["D6", "F#6", "A6"].forEach((n, i) => chime(k, N(n), 0.55 + i * 0.07, 0.06, 0.6));
    },
  },
  door: {
    bus: "sfx", sends: { room: 0.35, hall: 0.1 },
    play: (k) => {
      creak(k, 0, 0.8, 70, 0.9);
      k.tone({ f: 85, to: 50, glide: 0.1, at: 0.85, tau: 0.12, peak: 0.45 });
      k.noise({ color: "brown", type: "lowpass", f: 600, at: 0.85, tau: 0.08, peak: 0.4 });
      k.noise({ color: "pink", type: "bandpass", f: 1500, q: 2, at: 0.86, tau: 0.02, peak: 0.1 });
    },
  },
  "lantern-hum": {
    bus: "sfx", sends: { room: 0.2 }, loop: true,
    play: (k) => {
      const t = k.t;
      const g = gain(k.ctx, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.6);
      g.connect(k.out);
      // Warm hum with slow beating.
      for (const [f, a] of [[110, 0.06], [110.4, 0.05], [220.3, 0.025], [330.5, 0.008]] as const) {
        k.voice.add(osc(k.ctx, "sine", f, t)).connect(gain(k.ctx, a)).connect(g);
      }
      // Flame breath: low noise with a slow flutter.
      const n = k.voice.add(noise(k.ctx, "pink", t, k.rnd));
      const bp = filter(k.ctx, "bandpass", 500, 0.8, t);
      const flutter = gain(k.ctx, 0.04);
      k.voice.add(osc(k.ctx, "sine", 0.7, t)).connect(gain(k.ctx, 0.02)).connect(flutter.gain);
      n.connect(bp).connect(flutter).connect(g);
      k.end = Infinity;
    },
  },
  portal: {
    bus: "sfx", sends: { hall: 0.5, delay: 0.2 },
    play: (k) => {
      const t = k.t;
      const bp = filter(k.ctx, "bandpass", 400, 4, t);
      const sweepLfo = k.voice.add(osc(k.ctx, "sine", 0.9, t));
      sweepLfo.frequency.linearRampToValueAtTime(5, t + 1.8);
      sweepLfo.connect(gain(k.ctx, 1500)).connect(bp.detune);
      bp.frequency.exponentialRampToValueAtTime(1600, t + 1.8);
      const env = gain(k.ctx, 0);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.25, t + 0.6);
      env.gain.setTargetAtTime(0, t + 1.6, 0.25);
      bp.connect(env).connect(k.out);
      for (const [n, d] of [["D3", -14], ["A3", 11], ["D#4", -6], ["A4", 17]] as const) {
        const s = k.voice.add(osc(k.ctx, "sawtooth", N(n) * k.pitch, t, d));
        s.detune.linearRampToValueAtTime(d + 700, t + 1.8);
        s.connect(bp);
      }
      k.noise({ color: "pink", type: "highpass", f: 800, to: 6000, glide: 1.6, a: 1, tau: 0.25, peak: 0.12 });
      chime(k, N("A6"), 1.5, 0.08, 0.8);
      k.mark(t + 3.5);
    },
  },
};

/** Wood creak: a low saw through a resonant bandpass with irregular stick-slip amplitude modulation. */
function creak(k: Kit, at: number, dur: number, f: number, peak: number) {
  const t = k.t + at;
  const s = k.voice.add(osc(k.ctx, "sawtooth", f * k.vary(0.1), t));
  s.frequency.linearRampToValueAtTime(f * 1.25, t + dur * 0.6);
  s.frequency.linearRampToValueAtTime(f * 0.9, t + dur);
  const bp = filter(k.ctx, "bandpass", 900, 6, t);
  const bp2 = filter(k.ctx, "bandpass", 1900, 8, t);
  const am = gain(k.ctx, 0);
  // Stick-slip: random pulses.
  let tt = t;
  while (tt < t + dur) {
    const step = 0.012 + k.rnd() * 0.03;
    am.gain.setValueAtTime(0.3 + k.rnd() * 0.7, tt);
    am.gain.setTargetAtTime(0.05, tt + 0.003, step * 0.3);
    tt += step;
  }
  am.gain.setTargetAtTime(0, t + dur, 0.03);
  s.connect(bp).connect(am);
  s.connect(bp2).connect(gain(k.ctx, 0.5)).connect(am);
  am.connect(gain(k.ctx, 0.12 * peak)).connect(k.out);
  k.mark(t + dur + 0.2);
}

export interface Listener {
  x: number;
  y: number;
}

/** Hearing radius in world pixels. */
const HEAR_REF = 220;
const HEAR_MAX = 900;

/** Spatial gain/pan/cutoff for a world position (pure, exported for tests). */
export function spatialize(listener: Listener, x: number, y: number): { gain: number; pan: number; cutoff: number } | null {
  const dx = x - listener.x;
  const dy = y - listener.y;
  const d = Math.hypot(dx, dy);
  if (d > HEAR_MAX) return null;
  const g = 1 / (1 + (d / HEAR_REF) ** 2);
  const fade = 1 - clamp((d - HEAR_MAX * 0.7) / (HEAR_MAX * 0.3), 0, 1);
  return { gain: g * fade, pan: clamp(dx / 320, -0.85, 0.85), cutoff: 18000 * Math.pow(2500 / 18000, d / HEAR_MAX) };
}

/** Plays presets on an engine. */
export class SfxPlayer {
  listener: Listener = { x: 0, y: 0 };
  private lastPlayed = new Map<string, number>();

  constructor(private readonly engine: AudioEngine) {}

  has(name: string): name is SfxName {
    return name in PRESETS;
  }

  play(name: SfxName, opts: SfxOptions = {}, at?: number): SfxHandle | null {
    const preset = PRESETS[name];
    if (!preset) return null;
    const ctx = this.engine.ctx;
    const t = Math.max(ctx.currentTime, at ?? ctx.currentTime) + (opts.delay ?? 0) + 0.005;
    // Anti-machine-gun: the same sound within 25 ms is dropped (UI hover spam, multi-hit frames).
    const last = this.lastPlayed.get(name) ?? -1;
    if (t - last < 0.025 && !preset.loop) return null;
    this.lastPlayed.set(name, t);

    let vol = opts.volume ?? 1;
    let pan = opts.pan ?? 0;
    let cutoff: number | null = null;
    if (opts.x !== undefined && opts.y !== undefined) {
      const s = spatialize(this.listener, opts.x, opts.y);
      if (!s) return null;
      vol *= s.gain;
      pan = s.pan;
      cutoff = s.cutoff;
    }
    const bus = this.engine.buses[preset.bus];
    const channel = bus.channel(preset.sends);
    let dest: AudioNode = channel;
    if (pan) {
      const p = panner(ctx, pan);
      p.connect(dest);
      dest = p;
    }
    if (cutoff !== null && cutoff < 17000) {
      const lp = filter(ctx, "lowpass", cutoff, 0.5);
      lp.connect(dest);
      dest = lp;
    }
    const voice = makeVoice(ctx, dest);
    voice.out.gain.value = vol;
    const pitch = (opts.pitch ?? 1) * (preset.vary ? 1 + (this.engine.rnd() - 0.5) * preset.vary : 1);
    const kit = new Kit(ctx, voice.out, t, this.engine.rnd, voice, pitch);
    preset.play(kit, opts);
    if (preset.loop) {
      voice.end = Infinity;
      return {
        stop: (fade = 0.4) => {
          const now = ctx.currentTime;
          voice.out.gain.setTargetAtTime(0, now, fade / 4);
          for (const s of voice.sources) {
            try {
              s.stop(now + fade * 1.5);
            } catch {
              /* already stopped */
            }
          }
        },
      };
    }
    voice.finish(Math.min(kit.end, t + 12));
    this.engine.sfxPool.add(voice, t);
    return { stop: () => voice.kill(ctx.currentTime) };
  }
}
