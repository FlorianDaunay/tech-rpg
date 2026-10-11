/** How far in the past remote actors are shown: smooth motion between two snapshots. */
export const INTERP_DELAY_MS = 100;
const KEEP_MS = 1000;

interface Sample {
  at: number;
  x: number;
  y: number;
}

/**
 * Per-actor position history (local receive time). `at(now)` returns the position `INTERP_DELAY_MS`
 * ago, interpolated between the two surrounding samples; never extrapolates past the newest one.
 */
export class InterpBuffer {
  private readonly samples = new Map<string, Sample[]>();

  push(id: string, at: number, x: number, y: number): void {
    let list = this.samples.get(id);
    if (!list) this.samples.set(id, (list = []));
    // Teleports (map edge, revive) are not smoothed: a jump > 96 px restarts the history.
    const last = list[list.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) > 96) list.length = 0;
    list.push({ at, x, y });
    while (list.length > 2 && list[1]!.at < at - KEEP_MS) list.shift();
  }

  at(id: string, now: number): { x: number; y: number } | null {
    const list = this.samples.get(id);
    if (!list?.length) return null;
    const t = now - INTERP_DELAY_MS;
    if (t <= list[0]!.at) return { x: list[0]!.x, y: list[0]!.y };
    for (let i = list.length - 1; i > 0; i--) {
      const a = list[i - 1]!;
      const b = list[i]!;
      if (t >= a.at && t <= b.at) {
        const k = b.at === a.at ? 1 : (t - a.at) / (b.at - a.at);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    const newest = list[list.length - 1]!;
    return { x: newest.x, y: newest.y };
  }

  /** Forget actors that left. */
  retain(ids: ReadonlySet<string>): void {
    for (const id of this.samples.keys()) if (!ids.has(id)) this.samples.delete(id);
  }
}
