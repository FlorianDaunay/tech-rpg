/**
 * Ambience beds per zone: continuous filtered-noise layers (wind, rumble, hearth) plus sparse random events
 * (crickets, drips, distant bells, owls, embers) scheduled with the same lookahead clock as the music.
 */
import type { AudioEngine } from "./AudioEngine";
import { type Ctx, filter, gain, lfo, makeVoice, noise, osc, panner, perc, sweep, type Voice, VoicePool } from "./synth/core";
import { INSTRUMENTS } from "./synth/instruments";
import { Lookahead, type Timer } from "./music/scheduler";
import { noteToMidi } from "./theory";

type EventKind = "crackle" | "cricket" | "owl" | "drip" | "bell" | "clink" | "whisper" | "creak" | "gust" | "chime";

interface Bed {
  /** Wind: band-passed noise with a slowly wandering centre. */
  wind?: { f: number; q: number; gain: number; rate: number };
  /** Low rumble (caves, rift). */
  rumble?: number;
  /** Warm hearth/fire bed. */
  hearth?: number;
  /** Sustained drone note. */
  drone?: { note: string; gain: number };
  /** Random events: kind → average events per second. */
  events: Partial<Record<EventKind, number>>;
}

export const BEDS: Record<string, Bed> = {
  title: { wind: { f: 500, q: 0.8, gain: 0.12, rate: 0.05 }, events: { crackle: 0.6, gust: 0.05 } },
  cinderhold: { wind: { f: 700, q: 0.6, gain: 0.05, rate: 0.07 }, hearth: 0.1, events: { crackle: 1.2, chime: 0.03, creak: 0.03 } },
  "whispering-wilds": { wind: { f: 1100, q: 0.5, gain: 0.1, rate: 0.09 }, events: { cricket: 0.9, owl: 0.04, whisper: 0.06, gust: 0.06 } },
  "ashen-graveyard": { wind: { f: 420, q: 1.2, gain: 0.14, rate: 0.06 }, events: { bell: 0.025, gust: 0.08, creak: 0.04, whisper: 0.03 } },
  "deep-mines": { rumble: 0.18, wind: { f: 250, q: 2, gain: 0.05, rate: 0.03 }, events: { drip: 0.5, clink: 0.08, creak: 0.02 } },
  "fallen-citadel": { wind: { f: 600, q: 2.5, gain: 0.12, rate: 0.08 }, events: { crackle: 0.4, clink: 0.06, gust: 0.1 } },
  "frostfell-reach": { wind: { f: 900, q: 0.7, gain: 0.16, rate: 0.11 }, events: { gust: 0.14, chime: 0.05, creak: 0.03 } },
  "goblin-warren": { rumble: 0.12, wind: { f: 280, q: 2, gain: 0.05, rate: 0.04 }, hearth: 0.06, events: { drip: 0.3, clink: 0.2, crackle: 0.3 } },
  "hollow-rift": { rumble: 0.15, drone: { note: "D#1", gain: 0.12 }, wind: { f: 300, q: 4, gain: 0.08, rate: 0.13 }, events: { whisper: 0.12, chime: 0.05 } },
};

const EVENT_FNS: Record<EventKind, (ctx: Ctx, out: AudioNode, t: number, rnd: () => number) => Voice> = {
  crackle: (ctx, out, t, rnd) => {
    const v = makeVoice(ctx, out);
    const n = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const at = t + rnd() * 0.25;
      const s = v.add(noise(ctx, "white", at, rnd));
      const g = gain(ctx, 0);
      perc(g.gain, at, 0.05 + rnd() * 0.08, 0.0005, 0.002 + rnd() * 0.005);
      s.connect(filter(ctx, "bandpass", 1500 + rnd() * 4000, 1.5, at)).connect(g).connect(v.out);
    }
    return v.finish(t + 0.4);
  },
  cricket: (ctx, out, t, rnd) => {
    const v = makeVoice(ctx, out);
    const p = panner(ctx, (rnd() - 0.5) * 1.6);
    p.connect(v.out);
    const f = 4200 + rnd() * 900;
    const pulses = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < pulses; i++) {
      const at = t + i * 0.09;
      const o = v.add(osc(ctx, "sine", f, at));
      const am = gain(ctx, 0);
      const g = gain(ctx, 0);
      v.add(osc(ctx, "square", 55, at)).connect(gain(ctx, 0.5)).connect(am.gain);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.012, at + 0.01);
      g.gain.setTargetAtTime(0, at + 0.04, 0.01);
      o.connect(am).connect(g).connect(p);
    }
    return v.finish(t + pulses * 0.09 + 0.1);
  },
  owl: (ctx, out, t, rnd) => {
    const v = makeVoice(ctx, out);
    const p = panner(ctx, (rnd() - 0.5) * 1.4);
    const lp = filter(ctx, "lowpass", 900, 0.7, t);
    lp.connect(p).connect(v.out);
    const f = 360 + rnd() * 40;
    for (const [dt, len] of [[0, 0.35], [0.5, 0.2], [0.75, 0.55]] as const) {
      const o = v.add(osc(ctx, "sine", f, t + dt));
      o.frequency.linearRampToValueAtTime(f * 0.92, t + dt + len);
      const g = gain(ctx, 0);
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(0.05, t + dt + 0.06);
      g.gain.setTargetAtTime(0, t + dt + len * 0.7, 0.05);
      o.connect(g).connect(lp);
    }
    return v.finish(t + 1.6);
  },
  drip: (ctx, out, t, rnd) => {
    const v = makeVoice(ctx, out);
    const p = panner(ctx, (rnd() - 0.5) * 1.6);
    p.connect(v.out);
    const f = 700 + rnd() * 900;
    const o = v.add(osc(ctx, "sine", f, t));
    sweep(o.frequency, t, f, f * 2.2, 0.05);
    const g = gain(ctx, 0);
    perc(g.gain, t, 0.05, 0.001, 0.03);
    o.connect(g).connect(p);
    return v.finish(t + 0.3);
  },
  bell: (ctx, out, t, rnd) => {
    const lp = filter(ctx, "lowpass", 1200, 0.7, t);
    lp.connect(out);
    return INSTRUMENTS.toll(ctx, lp, { t, dur: 4, midi: noteToMidi(rnd() < 0.5 ? "A2" : "D3"), vel: 0.35, params: {}, rnd });
  },
  clink: (ctx, out, t, rnd) => {
    const p = panner(ctx, (rnd() - 0.5) * 1.6);
    p.connect(out);
    return INSTRUMENTS.metal(ctx, p, { t, dur: 0.2, midi: 72 + Math.floor(rnd() * 12), vel: 0.12 + rnd() * 0.15, params: {}, rnd });
  },
  whisper: (ctx, out, t, rnd) =>
    INSTRUMENTS.whisper(ctx, out, { t, dur: 0.6 + rnd() * 1.2, midi: 55 + Math.floor(rnd() * 12), vel: 0.15 + rnd() * 0.15, params: { attack: 0.3, release: 0.6 }, rnd }),
  creak: (ctx, out, t, rnd) => {
    const v = makeVoice(ctx, out);
    const f = 60 + rnd() * 50;
    const s = v.add(osc(ctx, "sawtooth", f, t));
    s.frequency.linearRampToValueAtTime(f * 1.3, t + 0.6);
    const bp = filter(ctx, "bandpass", 800 + rnd() * 600, 7, t);
    const g = gain(ctx, 0);
    let tt = t;
    while (tt < t + 0.6) {
      g.gain.setValueAtTime(0.01 + rnd() * 0.02, tt);
      g.gain.setTargetAtTime(0.002, tt + 0.003, 0.006);
      tt += 0.015 + rnd() * 0.03;
    }
    g.gain.setTargetAtTime(0, t + 0.6, 0.02);
    s.connect(bp).connect(g).connect(v.out);
    return v.finish(t + 0.8);
  },
  gust: (ctx, out, t, rnd) => {
    const v = makeVoice(ctx, out);
    const len = 2 + rnd() * 2;
    const s = v.add(noise(ctx, "pink", t, rnd));
    const bp = filter(ctx, "bandpass", 300, 1.5, t);
    bp.frequency.exponentialRampToValueAtTime(900 + rnd() * 600, t + len * 0.5);
    bp.frequency.exponentialRampToValueAtTime(350, t + len);
    const g = gain(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + len * 0.5);
    g.gain.linearRampToValueAtTime(0, t + len);
    const p = panner(ctx, (rnd() - 0.5) * 1.2);
    s.connect(bp).connect(g).connect(p).connect(v.out);
    return v.finish(t + len);
  },
  chime: (ctx, out, t, rnd) => {
    const notes = ["D6", "A5", "F6", "E6", "C6"];
    return INSTRUMENTS.glass(ctx, out, { t, dur: 1.5, midi: noteToMidi(notes[Math.floor(rnd() * notes.length)]!), vel: 0.25, params: { attack: 0.02, release: 2 }, rnd });
  },
};

interface ActiveBed {
  id: string;
  out: GainNode;
  voice: Voice;
  bed: Bed;
}

export class Ambience {
  private active: ActiveBed | null = null;
  private readonly lookahead: Lookahead;
  private readonly pool = new VoicePool(8);

  constructor(private readonly engine: AudioEngine, timer?: Timer) {
    this.lookahead = new Lookahead({ clock: { now: () => engine.ctx.currentTime }, timer, intervalMs: 50, lookahead: 0.2, onWindow: (a, b) => this.onWindow(a, b) });
  }

  get current() {
    return this.active?.id ?? null;
  }

  start() {
    this.lookahead.start();
  }
  stop() {
    this.lookahead.stop();
  }
  /** Offline rendering: schedule up to `t` in small windows (event probabilities assume short windows). */
  advanceTo(t: number) {
    let cur = this.lookahead.scheduledUntil ?? this.engine.ctx.currentTime;
    while (cur < t) {
      cur = Math.min(t, cur + 0.1);
      this.lookahead.advanceTo(cur);
    }
  }

  set(zoneId: string | null, at = this.engine.ctx.currentTime) {
    if (this.active?.id === zoneId) return;
    if (this.active) {
      const old = this.active;
      old.out.gain.cancelScheduledValues(at);
      old.out.gain.setTargetAtTime(0, at, 0.6);
      old.voice.finish(at + 4);
    }
    this.active = null;
    const bed = zoneId ? BEDS[zoneId] : undefined;
    if (!bed || !zoneId) return;
    const ctx = this.engine.ctx;
    const rnd = this.engine.rnd;
    const out = this.engine.buses.ambience.channel({ hall: 0.35, delay: 0.1 });
    const fade = gain(ctx, 0);
    fade.gain.setValueAtTime(0, at);
    fade.gain.linearRampToValueAtTime(1, at + 2.5);
    fade.connect(out);
    const v = makeVoice(ctx, fade);
    if (bed.wind) {
      const w = bed.wind;
      // Two decorrelated wind bands, panned apart, each wandering slowly.
      for (const side of [-0.6, 0.6]) {
        const n = v.add(noise(ctx, "pink", at, rnd));
        const bp = filter(ctx, "bandpass", w.f * (side < 0 ? 0.85 : 1.15), w.q, at);
        v.add(lfo(ctx, w.rate * (0.8 + rnd() * 0.4), 700, bp.detune, at));
        const g = gain(ctx, w.gain);
        v.add(lfo(ctx, w.rate * 1.7 + rnd() * 0.05, w.gain * 0.6, g.gain, at));
        n.connect(bp).connect(g).connect(panner(ctx, side)).connect(v.out);
      }
    }
    if (bed.rumble) {
      const n = v.add(noise(ctx, "brown", at, rnd));
      const lp = filter(ctx, "lowpass", 120, 0.8, at);
      const g = gain(ctx, bed.rumble);
      v.add(lfo(ctx, 0.05, bed.rumble * 0.5, g.gain, at));
      n.connect(lp).connect(g).connect(v.out);
    }
    if (bed.hearth) {
      const n = v.add(noise(ctx, "brown", at, rnd));
      const bp = filter(ctx, "bandpass", 350, 0.7, at);
      const g = gain(ctx, bed.hearth);
      v.add(lfo(ctx, 0.9, bed.hearth * 0.4, g.gain, at));
      n.connect(bp).connect(g).connect(v.out);
    }
    if (bed.drone) {
      const f = 440 * Math.pow(2, (noteToMidi(bed.drone.note) - 69) / 12);
      const lp = filter(ctx, "lowpass", 260, 3, at);
      v.add(lfo(ctx, 0.04, 600, lp.detune, at));
      for (const d of [-12, 0, 13]) v.add(osc(ctx, "sawtooth", f, at, d)).connect(lp);
      lp.connect(gain(ctx, bed.drone.gain)).connect(v.out);
    }
    this.active = { id: zoneId, out: fade, voice: v, bed };
  }

  private onWindow(from: number, to: number) {
    const a = this.active;
    if (!a) return;
    const rnd = this.engine.rnd;
    const dt = to - from;
    for (const [kind, rate] of Object.entries(a.bed.events) as [EventKind, number][]) {
      // Poisson process: probability of an event in this window.
      if (rnd() < rate * dt) {
        const t = from + rnd() * dt;
        const v = EVENT_FNS[kind](this.engine.ctx, a.out, Math.max(t, this.engine.ctx.currentTime), rnd);
        this.pool.add(v, t);
      }
    }
  }
}
