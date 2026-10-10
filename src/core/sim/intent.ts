import type { Vec2 } from "../math/vec";

/** Every action a player can trigger. Input devices map to these; gameplay never sees keys. */
export const ACTIONS = [
  "attack",
  "heavy",
  "dodge",
  "block",
  "skill1",
  "skill2",
  "ultimate",
  "interact",
  "pause",
  "map",
  "inventory",
] as const;
export type Action = (typeof ACTIONS)[number];

/** Discrete player commands from menus (inventory). They travel with the Intent so the host applies them. */
export type Command =
  | { type: "equip"; slot: "weapon" | "shield"; item: string | null }
  | { type: "use"; item: string }
  /** A dialogue choice (the host re-validates conditions before applying effects). */
  | { type: "dialogue"; dialogue: string; node: string; choice: number };

/** What one player wants this tick. Serializable: it's also the network input message. */
export interface Intent {
  /** Analog movement, length ≤ 1. */
  move: Vec2;
  /** Aim direction (normalized) or null to aim where the player faces. */
  aim: Vec2 | null;
  /** Actions held this tick. */
  held: Action[];
  /** Actions that went down this tick (edge). */
  pressed: Action[];
  /** Menu commands issued this tick (rare). */
  commands?: Command[];
}

export const emptyIntent = (): Intent => ({ move: { x: 0, y: 0 }, aim: null, held: [], pressed: [] });
