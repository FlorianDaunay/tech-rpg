import { content } from "@/content/registry";
import { findDanger } from "@/core/economy/defs";
import { t, type I18nKey } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu, useService } from "@/store/menu";
import { Modal } from "@/ui/menu/components";
import { ItemIcon, itemName, localized } from "../../items";
import { News, sendEconomy, useEconomyNews } from "./common";

/**
 * The brazier by a Rift gate: burn fuel to make the next run harder and richer. Raising pays the
 * difference; lowering is free; the flame dies when the party is back on solid ground.
 */
export function DangerScreen() {
  const inv = useGameStatus((s) => s.inventory);
  const service = useService();
  const back = useMenu((s) => s.back);
  const news = useEconomyNews((ev) => (ev.type === "danger" ? (ev.tier > 0 ? t("danger.lit", { tier: ev.tier }) : t("danger.doused")) : null));
  const danger = service?.kind === "danger" ? findDanger(service.ref) : undefined;
  const rift = service?.kind === "danger" ? content.rifts.find(service.ref) : undefined;
  if (!inv || !danger || !rift) return null;
  const lit = inv.riftDanger;
  const have = inv.bag[danger.item] ?? 0;
  const paid = danger.costs[lit - 1] ?? 0;

  return (
    <Modal title={t("danger.title")} onBack={back}>
      <p className="mb-3 text-sm text-text-secondary">{t("danger.intro", { rift: localized(rift.name) })}</p>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <ItemIcon id={danger.item} size={28} count={have} />
        <span className="text-text-muted">{t("danger.fuel", { item: itemName(danger.item), count: have })}</span>
      </div>
      <News text={news} />
      <ul className="flex flex-col gap-1.5">
        {[0, ...danger.costs.map((_, i) => i + 1)].map((tier) => {
          const cost = Math.max(0, (danger.costs[tier - 1] ?? 0) - paid);
          const active = tier === lit;
          const mods = Object.entries(danger.perTier).map(([k, v]) => `${t(`mod.${k}` as I18nKey)} +${Math.round((v ?? 0) * tier * 100)}%`);
          return (
            <li key={tier} className={`flex items-center gap-3 rounded-tile border p-2 ${active ? "border-accent bg-accent/10" : "border-border/70 bg-canvas/40"}`}>
              <span className="w-10 text-center font-display text-lg text-accent">{tier === 0 ? "—" : "✹".repeat(tier)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{tier === 0 ? t("danger.none") : t("danger.tier", { tier })}</div>
                {tier > 0 && <div className="text-xs text-text-muted">{mods.join(" · ")}</div>}
              </div>
              {active ? (
                <span className="w-24 text-center text-xs text-accent">{t("danger.current")}</span>
              ) : (
                <button className="btn-primary w-24 px-2 py-1 text-xs" disabled={cost > have} onClick={() => sendEconomy({ type: "danger", rift: danger.rift, tier })}>
                  {tier < lit ? t("danger.lower") : t("danger.feed", { count: cost })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-text-muted">{t("danger.note")}</p>
    </Modal>
  );
}
