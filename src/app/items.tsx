import { RARITY_COLORS, type Rarity } from "@/config/palette";
import { content } from "@/content/registry";
import type { ItemContent, ShieldContent, SwordContent } from "@/content/schemas/combat";
import { getLang } from "@/i18n";

export type ItemInfo =
  | { kind: "sword"; def: SwordContent }
  | { kind: "shield"; def: ShieldContent }
  | { kind: "item"; def: ItemContent };

/** Everything a bag id can be. */
export function itemInfo(id: string): ItemInfo | null {
  const sword = content.swords.find(id);
  if (sword) return { kind: "sword", def: sword };
  const shield = content.shields.find(id);
  if (shield) return { kind: "shield", def: shield };
  const item = content.items.find(id);
  return item ? { kind: "item", def: item } : null;
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
