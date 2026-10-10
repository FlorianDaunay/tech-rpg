/**
 * Public audio API. Everything is procedural (no audio files).
 *
 *   import { audio } from "@/game/audio";
 *   audio.installAutoUnlock();          // once at boot: unlocks on the first tap/click/key
 *   audio.sfx("swing-light", { x, y }); // fire-and-forget, spatial when x/y given
 *   audio.setListener(player.x, player.y);
 *   audio.music.setZone("whispering-wilds");
 *   audio.music.setState("combat");
 *   audio.ambience.set("whispering-wilds");
 *   audio.duck(0.6, 300); ... audio.duck(0);
 *
 * Calls made before the context is unlocked are remembered (zone/state/ambience) or dropped (sfx).
 * Volumes follow `useSettings().volume` live (master, music; sfx also drives ui + ambience).
 */
import { useSettings } from "@/store/settings";
import { Ambience } from "./ambience";
import { AudioEngine } from "./AudioEngine";
import { MusicPlayer } from "./music/MusicPlayer";
import { SONGS, ZONE_SONGS } from "./music/songs";
import type { MusicState } from "./music/types";
import { SfxPlayer, type SfxHandle, type SfxName, type SfxOptions } from "./sfx";

export type { MusicState } from "./music/types";
export type { SfxHandle, SfxName, SfxOptions } from "./sfx";
export { SFX_NAMES } from "./sfx";
export { SONGS, SONG_IDS, ZONE_SONGS } from "./music/songs";

type Ctor = typeof AudioContext;
const getCtor = (): Ctor | undefined =>
  typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;

class GameAudio {
  private engine: AudioEngine | null = null;
  private musicPlayer: MusicPlayer | null = null;
  private amb: Ambience | null = null;
  private sfxPlayer: SfxPlayer | null = null;
  private pending: { zone: string | null; song: string | null; state: MusicState; ambience: string | null } = { zone: null, song: null, state: "explore", ambience: null };
  private listenersInstalled = false;
  private unsubSettings: (() => void) | null = null;
  /** We suspended because the page/app went to the background (vs. never unlocked). */
  private backgrounded = false;

  /** True once the AudioContext exists and is running. */
  get unlocked(): boolean {
    return this.engine?.ctx instanceof AudioContext && this.engine.ctx.state === "running";
  }

  /** The live engine (null before unlock). Exposed for the sound test and debugging. */
  get raw(): AudioEngine | null {
    return this.engine;
  }

  /**
   * Create/resume the AudioContext. Must be called from a user gesture handler the first time
   * (iOS Safari, Android WebView autoplay rules). Safe to call repeatedly.
   */
  async unlock(): Promise<void> {
    const C = getCtor();
    if (!C) return;
    if (!this.engine) {
      const ctx = new C({ latencyHint: "interactive" });
      this.engine = new AudioEngine(ctx);
      this.sfxPlayer = new SfxPlayer(this.engine);
      this.musicPlayer = new MusicPlayer(this.engine, { songs: SONGS, zoneSongs: ZONE_SONGS, bossSong: "boss" });
      this.amb = new Ambience(this.engine);
      this.bindSettings();
      this.installLifecycle();
      // iOS: playing a silent buffer inside the gesture is what actually unlocks output.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    }
    const ctx = this.engine.ctx as AudioContext;
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* will retry on next gesture */
      }
    }
    if (ctx.state === "running") {
      this.backgrounded = false;
      this.musicPlayer!.start();
      this.amb!.start();
      this.applyPending();
    }
  }

  /** Unlock on the first pointer/key/touch interaction (call once at boot). Re-arms itself if iOS interrupts audio. */
  installAutoUnlock(target: EventTarget = typeof window !== "undefined" ? window : (undefined as unknown as EventTarget)) {
    if (!target || this.listenersInstalled) return;
    this.listenersInstalled = true;
    const events = ["pointerdown", "touchend", "keydown", "mousedown"];
    const handler = () => {
      void this.unlock().then(() => {
        if (this.unlocked) {
          for (const e of events) target.removeEventListener(e, handler, true);
          this.listenersInstalled = false;
        }
      });
    };
    for (const e of events) target.addEventListener(e, handler, true);
  }

  private applyPending() {
    const p = this.pending;
    const m = this.musicPlayer!;
    if (p.state !== m.currentState) m.setState(p.state);
    if (p.song && p.song !== m.currentSong) m.playSong(p.song);
    else if (p.zone && p.zone !== m.currentZone) m.setZone(p.zone);
    if (p.ambience !== this.amb!.current) this.amb!.set(p.ambience);
  }

  private bindSettings() {
    const apply = (v: { master: number; music: number; sfx: number }) => {
      const e = this.engine;
      if (!e) return;
      e.setMasterVolume(v.master);
      e.setBusVolume("music", v.music);
      e.setBusVolume("sfx", v.sfx);
      e.setBusVolume("ui", v.sfx);
      e.setBusVolume("ambience", v.sfx);
    };
    apply(useSettings.getState().volume);
    this.unsubSettings?.();
    this.unsubSettings = useSettings.subscribe((s, prev) => {
      if (s.volume !== prev.volume) apply(s.volume);
    });
  }

  /** Pause-safe: suspend in background (tab hidden, Capacitor app pause), resume when back. */
  private installLifecycle() {
    if (typeof document === "undefined") return;
    const onHide = () => {
      if (this.engine && this.engine.ctx instanceof AudioContext && this.engine.ctx.state === "running") {
        this.backgrounded = true;
        void this.suspend();
      }
    };
    const onShow = () => {
      if (this.backgrounded) void this.resume();
    };
    document.addEventListener("visibilitychange", () => (document.hidden ? onHide() : onShow()));
    // Cordova-style lifecycle events fired by some WebView shells (harmless elsewhere).
    document.addEventListener("pause", onHide);
    document.addEventListener("resume", onShow);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    // iOS can interrupt the context (calls, Siri): re-arm gesture unlock.
    const ctx = this.engine!.ctx as AudioContext;
    ctx.addEventListener("statechange", () => {
      if (ctx.state !== "running" && !this.backgrounded) this.installAutoUnlock();
    });
  }

  async suspend(): Promise<void> {
    const ctx = this.engine?.ctx;
    if (!(ctx instanceof AudioContext) || ctx.state !== "running") return;
    this.musicPlayer?.stop();
    this.amb?.stop();
    await ctx.suspend();
  }

  async resume(): Promise<void> {
    const ctx = this.engine?.ctx;
    if (!(ctx instanceof AudioContext)) return;
    try {
      await ctx.resume();
    } catch {
      /* needs a gesture: auto-unlock will retry */
      this.installAutoUnlock();
      return;
    }
    if (ctx.state === "running") {
      this.backgrounded = false;
      this.musicPlayer?.start();
      this.amb?.start();
    } else this.installAutoUnlock();
  }

  /** Play a named effect. Returns a handle (stop() is required for loops like "lantern-hum"), or null if not played. */
  sfx(name: SfxName, opts?: SfxOptions): SfxHandle | null {
    if (!this.sfxPlayer || !this.unlocked) return null;
    return this.sfxPlayer.play(name, opts);
  }

  /** World position of the listener (usually the local player) for spatial SFX. */
  setListener(x: number, y: number) {
    if (this.sfxPlayer) {
      this.sfxPlayer.listener.x = x;
      this.sfxPlayer.listener.y = y;
    }
  }

  /** Duck music + ambience by `amount` (0..1) over `ms`. duck(0) restores. */
  duck(amount: number, ms = 300) {
    this.engine?.duck(amount, ms);
  }

  readonly music = {
    /** Zone song (zone ids map to songs, see ZONE_SONGS). */
    setZone: (zoneId: string) => {
      this.pending.zone = zoneId;
      this.pending.song = null;
      if (this.unlocked) this.musicPlayer!.setZone(zoneId);
    },
    /** explore | combat | boss | danger-low-hp | silence. Layer changes land on the next bar. */
    setState: (state: MusicState) => {
      this.pending.state = state;
      if (this.unlocked) this.musicPlayer!.setState(state);
    },
    /** Play a song by id regardless of zone (title screen, cutscenes, sound test). */
    play: (songId: string) => {
      this.pending.song = songId;
      this.pending.zone = null;
      if (this.unlocked) this.musicPlayer!.playSong(songId);
    },
    /** One-shot stinger over ducked music: "victory" | "defeat". */
    sting: (songId: "victory" | "defeat") => {
      if (this.unlocked) this.musicPlayer!.sting(songId);
    },
    stop: (fade = 1.5) => {
      this.pending.zone = null;
      this.pending.song = null;
      this.musicPlayer?.stopAll(fade);
    },
  };

  readonly ambience = {
    /** Zone ambience bed (wind, crickets, drips…); null for none. */
    set: (zoneId: string | null) => {
      this.pending.ambience = zoneId;
      if (this.unlocked) this.amb!.set(zoneId);
    },
  };

  /** Current music song id / state (for UI). */
  get musicInfo(): { song: string | null; state: MusicState } {
    return { song: this.musicPlayer?.currentSong ?? null, state: this.musicPlayer?.currentState ?? this.pending.state };
  }
}

export const audio = new GameAudio();
