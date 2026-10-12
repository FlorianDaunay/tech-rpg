import { useEffect, useState } from "react";
import { bridge } from "@/bridge/events";
import { RARITY_COLORS } from "@/config/palette";
import { content } from "@/content/registry";
import { isShield, isWeapon } from "@/core/combat/defs";
import { gearAffixes, gearTier, parseGear } from "@/core/combat/gear";
import { findForge, type ForgeDef } from "@/core/economy/defs";
import { forgeDiscountOf } from "@/core/economy/economy";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu, useService } from "@/store/menu";
import { Modal } from "@/ui/menu/components";
import { ItemIcon, itemInfo, itemName, localized, statLine } from "../../items";
import { canPay, Cost, GoldLine, News, sendEconomy, useEconomyNews } from "./common";

type From = "weapon" | "shield" | "bag";

/** The smith: upgrade a sword or shield (+1…+5), or reroll one of its affixes. Worn gear works too. */
export function ForgeScreen() {
  const inv = useGameStatus((s) => s.inventory);
  const service = useService();
  const back = useMenu((s) => s.back);
  const [selected, setSelected] = useState<{ key: string; from: From } | null>(null);
  const news = useEconomyNews((ev) => (ev.type !== "forged" ? null : ev.op === "upgrade" ? t("forge.upgraded", { item: itemName(ev.item) }) : t("forge.rerolled", { item: itemName(ev.item) })));

  // A forged piece gets a new key: keep it selected.
  useEffect(
    () =>
      bridge.on("game:economy", (ev) => {
        if (ev.type === "forged") setSelected((cur) => (cur ? { key: ev.item, from: cur.from } : cur));
      }),
    [],
  );

  const forge = service?.kind === "forge" ? findForge(service.ref) : undefined;
  const meta = service?.kind === "forge" ? content.forges.find(service.ref) : undefined;
  if (!inv || !forge || !meta) return null;

  const pieces: { key: string; from: From }[] = [
    ...(inv.weapon ? [{ key: inv.weapon, from: "weapon" as const }] : []),
    ...(inv.shield ? [{ key: inv.shield, from: "shield" as const }] : []),
    ...Object.keys(inv.bag)
      .filter((k) => isWeapon(k) || isShield(k))
      .sort()
      .map((key) => ({ key, from: "bag" as const })),
  ];
  const current = (selected && pieces.find((p) => p.key === selected.key && p.from === selected.from)) ?? pieces[0] ?? null;
  const discount = 1 - forgeDiscountOf({ progress: inv.progress });

  return (
    <Modal title={localized(meta.name)} onBack={back} wide footer={<GoldLine gold={inv.bag.gold ?? 0} />}>
      <News text={news} />
      {!current ? (
        <p className="text-sm text-text-muted">{t("forge.nothing")}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[15rem_1fr] short:grid-cols-[13rem_1fr] short:gap-3">
          <ul className="stagger flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {pieces.map((p) => (
              <li key={`${p.from}:${p.key}`}>
                <button
                  data-autofocus={p === pieces[0] || undefined}
                  className={`flex w-full items-center gap-2 rounded-tile border p-1.5 text-left transition hover:bg-surface-hover ${current.key === p.key && current.from === p.from ? "border-accent bg-accent/10" : "border-transparent"}`}
                  onClick={() => setSelected(p)}
                  onFocus={() => setSelected(p)}
                >
                  <ItemIcon id={p.key} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{itemName(p.key)}</span>
                    {p.from !== "bag" && <span className="block text-[10px] uppercase tracking-wider text-accent">{t("forge.worn")}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <PieceDetail piece={current} forge={forge} discount={discount} bag={inv.bag} />
        </div>
      )}
    </Modal>
  );
}

function PieceDetail({ piece, forge, discount, bag }: { piece: { key: string; from: From }; forge: ForgeDef; discount: number; bag: Record<string, number> }) {
  const forgeId = forge.id;
  const info = itemInfo(piece.key)!;
  const tier = gearTier(piece.key);
  const next = forge.tiers[tier];
  const nowBonus = forge.tiers[tier - 1];
  const weapon = info.kind === "sword";
  const bonus = (x: typeof next) => (x ? (weapon ? statLine("power", x.power) : statLine("defense", x.defense)) : "—");
  const affixes = gearAffixes(piece.key);
  const upGold = next ? Math.round(next.gold * discount) : 0;
  const rrGold = Math.round(forge.reroll.gold * discount);
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-tile border border-border bg-canvas/50 p-3">
      <div className="flex items-center gap-3">
        <ItemIcon id={piece.key} size={52} />
        <div className="min-w-0">
          <div className="truncate font-semibold" style={{ color: RARITY_COLORS[info.def.rarity] }}>
            {itemName(piece.key)}
          </div>
          <div className="text-xs text-text-muted">{t("forge.tier", { tier, max: forge.tiers.length })}</div>
        </div>
      </div>

      <div className="rounded-tile border border-border/60 p-2.5">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{t("forge.upgrade")}</div>
        {next ? (
          <>
            <div className="mb-2 text-sm">
              {nowBonus && <span className="text-text-muted">{bonus(nowBonus)} → </span>}
                <span className="text-accent">{bonus(next)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Cost gold={upGold} items={next.items} bag={bag} />
              <button
                className="btn-primary px-3 py-1 text-sm"
                disabled={!canPay(bag, upGold, next.items)}
                onClick={() =>
                  sendEconomy({
                    type: "forge",
                    forge: forgeId,
                    op: "upgrade",
                    item: piece.key,
                    from: piece.from,
                  })
                }
              >
                {t("forge.upgradeTo", { tier: tier + 1 })}
              </button>
            </div>
          </>
        ) : (
          <div className="text-sm text-success">{t("forge.maxed")}</div>
        )}
      </div>

      <div className="rounded-tile border border-border/60 p-2.5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("forge.reroll")}</span>
          <Cost gold={rrGold} items={forge.reroll.items} bag={bag} />
        </div>
        {affixes.length === 0 ? (
          <p className="text-xs text-text-muted">{t("forge.noAffix")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {affixes.map((a) => (
              <li key={a.def.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-accent">
                  ◆ {localized(content.affixes.get(a.def.id).name)} <span className="text-text-secondary">{statLine(a.def.stat, a.value)}</span>
                </span>
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={!canPay(bag, rrGold, forge.reroll.items)}
                  onClick={() =>
                    sendEconomy({
                      type: "forge",
                      forge: forgeId,
                      op: "reroll",
                      item: piece.key,
                      from: piece.from,
                      affix: parseGear(piece.key).affixes.findIndex((x) => x.id === a.def.id),
                    })
                  }
                >
                  {t("forge.rerollOne")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
