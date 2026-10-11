import type { Vec2 } from "../math/vec";
import { isAlive, type Actor } from "./actor";

/**
 * PvP rules of a map (null everywhere but arenas). In a PvP map every player (with their pet) is
 * their own side: they can hurt each other. Enemies and NPCs keep their usual teams.
 */
export interface PvpState {
  /** Kills / deaths per player id since entering the arena. */
  score: Record<string, { kills: number; deaths: number; streak: number }>;
  /** Where fallen players come back (the point farthest from their foes). */
  respawns: Vec2[];
}

export const createPvp = (respawns: Vec2[]): PvpState => ({ score: {}, respawns });

/** The side an actor fights for: its team, or in PvP the player (pets fight for their owner). */
export function sideOf(pvp: PvpState | null | undefined, a: Pick<Actor, "id" | "team" | "kind" | "owner">): string {
  if (pvp && a.kind === "player") return a.id;
  if (pvp && a.kind === "pet" && a.owner) return a.owner;
  return a.team;
}

/** Can `a` hurt `b`? NPCs are never hit. */
export const hostile = (pvp: PvpState | null | undefined, a: Pick<Actor, "id" | "team" | "kind" | "owner">, b: Pick<Actor, "id" | "team" | "kind" | "owner">): boolean =>
  a.kind !== "npc" && b.kind !== "npc" && sideOf(pvp, a) !== sideOf(pvp, b);

const entry = (pvp: PvpState, id: string) => (pvp.score[id] ??= { kills: 0, deaths: 0, streak: 0 });

/** A player fell in the arena: the victim's death, the killer's kill (none for a self-inflicted fall). */
export function scoreKill(pvp: PvpState, victim: string, killer: string | null): void {
  const v = entry(pvp, victim);
  v.deaths++;
  v.streak = 0;
  if (!killer || killer === victim) return;
  const k = entry(pvp, killer);
  k.kills++;
  k.streak++;
}

/** The respawn point whose nearest living foe is farthest away (ties: first listed). */
export function pickRespawn(pvp: PvpState, me: Actor, actors: Iterable<Actor>, fallback: Vec2): Vec2 {
  if (!pvp.respawns.length) return fallback;
  const foes = [...actors].filter((o) => o.kind === "player" && o.id !== me.id && isAlive(o));
  if (!foes.length) return pvp.respawns[0]!;
  let best = pvp.respawns[0]!;
  let bestD = -1;
  for (const p of pvp.respawns) {
    const d = Math.min(...foes.map((o) => Math.hypot(o.x - p.x, o.y - p.y)));
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
