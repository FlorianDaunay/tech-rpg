/**
 * Low-level building blocks shared by instruments and sound effects.
 * Every function takes the context explicitly so the same code renders live or into an OfflineAudioContext.
 */

export type Ctx = BaseAudioContext;
export type NoiseColor = "white" | "pink" | "brown";

const NOISE_SECONDS = 2;
const noiseCache = new WeakMap<Ctx, Partial<Record<NoiseColor, AudioBuffer>>>();

/** Cached 2 s mono noise buffer per context. Pink: Paul Kellet's filter; brown: leaky integrator. */
export function noiseBuffer(ctx: Ctx, color: NoiseColor): AudioBuffer {
  let entry = noiseCache.get(ctx);
  if (!entry) noiseCache.set(ctx, (entry = {}));
  const cached = entry[color];
  if (cached) return cached;
  const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 0x1234567 ^ color.length;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = rand();
    if (color === "white") d[i] = w * 0.6;
    else if (color === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
  }
  // Short crossfade so the loop point doesn't click.
  const fade = Math.floor(ctx.sampleRate * 0.01);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[len - fade + i] = d[len - fade + i]! * (1 - k) + d[i]! * k;
  }
  entry[color] = buf;
  return buf;
}

/** Looping noise source starting at a random offset (so repeats differ). Caller must stop() it. */
export function noise(ctx: Ctx, color: NoiseColor, t: number, rnd: () => number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, color);
  src.loop = true;
  src.start(t, rnd() * (NOISE_SECONDS - 0.1));
  return src;
}

export function osc(ctx: Ctx, type: OscillatorType, freq: number, t: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  o.start(t);
  return o;
}

export function gain(ctx: Ctx, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

export function filter(ctx: Ctx, type: BiquadFilterType, freq: number, q = 0.7, t = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.Q.setValueAtTime(q, t);
  return f;
}

export function panner(ctx: Ctx, pan: number): StereoPannerNode {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  return p;
}

/** Chain nodes left to right, returns the last one. */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
  return nodes[nodes.length - 1]!;
}

export interface Adsr {
  a: number;
  /** Decay time to sustain (≈ 3 time constants). */
  d: number;
  /** Sustain level relative to peak. */
  s: number;
  /** Release time (≈ 5 time constants, -43 dB). */
  r: number;
}

/**
 * Schedule an ADSR on a param. The note is held for `hold` seconds after `t`.
 * Uses setTargetAtTime for decays (smooth, never hits zero) and returns the time when it is inaudible.
 */
export function adsr(param: AudioParam, t: number, hold: number, env: Adsr, peak: number): number {
  const a = Math.max(0.002, env.a);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (env.s < 1) param.setTargetAtTime(peak * env.s, t + a, Math.max(0.005, env.d / 3));
  const rel = Math.max(t + a, t + hold);
  param.setTargetAtTime(0, rel, Math.max(0.005, env.r / 5));
  return rel + env.r;
}

/** Percussive envelope: fast attack then exponential decay (tau). Returns the end time (-52 dB). */
export function perc(param: AudioParam, t: number, peak: number, attack: number, tau: number): number {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, attack));
  param.setTargetAtTime(0, t + Math.max(0.001, attack), Math.max(0.002, tau));
  return t + attack + tau * 6;
}

/** Exponential glide of a frequency param. */
export function sweep(param: AudioParam, t: number, from: number, to: number, time: number) {
  param.setValueAtTime(Math.max(1, from), t);
  param.exponentialRampToValueAtTime(Math.max(1, to), t + Math.max(0.005, time));
}

/** Slow LFO feeding an AudioParam (adds depth × sine). Caller stops it. */
export function lfo(ctx: Ctx, rate: number, depth: number, target: AudioParam, t: number, type: OscillatorType = "sine"): OscillatorNode {
  const o = osc(ctx, type, rate, t);
  const g = gain(ctx, depth);
  o.connect(g).connect(target);
  return o;
}

/**
 * A sounding note: its sources and a final gain used for voice stealing (fast fade without fighting the envelope).
 */
export class Voice {
  readonly sources: AudioScheduledSourceNode[] = [];
  end = 0;
  constructor(readonly out: GainNode) {}

  add<T extends AudioScheduledSourceNode>(src: T): T {
    this.sources.push(src);
    return src;
  }

  /** Stop all sources at `end` (call once the envelope is known). */
  finish(end: number): this {
    this.end = end;
    for (const s of this.sources) s.stop(end + 0.05);
    return this;
  }

  /** Fade out quickly from `at` (voice stealing). */
  kill(at: number) {
    this.out.gain.setTargetAtTime(0, at, 0.015);
    for (const s of this.sources) {
      try {
        s.stop(at + 0.1);
      } catch {
        /* already stopped */
      }
    }
    this.end = Math.min(this.end, at + 0.1);
  }
}

export function makeVoice(ctx: Ctx, dest: AudioNode): Voice {
  const g = ctx.createGain();
  g.connect(dest);
  return new Voice(g);
}

/** Keeps the number of simultaneous voices bounded; steals the one that ends first. */
export class VoicePool {
  private voices: Voice[] = [];
  constructor(public max: number) {}

  get size() {
    return this.voices.length;
  }

  add(v: Voice, now: number) {
    this.voices = this.voices.filter((x) => x.end > now);
    while (this.voices.length >= this.max) {
      let idx = 0;
      for (let i = 1; i < this.voices.length; i++) if (this.voices[i]!.end < this.voices[idx]!.end) idx = i;
      const [victim] = this.voices.splice(idx, 1);
      victim?.kill(now);
    }
    this.voices.push(v);
  }

  killAll(at: number) {
    for (const v of this.voices) v.kill(at);
    this.voices = [];
  }
}

const ksCache = new WeakMap<Ctx, Map<string, AudioBuffer>>();

/**
 * Karplus-Strong plucked string rendered once per pitch into a buffer (cheap to replay, exact tuning thanks to
 * fractional delay). `bright` 0..1 shapes the excitation, `decay` is the ring time in seconds.
 */
export function ksBuffer(ctx: Ctx, freq: number, bright: number, decay: number): AudioBuffer {
  let map = ksCache.get(ctx);
  if (!map) ksCache.set(ctx, (map = new Map()));
  const key = `${freq.toFixed(2)}|${bright.toFixed(2)}|${decay.toFixed(2)}`;
  const hit = map.get(key);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * decay);
  const buf = ctx.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  const period = sr / freq - 0.5; // the 2-tap average adds half a sample of delay
  const n0 = Math.ceil(period) + 2;
  // Excitation: noise, low-passed according to brightness (softer = rounder, harp-like).
  let seed = Math.floor(freq * 977) >>> 0;
  let lp = 0;
  const k = 0.15 + bright * 0.85;
  for (let i = 0; i < n0; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    lp += k * ((seed / 2147483648 - 1) - lp);
    y[i] = lp;
  }
  // Remove DC from the excitation so the string doesn't thump.
  let mean = 0;
  for (let i = 0; i < n0; i++) mean += y[i]!;
  mean /= n0;
  for (let i = 0; i < n0; i++) y[i] = y[i]! - mean;
  // Loss per period so the amplitude reaches -60 dB after `decay` seconds.
  const g = Math.pow(0.001, 1 / (decay * freq));
  for (let i = n0; i < len; i++) {
    const p = i - period;
    const i0 = Math.floor(p);
    const frac = p - i0;
    const a = y[i0]! * (1 - frac) + y[i0 + 1]! * frac;
    const b = y[i0 - 1]! * (1 - frac) + y[i0]! * frac;
    y[i] = g * 0.5 * (a + b);
  }
  // Normalise peak.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]!));
  if (peak > 0) for (let i = 0; i < len; i++) y[i] = (y[i]! / peak) * 0.8;
  map.set(key, buf);
  return buf;
}

/**
 * Procedural impulse response: stereo decaying noise with frequency-dependent damping
 * (high frequencies die faster), sparse early reflections and a short pre-delay.
 */
export function makeImpulse(ctx: Ctx, seconds: number, opts: { preDelay?: number; damping?: number; early?: number; seed?: number } = {}): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor((opts.preDelay ?? 0.02) * sr);
  const damping = opts.damping ?? 0.5;
  let seed = (opts.seed ?? 99) >>> 0;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.pow(1 - (i - pre) / (len - pre), 2.2) * Math.exp(-t * (3 / seconds));
      // One-pole lowpass whose cutoff falls over time: bright onset, dark tail.
      const k = Math.max(0.04, 0.9 - damping * (t / seconds) * 1.6);
      lp += k * (rand() - lp);
      d[i] = lp * env;
    }
    // Early reflections.
    const early = opts.early ?? 6;
    for (let e = 0; e < early; e++) {
      const at = pre + Math.floor((0.004 + Math.abs(rand()) * 0.06) * sr);
      if (at < len) d[at] = d[at]! + rand() * 0.5 * (1 - e / early);
    }
  }
  return buf;
}
