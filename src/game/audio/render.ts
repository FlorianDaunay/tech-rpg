/**
 * Offline rendering: run the exact same engine/songs/SFX into an OfflineAudioContext.
 * Used by the dev review script (renders WAVs) and handy for future "export soundtrack" tooling.
 */
import { Ambience } from "./ambience";
import { AudioEngine } from "./AudioEngine";
import { MusicPlayer } from "./music/MusicPlayer";
import { SONGS, ZONE_SONGS } from "./music/songs";
import type { MusicState } from "./music/types";
import { SfxPlayer, type SfxName, type SfxOptions } from "./sfx";

export type RenderEvent =
  | { at: number; state: MusicState }
  | { at: number; sfx: SfxName; opts?: SfxOptions }
  | { at: number; sting: "victory" | "defeat" };

export interface RenderPlan {
  seconds: number;
  sampleRate?: number;
  /** Song id to start at t=0. */
  song?: string;
  /** Ambience bed to start at t=0. */
  ambience?: string;
  events?: RenderEvent[];
  seed?: number;
}

/** Render a plan. Requires OfflineAudioContext (browser). */
export async function renderOffline(plan: RenderPlan): Promise<AudioBuffer> {
  const sr = plan.sampleRate ?? 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * plan.seconds), sr);
  const engine = new AudioEngine(ctx, { seed: plan.seed ?? 1 });
  for (const b of ["music", "sfx", "ui", "ambience"] as const) engine.setBusVolume(b, 1);
  engine.setMasterVolume(1);
  const fakeTimer = { set: () => 0, clear: () => undefined };
  const music = new MusicPlayer(engine, { songs: SONGS, zoneSongs: ZONE_SONGS, bossSong: "boss", timer: fakeTimer });
  const amb = new Ambience(engine, fakeTimer);
  const sfx = new SfxPlayer(engine);
  if (plan.song) music.playSong(plan.song, 0);
  if (plan.ambience) amb.set(plan.ambience, 0);
  const events = [...(plan.events ?? [])].sort((a, b) => a.at - b.at);
  for (const ev of events) {
    music.advanceTo(ev.at);
    amb.advanceTo(ev.at);
    if ("state" in ev) music.setState(ev.state, ev.at);
    else if ("sfx" in ev) sfx.play(ev.sfx, ev.opts, ev.at);
    else music.sting(ev.sting, ev.at);
  }
  music.advanceTo(plan.seconds);
  amb.advanceTo(plan.seconds);
  return ctx.startRendering();
}

/** 16-bit PCM WAV from planar float channels. Pure (unit-tested). */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const nch = channels.length;
  const len = channels[0]?.length ?? 0;
  const bytes = 44 + len * nch * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nch * 2, true);
  v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, len * nch * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Peak and RMS (dBFS) of a rendered buffer, for automated level checks. */
export function levels(channels: Float32Array[]): { peakDb: number; rmsDb: number } {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const s = ch[i]!;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sum += s * s;
      n++;
    }
  }
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / Math.max(1, n))) };
}
