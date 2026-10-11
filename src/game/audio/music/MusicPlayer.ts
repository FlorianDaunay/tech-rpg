/**
 * Adaptive music: one SongPlayer per playing song (two while crossfading), driven by a shared lookahead scheduler.
 * Each track renders through: voice → vol (track gain × layer level) → [pan] → song fades → music bus (dry + sends).
 */
import type { AudioEngine } from "../AudioEngine";
import { INSTRUMENTS } from "../synth/instruments";
import { gain, panner } from "../synth/core";
import { clamp } from "../theory";
import { beatSeconds, compileSong } from "./pattern";
import { Lookahead, type Timer } from "./scheduler";
import { LAYERS, type CompiledSong, type Layer, type MusicState, type Song } from "./types";

export type LayerLevels = Record<Layer, number>;

export const STATE_LAYERS: Record<MusicState, LayerLevels> = {
  explore: { pad: 1, melody: 1, perc: 1, combat: 0, tension: 0 },
  combat: { pad: 0.8, melody: 0.7, perc: 1, combat: 1, tension: 0.25 },
  boss: { pad: 1, melody: 1, perc: 1, combat: 1, tension: 0.4 },
  "danger-low-hp": { pad: 0.9, melody: 0.35, perc: 0.55, combat: 0.6, tension: 1 },
  silence: { pad: 0, melody: 0, perc: 0, combat: 0, tension: 0 },
};

const compiledCache = new Map<string, CompiledSong>();
export function compiled(song: Song): CompiledSong {
  let c = compiledCache.get(song.id);
  if (!c || c.song !== song) {
    c = compileSong(song);
    compiledCache.set(song.id, c);
  }
  return c;
}

function silentMap(levels: LayerLevels, from: number): Record<Layer, number> {
  const out = {} as Record<Layer, number>;
  for (const l of LAYERS) out[l] = levels[l] <= 0.001 ? from : Infinity;
  return out;
}

interface TrackNode {
  vol: GainNode;
  gain: number;
  layer: Layer;
}

export class SongPlayer {
  readonly c: CompiledSong;
  readonly spb: number;
  private idx = 0;
  private pass = 0;
  private firstLoopIdx: number;
  private readonly tracks = new Map<string, TrackNode>();
  private readonly fades: GainNode[] = [];
  private levels: LayerLevels;
  /** Per layer: time after which the stem is fully silent (Infinity while audible). Lets us skip notes. */
  private silentFrom: Record<Layer, number>;
  done = false;
  /** Set when fading out: stop scheduling after this time. */
  private stopAt = Infinity;

  constructor(
    private readonly engine: AudioEngine,
    song: Song,
    readonly startTime: number,
    levels: LayerLevels,
    fadeIn = 0
  ) {
    this.c = compiled(song);
    this.spb = beatSeconds(song.bpm);
    this.levels = { ...levels };
    this.silentFrom = silentMap(levels, startTime);
    this.firstLoopIdx = this.c.events.findIndex((e) => e.beat >= this.c.introBeats - 1e-6);
    if (this.firstLoopIdx < 0) this.firstLoopIdx = this.c.events.length;
    const ctx = engine.ctx;
    const bus = engine.buses.music;
    const fadeDry = gain(ctx, 1);
    const fadeHall = gain(ctx, 1);
    const fadeDelay = gain(ctx, 1);
    fadeDry.connect(bus.dry);
    fadeHall.connect(bus.hall);
    fadeDelay.connect(bus.delay);
    this.fades.push(fadeDry, fadeHall, fadeDelay);
    if (fadeIn > 0) {
      for (const f of this.fades) {
        f.gain.setValueAtTime(0, startTime);
        f.gain.linearRampToValueAtTime(1, startTime + fadeIn);
      }
    }
    for (const [id, tr] of Object.entries(song.tracks)) {
      const vol = gain(ctx, tr.gain * this.levels[tr.layer]);
      let head: AudioNode = vol;
      if (tr.pan) head = vol.connect(panner(ctx, tr.pan));
      head.connect(fadeDry);
      if (tr.reverb) head.connect(gain(ctx, tr.reverb)).connect(fadeHall);
      if (tr.delay) head.connect(gain(ctx, tr.delay)).connect(fadeDelay);
      this.tracks.set(id, { vol, gain: tr.gain, layer: tr.layer });
    }
  }

  get song() {
    return this.c.song;
  }

  /** Absolute time of the first bar boundary at or after `t`. */
  nextBar(t: number): number {
    const bar = this.spb * this.song.beatsPerBar;
    if (t <= this.startTime) return this.startTime;
    return this.startTime + Math.ceil((t - this.startTime) / bar - 1e-6) * bar;
  }

  /** Total length in seconds of a one-shot song. */
  get length() {
    return this.c.totalBeats * this.spb;
  }

  setLayers(levels: LayerLevels, at: number, crossfade = 1.5) {
    this.levels = { ...levels };
    this.silentFrom = silentMap(levels, at + crossfade * 1.5);
    for (const tn of this.tracks.values()) {
      const p = tn.vol.gain;
      p.cancelScheduledValues(at);
      p.setTargetAtTime(tn.gain * levels[tn.layer], at, crossfade / 3);
    }
  }

  fadeOut(at: number, dur: number) {
    for (const f of this.fades) {
      f.gain.cancelScheduledValues(at);
      f.gain.setTargetAtTime(0, at, dur / 4);
    }
    this.stopAt = at + dur;
  }

  /** Fade to a level (stinger ducking). */
  fadeTo(level: number, at: number, dur: number) {
    for (const f of this.fades) f.gain.setTargetAtTime(level, at, dur / 3);
  }

  schedule(from: number, to: number) {
    if (this.done) return;
    const { events, loopBeats } = this.c;
    const looping = this.song.loopFrom !== undefined && loopBeats > 0;
    const ctx = this.engine.ctx;
    const rnd = this.engine.rnd;
    for (let guard = 0; guard < 10000; guard++) {
      let ev = events[this.idx];
      if (!ev) {
        if (!looping) {
          this.done = true;
          return;
        }
        this.pass++;
        this.idx = this.firstLoopIdx;
        ev = events[this.idx];
        if (!ev) return;
      }
      const time = this.startTime + (ev.beat + this.pass * loopBeats) * this.spb;
      if (time >= to) return;
      if (time >= this.stopAt) {
        this.done = true;
        return;
      }
      this.idx++;
      // Late (starved timer): skip rather than burst a pile of notes at "now" (sounds like a stutter).
      if (time < from - 0.05 || time < ctx.currentTime - 0.03) continue;
      const tr = this.song.tracks[ev.track]!;
      const tn = this.tracks.get(ev.track)!;
      if (time > this.silentFrom[tr.layer]) continue; // silent stem: save CPU
      const jitter = ((tr.humanize ?? 6) / 1000) * (rnd() * 2 - 1);
      const t = Math.max(ctx.currentTime, time + jitter);
      const vel = clamp(ev.vel * (1 + (tr.velJitter ?? 0.08) * (rnd() * 2 - 1)), 0.05, 1);
      const inst = INSTRUMENTS[tr.instrument];
      const notes = ev.notes.length ? ev.notes : [NaN];
      for (const midi of notes) {
        const v = inst(ctx, tn.vol, { t, dur: ev.dur * this.spb, midi, vel, params: tr.params ?? {}, rnd });
        this.engine.musicPool.add(v, t);
      }
    }
  }
}

export interface MusicPlayerOptions {
  songs: Record<string, Song>;
  /** zoneId → song id (defaults to the zone id itself). */
  zoneSongs?: Record<string, string>;
  bossSong?: string;
  timer?: Timer;
}

/** Music director: zone song + state machine + stingers. */
export class MusicPlayer {
  private current: SongPlayer | null = null;
  private others: SongPlayer[] = [];
  private zone: string | null = null;
  private state: MusicState = "explore";
  private readonly lookahead: Lookahead;
  private stingUntil = 0;

  constructor(private readonly engine: AudioEngine, private readonly opts: MusicPlayerOptions) {
    this.lookahead = new Lookahead({
      clock: { now: () => engine.ctx.currentTime },
      timer: opts.timer,
      // A wide window rides out main-thread stalls (loot bursts, level-up saves) without late notes.
      intervalMs: 40,
      lookahead: 0.35,
      maxLate: 0.5,
      onWindow: (from, to) => this.onWindow(from, to),
    });
  }

  get currentSong(): string | null {
    return this.current?.song.id ?? null;
  }
  get currentState(): MusicState {
    return this.state;
  }
  get currentZone(): string | null {
    return this.zone;
  }

  start() {
    this.lookahead.start();
  }
  stop() {
    this.lookahead.stop();
  }

  /** Offline rendering: schedule everything up to `t`. */
  advanceTo(t: number) {
    this.lookahead.advanceTo(t);
  }

  private onWindow(from: number, to: number) {
    if (this.current) this.current.schedule(from, to);
    for (const p of this.others) p.schedule(from, to);
    this.others = this.others.filter((p) => !p.done);
    if (this.current?.done && this.current.song.loopFrom === undefined) this.current = null;
  }

  private songFor(zone: string): Song | undefined {
    const id = this.opts.zoneSongs?.[zone] ?? zone;
    return this.opts.songs[id];
  }

  private desiredSong(): Song | undefined {
    if (this.state === "silence") return undefined;
    if (this.state === "boss") return this.opts.songs[this.opts.bossSong ?? "boss"];
    return this.zone ? this.songFor(this.zone) : undefined;
  }

  /** Switch songs with a crossfade (or start one). */
  private switchTo(song: Song | undefined, at: number, fade = 2) {
    if (this.current && song && this.current.song.id === song.id) return;
    if (this.current) {
      this.current.fadeOut(at, fade);
      this.others.push(this.current);
      this.current = null;
    }
    if (!song) return;
    this.engine.setTempo(song.bpm);
    const start = at + (this.others.length ? 0.4 : 0.05);
    this.current = new SongPlayer(this.engine, song, start, STATE_LAYERS[this.state === "boss" ? "boss" : this.state], this.others.length ? fade * 0.6 : 0.8);
  }

  setZone(zoneId: string, at = this.engine.ctx.currentTime) {
    this.zone = zoneId;
    this.switchTo(this.desiredSong(), at);
  }

  /** Play a specific song directly (sound test, cutscenes). */
  playSong(songId: string, at = this.engine.ctx.currentTime) {
    const song = this.opts.songs[songId];
    if (!song) return;
    this.zone = songId;
    if (this.state === "boss" || this.state === "silence") this.state = "explore";
    this.switchTo(song, at, 1.2);
  }

  setState(state: MusicState, at = this.engine.ctx.currentTime) {
    if (state === this.state) return;
    const prev = this.state;
    this.state = state;
    this.engine.setMuffle(state === "danger-low-hp" ? 0.55 : 0, at);
    const want = this.desiredSong();
    const changesSong = state === "boss" || prev === "boss" || state === "silence" || prev === "silence";
    if (changesSong && want?.id !== this.current?.song.id) {
      this.switchTo(want, at, state === "silence" ? 2.5 : 1.5);
      return;
    }
    if (this.current) {
      const bar = this.current.nextBar(at + 0.05);
      // Don't wait more than ~1 s for a slow song's bar line.
      const when = bar - at > 1.2 ? at + 0.05 : bar;
      this.current.setLayers(STATE_LAYERS[state], when, state === "combat" ? 1 : 1.8);
    }
  }

  /** One-shot stinger over the ducked music (victory, defeat). */
  sting(songId: string, at = this.engine.ctx.currentTime) {
    const song = this.opts.songs[songId];
    if (!song) return;
    const p = new SongPlayer(this.engine, song, at + 0.05, STATE_LAYERS.boss, 0);
    this.others.push(p);
    const end = at + p.length;
    this.stingUntil = end;
    if (this.current) {
      this.current.fadeTo(0.15, at, 0.3);
      this.current.fadeTo(1, end, 2.5);
    }
  }

  stopAll(fade = 1, at = this.engine.ctx.currentTime) {
    this.zone = null;
    this.switchTo(undefined, at, fade);
    this.stingUntil = 0;
  }

  get stingPlaying() {
    return this.engine.ctx.currentTime < this.stingUntil;
  }

  static readonly layers = LAYERS;
}
