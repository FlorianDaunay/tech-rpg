/**
 * Lookahead scheduler ("a tale of two clocks"): a coarse JS timer wakes up every `intervalMs`
 * and asks for everything in [scheduledUntil, now + lookahead) to be scheduled on the precise
 * audio clock. Notes are never timed with setTimeout.
 *
 * Clock and timer are injected so the logic is testable with a fake clock.
 */

export interface Clock {
  /** Seconds on the audio clock (AudioContext.currentTime). */
  now(): number;
}

export interface Timer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const browserTimer: Timer = {
  set: (fn, ms) => setInterval(fn, ms),
  clear: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export interface LookaheadOptions {
  clock: Clock;
  timer?: Timer;
  intervalMs?: number;
  lookahead?: number;
  /**
   * If the timer was starved (background tab) and the window start fell behind `now` by more than this,
   * the window is moved forward so we don't burst a pile of late notes.
   */
  maxLate?: number;
  onWindow: (from: number, to: number) => void;
}

export class Lookahead {
  private handle: unknown = null;
  private until: number | null = null;
  readonly intervalMs: number;
  readonly lookahead: number;
  private readonly maxLate: number;

  constructor(private readonly opts: LookaheadOptions) {
    this.intervalMs = opts.intervalMs ?? 25;
    this.lookahead = opts.lookahead ?? 0.1;
    this.maxLate = opts.maxLate ?? 0.2;
  }

  get running() {
    return this.handle !== null;
  }

  /** End of the region already handed to `onWindow`. */
  get scheduledUntil() {
    return this.until;
  }

  start() {
    if (this.handle !== null) return;
    this.tick();
    this.handle = (this.opts.timer ?? browserTimer).set(() => this.tick(), this.intervalMs);
  }

  stop() {
    if (this.handle !== null) (this.opts.timer ?? browserTimer).clear(this.handle);
    this.handle = null;
  }

  /** One scheduling pass. Public so offline rendering and tests can drive it. */
  tick() {
    const now = this.opts.clock.now();
    const to = now + this.lookahead;
    let from = this.until ?? now;
    if (from < now - this.maxLate) from = now;
    if (to > from) {
      this.opts.onWindow(from, to);
      this.until = to;
    }
  }

  /** Schedule everything up to an absolute time (offline rendering). */
  advanceTo(to: number) {
    const from = this.until ?? this.opts.clock.now();
    if (to > from) {
      this.opts.onWindow(from, to);
      this.until = to;
    }
  }
}
