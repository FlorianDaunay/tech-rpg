/**
 * Valaria's sky after the Sundering: no true day, but a slow tide between a grey "ashen dawn" and
 * deep night. Pure functions of the shared sim clock, so every peer sees the same hour.
 */

/** Seconds for a full cycle (dawn → night → dawn). */
export const CYCLE_SECONDS = 600;
/** Clock offset so a new game starts at early dusk. */
export const START_TIME = CYCLE_SECONDS * 0.3;

/** 0..1 position in the cycle; 0 = brightest (ashen dawn), 0.5 = darkest (midnight). */
export function cyclePhase(time: number): number {
  const p = (time / CYCLE_SECONDS) % 1;
  return p < 0 ? p + 1 : p;
}

/** 0 at the brightest hour, 1 at midnight; smooth (cosine) so changes are imperceptible frame to frame. */
export function nightness(time: number): number {
  return (1 - Math.cos(cyclePhase(time) * Math.PI * 2)) / 2;
}

/** Darkness for a zone's [day, night] range at this time. */
export function darknessAt(time: number, range: readonly [number, number]): number {
  return range[0] + (range[1] - range[0]) * nightness(time);
}
