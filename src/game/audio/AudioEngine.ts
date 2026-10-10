/**
 * Audio graph:
 *
 *   voices ─► Bus{music|sfx|ui|ambience} ─ dry ───────────────┐
 *                                       ├ hall send ─► Convolver(2.5 s) ─┤
 *                                       ├ room send ─► Convolver(0.8 s) ─┼─► master ─► HPF ─► glue comp ─► limiter ─► out
 *                                       └ delay send ─► feedback delay ──┘
 *
 * Each bus input (dry + sends) is a GainNode set to `volume × duck`, so the bus volume also scales its reverb.
 * The music bus has a lowpass on its dry + hall paths for the "low HP" muffle.
 * Works with an AudioContext (live) or an OfflineAudioContext (rendering): pass the context in.
 */
import { type Ctx, gain, makeImpulse, VoicePool } from "./synth/core";
import { clamp, makeRng, sliderToGain } from "./theory";

export type BusId = "music" | "sfx" | "ui" | "ambience";

export interface Sends {
  hall?: number;
  room?: number;
  delay?: number;
}

export class Bus {
  readonly dry: GainNode;
  readonly hall: GainNode;
  readonly room: GainNode;
  readonly delay: GainNode;
  /** Present on the music bus only. */
  readonly muffle: BiquadFilterNode[] = [];
  private volume = 1;
  private duckLevel = 1;

  constructor(private readonly ctx: Ctx, readonly id: BusId) {
    this.dry = gain(ctx, 1);
    this.hall = gain(ctx, 1);
    this.room = gain(ctx, 1);
    this.delay = gain(ctx, 1);
  }

  private get params() {
    return [this.dry.gain, this.hall.gain, this.room.gain, this.delay.gain];
  }

  private apply(timeConstant: number) {
    const v = this.volume * this.duckLevel;
    const t = this.ctx.currentTime;
    for (const p of this.params) {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(v, t, timeConstant);
    }
  }

  setVolume(gainValue: number) {
    this.volume = gainValue;
    this.apply(0.05);
  }

  /** 1 = no duck, 0.3 = music at 30 %. */
  setDuck(level: number, ms: number) {
    this.duckLevel = clamp(level, 0, 1);
    this.apply(Math.max(0.01, ms / 1000 / 3));
  }

  /** Connect a source through a per-source channel with its own send levels. Returns the channel input. */
  channel(sends: Sends = {}): GainNode {
    const input = gain(this.ctx, 1);
    input.connect(this.dry);
    if (sends.hall) input.connect(gain(this.ctx, sends.hall)).connect(this.hall);
    if (sends.room) input.connect(gain(this.ctx, sends.room)).connect(this.room);
    if (sends.delay) input.connect(gain(this.ctx, sends.delay)).connect(this.delay);
    return input;
  }
}

export interface EngineOptions {
  /** Max simultaneous music voices. */
  musicVoices?: number;
  sfxVoices?: number;
  seed?: number;
}

export class AudioEngine {
  readonly buses: Record<BusId, Bus>;
  readonly master: GainNode;
  readonly musicPool: VoicePool;
  readonly sfxPool: VoicePool;
  readonly rnd: () => number;
  private readonly delayNode: DelayNode;
  private readonly delayFeedback: GainNode;
  private masterVolume = 1;

  constructor(readonly ctx: Ctx, opts: EngineOptions = {}) {
    this.rnd = opts.seed !== undefined ? makeRng(opts.seed) : Math.random;
    this.musicPool = new VoicePool(opts.musicVoices ?? 26);
    this.sfxPool = new VoicePool(opts.sfxVoices ?? 18);

    // Master chain: subsonic cut → glue compressor → makeup → brickwall-ish limiter.
    this.master = gain(ctx, 1);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 28;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 14;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.02;
    glue.release.value = 0.3;
    const makeup = gain(ctx, 1.25);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 1;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.master.connect(hp).connect(glue).connect(makeup).connect(limiter).connect(ctx.destination);

    // Shared FX returns.
    const hall = ctx.createConvolver();
    hall.buffer = makeImpulse(ctx, 2.6, { preDelay: 0.03, damping: 0.65, seed: 7 });
    const hallReturn = gain(ctx, 0.55);
    hall.connect(hallReturn).connect(this.master);
    const room = ctx.createConvolver();
    room.buffer = makeImpulse(ctx, 0.8, { preDelay: 0.008, damping: 0.4, early: 10, seed: 13 });
    const roomReturn = gain(ctx, 0.5);
    room.connect(roomReturn).connect(this.master);

    this.delayNode = ctx.createDelay(2);
    this.delayNode.delayTime.value = 0.375;
    this.delayFeedback = gain(ctx, 0.38);
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = "lowpass";
    delayTone.frequency.value = 2400;
    const delayHp = ctx.createBiquadFilter();
    delayHp.type = "highpass";
    delayHp.frequency.value = 250;
    this.delayNode.connect(delayTone).connect(delayHp).connect(this.delayFeedback).connect(this.delayNode);
    const delayReturn = gain(ctx, 0.5);
    delayHp.connect(delayReturn).connect(this.master);
    delayReturn.connect(gain(ctx, 0.3)).connect(hall); // echoes bloom into the hall

    const mk = (id: BusId) => {
      const b = new Bus(ctx, id);
      b.hall.connect(hall);
      b.room.connect(room);
      b.delay.connect(this.delayNode);
      return b;
    };
    this.buses = { music: mk("music"), sfx: mk("sfx"), ui: mk("ui"), ambience: mk("ambience") };
    for (const id of ["sfx", "ui", "ambience"] as const) this.buses[id].dry.connect(this.master);

    // Music: lowpass "muffle" (danger) on dry and hall paths.
    const music = this.buses.music;
    const m1 = ctx.createBiquadFilter();
    m1.type = "lowpass";
    m1.frequency.value = 20000;
    m1.Q.value = 0.5;
    music.dry.connect(m1).connect(this.master);
    const m2 = ctx.createBiquadFilter();
    m2.type = "lowpass";
    m2.frequency.value = 20000;
    m2.Q.value = 0.5;
    music.hall.disconnect();
    music.hall.connect(m2).connect(hall);
    music.muffle.push(m1, m2);
  }

  get now() {
    return this.ctx.currentTime;
  }

  /** Delay time follows the song tempo (dotted eighth). */
  setTempo(bpm: number) {
    const t = this.ctx.currentTime;
    this.delayNode.delayTime.setTargetAtTime(clamp((60 / bpm) * 0.75, 0.05, 1.9), t, 0.1);
  }

  /** Lowpass the music (danger/low HP). 1 = open, 0 = very muffled. */
  setMuffle(amount: number, at = this.ctx.currentTime) {
    const f = 20000 * Math.pow(600 / 20000, clamp(amount, 0, 1));
    for (const m of this.buses.music.muffle) m.frequency.setTargetAtTime(f, at, 0.4);
  }

  setMasterVolume(slider: number) {
    this.masterVolume = sliderToGain(slider);
    this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.05);
  }

  setBusVolume(id: BusId, slider: number) {
    this.buses[id].setVolume(sliderToGain(slider));
  }

  /** Duck music + ambience (dialogue, pause). amount 0 = release. */
  duck(amount: number, ms = 300) {
    const level = 1 - clamp(amount, 0, 1);
    this.buses.music.setDuck(level, ms);
    this.buses.ambience.setDuck(level, ms);
  }
}
