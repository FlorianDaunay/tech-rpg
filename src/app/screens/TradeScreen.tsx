import { useEffect, useState } from "react";
import { bridge } from "@/bridge/events";
import { RARITY_COLORS } from "@/config/palette";
import { tradeable } from "@/core/trade/trade";
import { t, type I18nKey } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useTrade } from "@/store/trade";
import { MenuButton, Modal, uiSound } from "@/ui/menu/components";
import { ItemIcon, itemInfo, localized } from "../items";

type Offer = Record<string, number>;
const same = (a: Offer, b: Offer) => {
  const ka = Object.keys(a).filter((k) => a[k]);
  const kb = Object.keys(b).filter((k) => b[k]);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};
const GOLD_STEPS = [-10, -1, 1, 10];

/**
 * Trading with another player. My offer is edited locally and sent on every change (the host checks
 * it against my bag); "Ready" is only possible once the host has my latest offer, and any change on
 * either side clears both Ready marks (see core/trade).
 */
export function TradeScreen() {
  const view = useTrade((s) => s.view);
  const bag = useGameStatus((s) => s.inventory?.bag ?? {});
  const [draft, setDraft] = useState<Offer>({});
  const id = view?.trade.id;
  // A new trade starts from an empty offer.
  useEffect(() => setDraft({}), [id]);
  if (!view) return null;

  const { trade, me, partnerName } = view;
  const other = trade.from === me ? trade.to : trade.from;
  const cmd = (c: Parameters<typeof bridge.emit<"ui:command">>[1]) => bridge.emit("ui:command", c);
  const cancel = () => cmd({ type: "trade", op: "cancel", id: trade.id });

  if (trade.status === "asked") {
    const incoming = trade.to === me;
    return (
      <Modal title={t("trade.title", { name: partnerName })} onBack={cancel}>
        <p className="mb-4 text-sm text-text-secondary">{incoming ? t("trade.asked", { name: partnerName }) : t("trade.waiting", { name: partnerName })}</p>
        <div className="flex justify-end gap-2">
          {incoming ? (
            <>
              <MenuButton onClick={cancel}>{t("trade.decline")}</MenuButton>
              <MenuButton primary autoFocus onClick={() => (uiSound.confirm(), cmd({ type: "trade", op: "answer", id: trade.id, accept: true }))}>{t("trade.accept")}</MenuButton>
            </>
          ) : (
            <MenuButton autoFocus onClick={cancel}>{t("trade.cancel")}</MenuButton>
          )}
        </div>
      </Modal>
    );
  }

  const server = trade.offers[me] ?? {};
  const synced = same(draft, server);
  const set = (next: Offer) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, n]) => n > 0));
    setDraft(clean);
    cmd({ type: "trade", op: "offer", id: trade.id, items: clean });
  };
  const add = (item: string, n: number) => {
    const have = bag[item] ?? 0;
    const next = Math.max(0, Math.min(have, (draft[item] ?? 0) + n));
    if (next === (draft[item] ?? 0)) return uiSound.error();
    uiSound.click();
    set({ ...draft, [item]: next });
  };
  const mine = !!trade.ready[me];
  const theirs = !!trade.ready[other];
  const offerable = Object.entries(bag)
    .filter(([item, n]) => item !== "gold" && n - (draft[item] ?? 0) > 0 && tradeable(item) && itemInfo(item))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <Modal title={t("trade.title", { name: partnerName })} onBack={cancel} wide>
      <div className="grid gap-4 md:grid-cols-2 short:grid-cols-2 short:gap-3">
        <OfferPanel title={t("trade.yourOffer")} offer={draft} ready={mine} onTake={(item) => add(item, -1)} />
        <OfferPanel title={t("trade.theirOffer", { name: partnerName })} offer={trade.offers[other] ?? {}} ready={theirs} />
      </div>

      <section className="mt-4 flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("trade.bag")}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-sm text-warning">● {(bag.gold ?? 0) - (draft.gold ?? 0)}</span>
          {GOLD_STEPS.map((n) => (
            <button key={n} className="btn-ghost px-2 py-1 font-mono text-xs" onClick={() => add("gold", n)}>
              {n > 0 ? `+${n}` : n}
            </button>
          ))}
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => add("gold", bag.gold ?? 0)}>{t("trade.allGold")}</button>
        </div>
        {offerable.length === 0 ? (
          <p className="text-sm text-text-muted">{t("trade.nothing")}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2">
            {offerable.map(([item, n]) => (
              <button key={item} aria-label={localized(itemInfo(item)!.def.name)} title={localized(itemInfo(item)!.def.name)} className="flex items-center justify-center rounded-tile border border-transparent p-1 transition hover:bg-surface-hover" onClick={() => add(item, 1)}>
                <ItemIcon id={item} size={44} count={n - (draft[item] ?? 0)} />
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-text-muted">{t("trade.hint")}</p>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <MenuButton onClick={cancel}>{t("trade.cancel")}</MenuButton>
        <MenuButton primary={!mine} autoFocus disabled={!synced} onClick={() => (uiSound.confirm(), cmd({ type: "trade", op: "ready", id: trade.id, rev: trade.rev, ready: !mine }))}>
          {mine ? t("trade.unready") : t("trade.ready")}
        </MenuButton>
      </div>
    </Modal>
  );
}

function OfferPanel({ title, offer, ready, onTake }: { title: string; offer: Offer; ready: boolean; onTake?: (item: string) => void }) {
  const entries = Object.entries(offer).filter(([, n]) => n > 0);
  return (
    <section className={`flex min-h-32 flex-col gap-2 rounded-tile border p-3 ${ready ? "border-success bg-success/10" : "border-border bg-canvas/40"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
        {ready && <span className="text-xs font-semibold text-success">{t("trade.readyBadge")}</span>}
      </div>
      {entries.length === 0 && <p className="text-sm text-text-muted">{t("trade.empty")}</p>}
      <ul className="flex flex-col gap-1">
        {entries.map(([item, n]) => {
          const info = item === "gold" ? null : itemInfo(item);
          const label = item === "gold" ? t("hud.gold") : info ? localized(info.def.name) : item;
          const body = (
            <>
              {item === "gold" ? <span className="w-8 text-center text-warning">●</span> : <ItemIcon id={item} size={32} />}
              <span className="min-w-0 flex-1 truncate text-sm" style={info ? { color: RARITY_COLORS[info.def.rarity] } : undefined}>{label}</span>
              <span className="font-mono text-sm text-text-secondary">×{n}</span>
            </>
          );
          return (
            <li key={item}>
              {onTake ? (
                <button className="flex w-full items-center gap-2 rounded-control px-1 text-left hover:bg-surface-hover" aria-label={`${t("trade.takeBack")} ${label}`} onClick={() => onTake(item)}>
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-1">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** How the last trade ended (fades). */
export function TradeToast() {
  const ended = useTrade((s) => s.ended);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ended) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [ended?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ended || !visible) return null;
  const key = ended.change === "declined" && !ended.byMe ? "trade.declinedBy" : `trade.${ended.change}`;
  return (
    <div className="safe pointer-events-none absolute inset-x-0 top-32 flex justify-center" role="status">
      <div className={`surface rounded-pill px-4 py-1.5 text-sm shadow-card animate-[fadeUp_200ms_ease-out_both] ${ended.change === "done" ? "text-success" : "text-text-secondary"}`}>
        {t(key as I18nKey, { name: ended.partnerName })}
      </div>
    </div>
  );
}
