import type { CombatStats } from "./actor";

/**
 * Enemy archetypes. Temporary home: M5 moves these into content JSON (`data/enemies/*.json`),
 * keeping this exact shape.
 */
export interface EnemyDef {
  id: string;
  look: string;
  stats: CombatStats;
  /** Behaviour: melee chaser, heavy slow brute, ranged kiter. */
  ai: "melee" | "brute" | "ranged";
  attack: string;
  aggroRange: number;
  attackRange: number;
  /** Seconds between attacks. */
  attackCooldown: number;
  radius: number;
  xp: number;
}

const def = (d: EnemyDef) => d;

export const ENEMIES: Record<string, EnemyDef> = {
  "hollow-shade": def({
    id: "hollow-shade",
    look: "enemies/enemy-05-1",
    stats: { maxHp: 38, power: 10, defense: 0, critChance: 0, critMultiplier: 1.5, maxPoise: 10, speed: 58 },
    ai: "melee",
    attack: "claw",
    aggroRange: 150,
    attackRange: 30,
    attackCooldown: 1.1,
    radius: 6,
    xp: 8,
  }),
  "grave-brute": def({
    id: "grave-brute",
    look: "enemies/enemy-16-1",
    stats: { maxHp: 120, power: 16, defense: 15, critChance: 0, critMultiplier: 1.5, maxPoise: 60, speed: 40 },
    ai: "brute",
    attack: "slam",
    aggroRange: 140,
    attackRange: 34,
    attackCooldown: 2,
    radius: 8,
    xp: 25,
  }),
  "wisp-caster": def({
    id: "wisp-caster",
    look: "enemies/enemy-15-1",
    stats: { maxHp: 30, power: 9, defense: 0, critChance: 0, critMultiplier: 1.5, maxPoise: 5, speed: 52 },
    ai: "ranged",
    attack: "bolt",
    aggroRange: 190,
    attackRange: 140,
    attackCooldown: 1.8,
    radius: 6,
    xp: 12,
  }),
};

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES[id];
  if (!e) throw new Error(`Unknown enemy "${id}"`);
  return e;
}
