import { z } from "zod";
import { AFFIX_STATS, TALENT_STATS, TALENT_TREES, type AffixDef, type GearSetDef, type PetDef, type EnemyDef, type ItemDef, type LootTableDef, type ReactionDef, type ShieldDef, type SkillDef, type StatusDef, type TalentDef, type WeaponDef } from "@/core/combat/defs";
import type { Move } from "@/core/combat/moves";
import { AssetKey, ElementSchema, Id, LocalizedText, RaritySchema, ref, refAny, SwordFamilySchema } from "./common";

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
    projectile: z
      .object({
        speed: z.number().positive(),
        radius: z.number().positive(),
        range: z.number().positive(),
        count: z.number().int().min(1).max(24).default(1).describe("Projectiles per cast"),
        spread: z.number().min(0).max(360).default(0).describe("Fan width (degrees); 360 = ring all around"),
        homing: z.number().min(0).default(0).describe("Turn rate towards the nearest foe (rad/s)"),
        look: z.enum(["bolt", "shard", "spark", "orb", "arrow", "web"]).optional().describe("Art (default: from the element)"),
      })
      .optional(),
    hazard: z
      .object({
        radius: z.number().positive(),
        delay: z.number().positive().describe("Telegraph time before the blast (s)"),
        at: z.enum(["target", "self"]).default("target"),
        distance: z.number().nonnegative().default(60).describe("Ahead of the attacker when it has no target (px)"),
        count: z.number().int().min(1).max(16).default(1),
        scatter: z.number().nonnegative().default(0).describe("Extra blasts land within this radius of the centre (px)"),
      })
      .optional()
      .describe("Telegraphed ground blasts (circle hits after the delay)"),
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
    moves: z
      .array(z.object({ move: ref("move"), weight: z.number().positive().default(1), range: z.number().positive().describe("Distance it closes to before using it (px)") }))
      .optional()
      .describe("Moveset picked by weight before each attack (absent = always the main attack)"),
    aggroRange: z.number().positive(),
    attackRange: z.number().positive(),
    attackCooldown: seconds,
    radius: z.number().positive().default(6),
    xp: z.number().int().nonnegative(),
    loot: ref("loot").optional(),
    resist: Resist,
    boss: z
      .object({
        arena: z.number().positive().default(220).describe("Arena radius around its spawn (px): it never leaves it, forgets players outside, exits lock while it fights"),
        flag: z.string().optional().describe("Story flag every player gets when it falls"),
        phases: z
          .array(
            z.object({
              below: z.number().min(0).max(1).describe("Starts when hp drops to this fraction (first phase: 1)"),
              attacks: z.array(z.object({ move: ref("move"), weight: z.number().positive().default(1), range: z.number().positive().describe("Distance it closes to before using it (px)") })).min(1),
              attackCooldown: seconds.describe("Seconds between attacks"),
              speed: z.number().positive().default(1).describe("Movement speed multiplier"),
              summon: z
                .object({ enemy: ref("enemy"), count: z.number().int().min(1), every: z.number().positive().optional().describe("Seconds between calls (absent = only on entering the phase)") })
                .optional(),
            })
          )
          .min(1),
      })
      .refine((b) => b.phases.every((p, i) => (i === 0 ? p.below === 1 : p.below < b.phases[i - 1]!.below)), "phases: the first starts at 1, then strictly lower thresholds")
      .optional()
      .describe("Herald: multi-phase fight"),
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
    damageDealtMult: z.number().nonnegative().default(1).describe("Multiplies damage dealt (buffs > 1)"),
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
    family: SwordFamilySchema.describe("Moveset family (weapon mastery)"),
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

export const AffixSchema = z
  .object({
    id: Id,
    name: LocalizedText.describe("Tag shown on the item (e.g. Keen)"),
    slot: z.enum(["weapon", "shield", "any"]).describe("Which gear can roll it"),
    stat: z.enum(AFFIX_STATS).describe("Stat it adds (an item never rolls two affixes on the same stat)"),
    min: z.number().describe("Value at the worst roll"),
    max: z.number().describe("Value at the best roll (whole-number ranges give whole numbers)"),
    weight: z.number().nonnegative().default(1).describe("Relative chance among fitting affixes (0 = never rolls)"),
  })
  .refine((a) => a.min <= a.max, "min must be ≤ max")
  .describe("Affix");

export const GearSetSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    pieces: z.array(refAny(["sword", "shield"])).min(2).describe("Swords and shields of the set (any rolled copy counts)"),
    bonuses: z
      .array(z.object({ pieces: z.number().int().min(2).describe("Pieces worn"), stats: z.partialRecord(z.enum(AFFIX_STATS), z.number()) }))
      .min(1)
      .describe("Bonuses, each active from that many pieces"),
  })
  .refine((s) => s.bonuses.every((b) => b.pieces <= s.pieces.length), "a bonus needs more pieces than the set has")
  .describe("Gear set");

export const PetSchema = z
  .object({
    id: Id,
    name: LocalizedText,
    description: LocalizedText,
    look: AssetKey.describe("Character sheet (3×4 Pipoya layout)"),
    npc: ref("npc").optional().describe("Hub NPC it is until adopted (hidden while it follows someone)"),
    stats: Stats.describe("At owner level 1"),
    perLevel: z.object({ maxHp: z.number().nonnegative().optional(), power: z.number().nonnegative().optional(), defense: z.number().nonnegative().optional() }).default({}).describe("Added per owner level above 1"),
    attack: ref("move"),
    attackRange: z.number().positive(),
    attackCooldown: seconds,
    aggroRange: z.number().positive().default(130).describe("Fights enemies this close to its owner (px)"),
    radius: z.number().positive().default(5),
    revive: z.number().positive().default(8).describe("Seconds before a downed pet gets back up at its owner's side"),
  })
  .describe("Pet");

export type PetContent = z.infer<typeof PetSchema>;
export type AffixContent = z.infer<typeof AffixSchema>;
export type GearSetContent = z.infer<typeof GearSetSchema>;
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
  Assert<Fits<AffixContent, AffixDef>>,
  Assert<Fits<GearSetContent, GearSetDef>>,
  Assert<Fits<PetContent, PetDef>>,
];
