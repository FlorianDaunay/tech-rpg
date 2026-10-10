import { normalize, type Vec2 } from "../math/vec";
import { isAlive, type Actor } from "./actor";

/**
 * Aim assist (touch, or gamepad without the right stick): the nearest living foe within `range`
 * and within `coneDeg` of the current aim, or null to keep the current aim.
 */
export function assistAim(self: Actor, actors: Iterable<Actor>, range = 70, coneDeg = 110): Vec2 | null {
  const cos = Math.cos(((coneDeg / 2) * Math.PI) / 180);
  let best: Vec2 | null = null;
  let bestScore = Infinity;
  for (const o of actors) {
    if (o.team === self.team || o.kind === "npc" || !isAlive(o)) continue;
    const dx = o.x - self.x;
    const dy = o.y - self.y;
    const d = Math.hypot(dx, dy);
    if (d > range || d < 1e-3) continue;
    const dot = (dx * self.aim.x + dy * self.aim.y) / d;
    if (dot < cos) continue;
    // Prefer close and centred targets.
    const score = d * (2 - dot);
    if (score < bestScore) {
      bestScore = score;
      best = normalize({ x: dx, y: dy });
    }
  }
  return best;
}
