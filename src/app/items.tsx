import { RARITY_COLORS, type Rarity } from "@/config/palette";
import { content } from "@/content/registry";
import type { ItemContent, ShieldContent, SwordContent } from "@/content/schemas/combat";
import { getLang, t } from "@/i18n";
import { baseOf } from "@/core/combat/defs";
import { gearTier } from "@/core/combat/gear";

export type ItemInfo =
  | { kind: "sword"; def: SwordContent }
  | { kind: "shield"; def: ShieldContent }
  | { kind: "item"; def: ItemContent };

/** Everything a bag id can be (rolled gear keys resolve to their base sword or shield). */
export function itemInfo(key: string): ItemInfo | null {
  const id = baseOf(key);
  const sword = content.swords.find(id);
  if (sword) return { kind: "sword", def: sword };
  const shield = content.shields.find(id);
  if (shield) return { kind: "shield", def: shield };
  const item = content.items.find(id);
  return item ? { kind: "item", def: item } : null;
}

const STAT_LABELS = {
  maxHp: "stats.hp",
  power: "stats.power",
  defense: "stats.defense",
  critChance: "stats.crit",
  critMultiplier: "stats.critDamage",
  maxPoise: "stats.poise",
  speed: "stats.speed",
} as const;

/** "Power +3", "Critical +4%", "Critical damage +20%". */
export function statLine(stat: string, value: number): string {
  const label = stat in STAT_LABELS ? t(STAT_LABELS[stat as keyof typeof STAT_LABELS]) : stat;
  const pct = stat === "critChance" || stat === "critMultiplier";
  const n = pct ? Math.round(value * 100) : Math.round(value * 10) / 10;
  return `${label} ${n >= 0 ? "+" : ""}${n}${pct ? "%" : ""}`;
}

export const localized = (text: { en: string; fr?: string }) => (getLang() === "fr" ? (text.fr ?? text.en) : text.en);

const GLYPHS: Record<string, string> = { currency: "●", material: "◆", consumable: "⚱", key: "⚷" };

/**
 * Item slot: rarity frame (generated UI art) + icon, or a glyph when the item has no sprite yet.
 * Pixel art is drawn crisp at an integer scale.
 */
export function ItemIcon({ id, size = 48, count }: { id: string | null; size?: number; count?: number }) {
  const info = id ? itemInfo(id) : null;
  const rarity: Rarity = info?.def.rarity ?? "common";
  const icon = info?.def.icon;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <img src={`assets/ui/item-frame-${rarity}.png`} alt="" className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
      {icon ? (
        <img src={`assets/${icon}.png`} alt="" className="relative" style={{ width: size * 0.75, height: size * 0.75, imageRendering: "pixelated" }} />
      ) : info ? (
        <span className="relative text-lg leading-none" style={{ color: RARITY_COLORS[rarity] }}>{GLYPHS[info.kind === "item" ? info.def.kind : "material"]}</span>
      ) : null}
      {count !== undefined && count > 1 && (
        <span className="absolute bottom-0.5 right-1 font-pixel text-[9px] leading-none text-text-primary drop-shadow-[0_1px_0_rgb(0_0_0)]">{count > 999 ? "999+" : count}</span>
      )}
    </span>
  );
}

/** Display name of a bag key: forged gear shows its tier ("Cinder Edge +2"). */
export function itemName(key: string): string {
  const info = itemInfo(key);
  const cosmetic = info ? undefined : content.cosmetics.find(key);
  const name = info ? localized(info.def.name) : cosmetic ? localized(cosmetic.name) : key;
  const tier = info && info.kind !== "item" ? gearTier(key) : 0;
  return tier > 0 ? `${name} +${tier}` : name;
}

/** A cosmetic as a slot: its colour (and trinket shape) in a frame. */
export function CosmeticIcon({ id, size = 48 }: { id: string; size?: number }) {
  const def = content.cosmetics.find(id);
  if (!def) return null;
  const glyph = def.kind === "lantern" ? "✹" : def.kind === "trail" ? "∴" : ({ bow: "⋈", crown: "♛", scarf: "≋", bell: "◓" } as const)[def.shape ?? "bow"];
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <img src="assets/ui/item-frame-rare.png" alt="" className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
      <span className="relative text-xl leading-none" style={{ color: def.color, textShadow: `0 0 8px ${def.color}` }}>{glyph}</span>
    </span>
  );
}

/** Icon of anything a shop sells. */
export const WareIcon = ({ id, size = 44, count }: { id: string; size?: number; count?: number }) =>
  content.cosmetics.find(id) ? <CosmeticIcon id={id} size={size} /> : <ItemIcon id={id} size={size} count={count} />;
