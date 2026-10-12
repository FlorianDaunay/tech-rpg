import { useState } from "react";
import { content } from "@/content/registry";
import { findShop } from "@/core/economy/defs";
import { offers, priceFor, sellPrice } from "@/core/economy/economy";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu, useService } from "@/store/menu";
import { Modal, Tabs } from "@/ui/menu/components";
import { itemInfo, itemName, localized, WareIcon } from "../../items";
import { GoldLine, News, sendEconomy, useEconomyNews } from "./common";

/** A shop: its shelf and today's wares (buy), and what it pays for the player's things (sell). */
export function ShopScreen() {
  const inv = useGameStatus((s) => s.inventory);
  const service = useService();
  const back = useMenu((s) => s.back);
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const news = useEconomyNews((ev) =>
    ev.type !== "trade-shop" ? null : ev.count > 0 ? t("shop.bought", { item: itemName(ev.item), count: ev.count }) : t("shop.sold", { item: itemName(ev.item), count: -ev.count, gold: ev.gold })
  );
  const shop = service?.kind === "shop" ? findShop(service.ref) : undefined;
  const meta = service?.kind === "shop" ? content.shops.find(service.ref) : undefined;
  if (!inv || !shop || !meta) return null;
  const buyer = { progress: inv.progress };
  const gold = inv.bag.gold ?? 0;

  const wares = offers(shop, inv.day, buyer);
  const sellable = Object.entries(inv.bag)
    .map(([id, count]) => ({ id, count, each: sellPrice(shop, id) }))
    .filter((x) => x.each > 0)
    .sort((a, b) => b.each - a.each || a.id.localeCompare(b.id));

  return (
    <Modal title={localized(meta.name)} onBack={back} wide footer={<GoldLine gold={gold} />}>
      <Tabs
        tabs={[
          { id: "buy", label: t("shop.buy") },
          ...(shop.buyRate > 0 ? [{ id: "sell" as const, label: t("shop.sell") }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      <News text={news} />
      {tab === "buy" ? (
        <ul className="stagger flex flex-col gap-1.5">
          {wares.map((w, i) => {
            const price = priceFor(w, buyer);
            const cosmetic = content.cosmetics.find(w.item);
            const owned = !!cosmetic && inv.cosmetics.owned.includes(w.item);
            const stackable = !cosmetic && itemInfo(w.item)?.kind === "item";
            const desc = cosmetic ? cosmetic.description : itemInfo(w.item)?.def.description;
            return (
              <li key={`${w.item}-${i}`} className="flex items-center gap-3 rounded-tile border border-border/70 bg-canvas/40 p-2">
                <WareIcon id={w.item} size={40} count={inv.bag[w.item]} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{itemName(w.item)}</span>
                    {w.daily && <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">{t("shop.daily")}</span>}
                  </div>
                  {desc && <div className="truncate text-xs text-text-muted">{localized(desc)}</div>}
                </div>
                <span className={`font-mono text-sm ${gold >= price ? "text-warning" : "text-danger"}`}>● {price}</span>
                {owned ? (
                  <span className="w-24 text-center text-xs text-success">{t("shop.owned")}</span>
                ) : (
                  <div className="flex w-24 justify-end gap-1">
                    {stackable && (
                      <button className="btn-ghost px-2 py-1 text-xs" disabled={gold < price * 5} onClick={() => sendEconomy({ type: "buy", shop: shop.id, item: w.item, count: 5 })}>
                        ×5
                      </button>
                    )}
                    <button className="btn-primary px-3 py-1 text-xs" disabled={gold < price} onClick={() => sendEconomy({ type: "buy", shop: shop.id, item: w.item, count: 1 })}>
                      {t("shop.buyOne")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : sellable.length === 0 ? (
        <p className="text-sm text-text-muted">{t("shop.nothingToSell")}</p>
      ) : (
        <ul className="stagger flex flex-col gap-1.5">
          {sellable.map((x) => {
            return (
              <li key={x.id} className="flex items-center gap-3 rounded-tile border border-border/70 bg-canvas/40 p-2">
                <WareIcon id={x.id} size={40} count={x.count} />
                <div className="min-w-0 flex-1 truncate text-sm">{itemName(x.id)}</div>
                <span className="font-mono text-sm text-warning">● {x.each}</span>
                <div className="flex w-28 justify-end gap-1">
                  {x.count > 1 && (
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => sendEconomy({ type: "sell", shop: shop.id, item: x.id, count: x.count })}>
                      {t("shop.sellAll")}
                    </button>
                  )}
                  <button className="btn-primary px-3 py-1 text-xs" onClick={() => sendEconomy({ type: "sell", shop: shop.id, item: x.id, count: 1 })}>
                    {t("shop.sellOne")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
