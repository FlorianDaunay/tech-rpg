import { z } from "zod";
import { TALENT_STATS, TALENT_TREES, type EnemyDef, type ItemDef, type LootTableDef, type ReactionDef, type ShieldDef, type SkillDef, type StatusDef, type TalentDef, type WeaponDef } from "@/core/combat/defs";
import type { Move } from "@/core/combat/moves";
import { AssetKey, ElementSchema, Id, LocalizedText, RaritySchema, ref, refAny } from "./common";

/**
 * Combat content: moves, enemies, statuses, elemental reactions, swords, shields, items, loot tables.
 * Each schema's output must satisfy the matching `core/combat/defs` interface (checked below), so the
 * JSON drives the rules directly. One JSON file per entry in `data/<type>/`.
 */

const seconds = z.number().nonnegative();
const OnHit = z.object({ status: ref("status"), chance: z.number().min(0).max(1) }).describe("Status a hit may apply");

export const MoveSchema = z
  .object({
    id: Id,
    windup: seconds.describe("Before the hit lands (s). Enemy attacks: this is the telegraph"),
    active: seconds.describe("Hitbox live (s)"),
    recovery: seconds.describe("Vulnerable after the hit (s)"),
    hitbox: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("arc"), range: z.number().positive(), angle: z.number().min(1).max(360) }),
      z.object({ kind: z.literal("circle"), radius: z.number().positive(), offset: z.number() }),
    ]),
    damage: z.number().nonnegative().describe("Multiplier on the attacker's power"),
    staminaCost: z.number().nonnegative().default(0),
    knockback: z.number().nonnegative().default(0).describe("Impulse given to targets (px/s)"),
    lunge: z.number().default(0).describe("Forward impulse on the attacker (px/s)"),
    weight: z.enum(["light", "medium", "heavy"]).describe("Feel: hit-stop, shake, VFX size"),
    next: ref("move").optional().describe("Next combo step when attack is pressed again"),
    poise: z.number().nonnegative().default(0).describe("Poise damage (staggers at 0)"),
    projectile: z.object({ speed: z.number().positive(), radius: z.number().positive(), range: z.number().positive() }).optional(),
    element: ElementSchema.optional(),
    onHit: OnHit.optional(),
  })
  .describe("Move");

const Stats = z.object({
  maxHp: z.number().positive(),
  power: z.number().nonnegative(),
  defense: z.number().default(0),
  critChance: z.number().min(0).max(1).default(0),
  critMultiplier: z.number().min(1).default(1.5),
  maxPoise: z.number().nonnegative(),
  speed: z.number().nonnegative().describe("px/s"),
});

const Resist = z.partialRecord(ElementSchema, z.number().nonnegative()).default({}).describe("Damage taken multiplier per element");

export const EnemySchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    look: AssetKey.describe("Character sheet (3×4 Pipoya layout)"),
    family: z.enum(["hollow", "undead", "beast", "construct", "spirit"]),
    zones: z.array(z.string()).default([]).describe("Where it lives (bestiary)"),
    stats: Stats,
    ai: z.enum(["melee", "brute", "ranged"]),
    attack: ref("move"),
    aggroRange: z.number().positive(),
    attackRange: z.number().positive(),
    attackCooldown: seconds,
    radius: z.number().positive().default(6),
    xp: z.number().int().nonnegative(),
    loot: ref("loot").optional(),
    resist: Resist,
  })
  .describe("Enemy");

export const StatusSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    element: ElementSchema.optional(),
    duration: z.number().positive(),
    maxStacks: z.number().int().min(1).default(1),
    tickDamage: z.number().nonnegative().default(0).describe("Per tick per stack, fraction of the applier's power"),
    tickInterval: z.number().positive().default(1),
    speedMult: z.number().nonnegative().default(1),
    damageTakenMult: z.number().nonnegative().default(1),
    stun: z.boolean().default(false),
  })
  .describe("Status effect");

export const ReactionSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    on: ElementSchema.describe("Element already on the target"),
    by: ElementSchema.describe("Element of the incoming hit"),
    damage: z.number().nonnegative().describe("Bonus damage, fraction of the hit's power"),
    radius: z.number().nonnegative().default(0),
    applies: ref("status").optional(),
    poise: z.number().nonnegative().default(0),
  })
  .refine((r) => r.on !== r.by, "a reaction needs two different elements")
  .describe("Elemental reaction");

const ItemBase = {
  id: Id,
  name: LocalizedText,
  description: LocalizedText,
  rarity: RaritySchema.default("common"),
  icon: AssetKey.optional(),
  value: z.number().int().nonnegative().default(0).describe("Sell price in gold"),
};

export const SwordSchema = z
  .object({
    ...ItemBase,
    family: z.enum(["blade", "greatblade", "rapier"]).describe("Moveset family (weapon mastery)"),
    level: z.number().int().min(1).default(1),
    light: ref("move").describe("First move of the light combo"),
    heavy: ref("move"),
    element: ElementSchema.optional(),
    onHit: OnHit.optional(),
    bonus: z
      .object({ power: z.number().optional(), critChance: z.number().optional(), critMultiplier: z.number().optional(), speed: z.number().optional() })
      .default({}),
    emberBlade: z.number().int().min(1).max(30).optional().describe("One of the 30 Ember Blades (lore relic number)"),
  })
  .describe("Sword");

export const ShieldSchema = z
  .object({
    ...ItemBase,
    level: z.number().int().min(1).default(1),
    reduction: z.number().min(0).max(1),
    parryWindow: z.number().positive(),
    staminaPerDamage: z.number().nonnegative(),
    defense: z.number().default(0),
  })
  .describe("Shield");

export const ItemSchema = z
  .object({
    ...ItemBase,
    kind: z.enum(["currency", "material", "consumable", "key"]),
    stack: z.number().int().min(1).default(99),
    effect: z.object({ heal: z.number().optional(), stamina: z.number().optional(), status: ref("status").optional() }).optional(),
  })
  .describe("Item");

export const LootTableSchema = z
  .object({
    id: Id,
    rolls: z.number().int().nonnegative().default(1),
    chance: z.number().min(0).max(1).default(1),
    entries: z
      .array(z.object({ item: refAny(["item", "sword", "shield"]), weight: z.number().positive(), min: z.number().int().min(1).default(1), max: z.number().int().min(1).default(1) }))
      .default([]),
    gold: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).default({ min: 0, max: 0 }),
  })
  .refine((t) => t.gold.min <= t.gold.max && t.entries.every((e) => e.min <= e.max), "min must be ≤ max")
  .describe("Loot table");

export const SkillSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    kind: z.enum(["skill", "ultimate"]).describe("Skill slots (1, 2) or the ultimate slot"),
    move: ref("move").describe("Move performed (melee, area or projectile)"),
    cooldown: z.number().min(0).describe("Seconds before it can be used again"),
    unlockLevel: z.number().int().min(1).default(1).describe("Character level that unlocks it"),
    charge: z.number().int().min(0).default(0).describe("Ultimates: damage to deal to fill the Ember gauge"),
    element: ElementSchema.optional().describe("Colour of its HUD glyph (the move decides the real element)"),
  })
  .refine((s) => s.kind !== "ultimate" || s.charge > 0, "ultimates need a charge > 0")
  .describe("Skill");

export const TalentSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    tree: z.enum(TALENT_TREES).describe("Constellation: Blade (offence), Ward (defence), Arcana (skills)"),
    x: z.number().int().min(0).max(4).describe("Column in the constellation (0–4)"),
    y: z.number().int().min(0).max(6).describe("Row in the constellation (0 = first)"),
    ranks: z.number().int().min(1).max(5).default(1),
    cost: z.number().int().min(1).default(1).describe("Talent points per rank"),
    requires: z.array(ref("talent")).default([]).describe("Talents that need at least one rank first"),
    treePoints: z.number().int().min(0).default(0).describe("Points already spent in this tree before it opens"),
    stats: z.partialRecord(z.enum(TALENT_STATS), z.number()).default({}).describe("Stats per rank"),
    cooldown: z.number().min(0).max(0.5).default(0).describe("Skill cooldowns shortened by this fraction per rank"),
    ultGain: z.number().min(0).default(0).describe("Ember gauge fills this fraction faster per rank"),
    skill: ref("skill").optional().describe("Unlocks this skill regardless of level"),
  })
  .describe("Talent");

export type MoveContent = z.infer<typeof MoveSchema>;
export type TalentContent = z.infer<typeof TalentSchema>;
export type SkillContent = z.infer<typeof SkillSchema>;
export type EnemyContent = z.infer<typeof EnemySchema>;
export type StatusContent = z.infer<typeof StatusSchema>;
export type ReactionContent = z.infer<typeof ReactionSchema>;
export type SwordContent = z.infer<typeof SwordSchema>;
export type ShieldContent = z.infer<typeof ShieldSchema>;
export type ItemContent = z.infer<typeof ItemSchema>;
export type LootTableContent = z.infer<typeof LootTableSchema>;

// Compile-time contract: content must satisfy what the combat rules read.
type Assert<T extends true> = T;
type Fits<A, B> = A extends B ? true : false;
export type _Contracts = [
  Assert<Fits<MoveContent, Move>>,
  Assert<Fits<EnemyContent, EnemyDef>>,
  Assert<Fits<StatusContent, StatusDef>>,
  Assert<Fits<ReactionContent, ReactionDef>>,
  Assert<Fits<SwordContent, WeaponDef>>,
  Assert<Fits<ShieldContent, ShieldDef>>,
  Assert<Fits<LootTableContent, LootTableDef>>,
  Assert<Fits<ItemContent, ItemDef>>,
  Assert<Fits<SkillContent, SkillDef>>,
  Assert<Fits<TalentContent, TalentDef>>,
];
