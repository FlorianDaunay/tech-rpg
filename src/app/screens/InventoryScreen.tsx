import { useState } from "react";
import { bridge } from "@/bridge/events";
import { RARITY_COLORS } from "@/config/palette";
import { t, type I18nKey } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { Modal, uiSound } from "@/ui/menu/components";
import { ItemIcon, itemInfo, localized, type ItemInfo } from "../items";

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 } as const;
const KIND_RANK = { sword: 0, shield: 1, consumable: 2, material: 3, key: 4, currency: 5 } as const;
const kindOf = (i: ItemInfo) => (i.kind === "item" ? i.def.kind : i.kind);

/** Bag + equipment. Equip / unequip / use send commands to the game (validated by the sim). */
export function InventoryScreen() {
  const inv = useGameStatus((s) => s.inventory);
  const back = useMenu((s) => s.back);
  const [selected, setSelected] = useState<string | null>(null);
  if (!inv) return null;

  const items = Object.entries(inv.bag)
    .filter(([id]) => id !== "gold")
    .map(([id, count]) => ({ id, count, info: itemInfo(id) }))
    .filter((x): x is { id: string; count: number; info: ItemInfo } => !!x.info)
    .sort((a, b) => KIND_RANK[kindOf(a.info)] - KIND_RANK[kindOf(b.info)] || RARITY_RANK[b.info.def.rarity] - RARITY_RANK[a.info.def.rarity] || a.id.localeCompare(b.id));

  const current = selected ?? inv.weapon ?? items[0]?.id ?? null;
  const info = current ? itemInfo(current) : null;
  const equippedSlot = current === inv.weapon ? "weapon" : current === inv.shield ? "shield" : null;
  const send = (c: Parameters<typeof bridge.emit<"ui:command">>[1]) => {
    uiSound.confirm();
    bridge.emit("ui:command", c);
  };

  return (
    <Modal title={t("inventory.title")} onBack={back} wide>
      <div className="grid gap-5 md:grid-cols-[14rem_1fr] short:grid-cols-[12rem_1fr] short:gap-3">
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("inventory.equipment")}</h3>
          {(["weapon", "shield"] as const).map((slot) => {
            const id = slot === "weapon" ? inv.weapon : inv.shield;
            return (
              <button
                key={slot}
                data-autofocus={slot === "weapon" || undefined}
                className={`flex items-center gap-3 rounded-tile border p-2 text-left transition hover:bg-surface-hover ${current === id && id ? "border-accent" : "border-border"}`}
                onClick={() => (uiSound.click(), setSelected(id))}
                onFocus={() => id && setSelected(id)}
              >
                <ItemIcon id={id} size={44} />
                <span className="min-w-0">
                  <span className="block text-xs text-text-muted">{t(`inventory.${slot}`)}</span>
                  <span className="block truncate text-sm">{id ? localized(itemInfo(id)!.def.name) : t("inventory.none")}</span>
                </span>
              </button>
            );
          })}
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-text-muted">{t("stats.hp")}</dt>
            <dd className="text-right font-mono">{inv.hp} / {inv.maxHp}</dd>
            <dt className="text-text-muted">{t("stats.power")}</dt>
            <dd className="text-right font-mono">{inv.stats.power}</dd>
            <dt className="text-text-muted">{t("stats.defense")}</dt>
            <dd className="text-right font-mono">{inv.stats.defense}</dd>
            <dt className="text-text-muted">{t("stats.crit")}</dt>
            <dd className="text-right font-mono">{Math.round(inv.stats.critChance * 100)}% ×{inv.stats.critMultiplier.toFixed(2)}</dd>
            <dt className="text-text-muted">{t("stats.speed")}</dt>
            <dd className="text-right font-mono">{inv.stats.speed}</dd>
            <dt className="text-text-muted">{t("hud.gold")}</dt>
            <dd className="text-right font-mono text-warning">{inv.bag.gold ?? 0}</dd>
          </dl>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("inventory.bag")}</h3>
          {items.length === 0 ? (
            <p className="text-sm text-text-muted">{t("inventory.empty")}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2">
              {items.map((x) => (
                <button
                  key={x.id}
                  aria-label={localized(x.info.def.name)}
                  className={`flex items-center justify-center rounded-tile border p-1 transition hover:bg-surface-hover ${current === x.id ? "border-accent bg-accent/10" : "border-transparent"}`}
                  onClick={() => (uiSound.click(), setSelected(x.id))}
                  onFocus={() => setSelected(x.id)}
                >
                  <ItemIcon id={x.id} size={44} count={x.count} />
                </button>
              ))}
            </div>
          )}

          {info && current && (
            <div className="rounded-tile border border-border bg-canvas/50 p-3">
              <div className="flex items-start gap-3">
                <ItemIcon id={current} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold" style={{ color: RARITY_COLORS[info.def.rarity] }}>{localized(info.def.name)}</div>
                  <div className="text-xs text-text-muted">
                    {t(`rarity.${info.def.rarity}` as I18nKey)} · {t(`kind.${kindOf(info)}` as I18nKey)}
                    {info.kind !== "item" && ` · ${t("stats.level")} ${info.def.level}`}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-sm text-text-secondary">{localized(info.def.description)}</p>
              <ItemStats info={info} />
              <div className="mt-3 flex flex-wrap gap-2">
                {info.kind !== "item" &&
                  (equippedSlot ? (
                    <button className="btn-ghost py-1.5 text-sm" onClick={() => send({ type: "equip", slot: equippedSlot, item: null })}>{t("inventory.unequip")}</button>
                  ) : (
                    <button className="btn-primary py-1.5 text-sm" onClick={() => send({ type: "equip", slot: info.kind === "sword" ? "weapon" : "shield", item: current })}>
                      {t("inventory.equip")}
                    </button>
                  ))}
                {info.kind === "item" && info.def.kind === "consumable" && (
                  <button className="btn-primary py-1.5 text-sm" disabled={!!info.def.effect?.heal && inv.hp >= inv.maxHp} onClick={() => send({ type: "use", item: current })}>
                    {inv.hp >= inv.maxHp && info.def.effect?.heal ? t("inventory.fullHp") : t("inventory.use")}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function ItemStats({ info }: { info: ItemInfo }) {
  const rows: [string, string][] = [];
  if (info.kind === "sword") {
    const b = info.def.bonus;
    rows.push([t("stats.family"), t(`family.${info.def.family}` as I18nKey)]);
    if (b.power) rows.push([t("stats.power"), `${b.power > 0 ? "+" : ""}${b.power}`]);
    if (b.critChance) rows.push([t("stats.crit"), `+${Math.round(b.critChance * 100)}%`]);
    if (b.speed) rows.push([t("stats.speed"), `${b.speed > 0 ? "+" : ""}${b.speed}`]);
    if (info.def.element) rows.push([t("stats.element"), t(`element.${info.def.element}` as I18nKey)]);
  } else if (info.kind === "shield") {
    rows.push([t("stats.block"), `${Math.round(info.def.reduction * 100)}%`]);
    rows.push([t("stats.parry"), `${Math.round(info.def.parryWindow * 1000)} ms`]);
    rows.push([t("stats.defense"), `+${info.def.defense}`]);
  } else if (info.def.effect?.heal) rows.push([t("stats.heals"), `${info.def.effect.heal}`]);
  if (info.def.value) rows.push([t("stats.value"), `${info.def.value}`]);
  if (!rows.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-muted">{k}</dt>
          <dd className="font-mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
