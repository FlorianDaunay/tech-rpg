import { useEffect, useState } from "react";
import { bridge, type BridgeEvents } from "@/bridge/events";
import type { Command } from "@/core/sim/intent";
import { t } from "@/i18n";
import { uiSound } from "@/ui/menu/components";
import { ItemIcon, itemName } from "../../items";

/** Sends an economy command for the local player (the sim re-checks everything). */
export function sendEconomy(c: Command): void {
  uiSound.click();
  bridge.emit("ui:command", c);
}

/** Gold the player carries, as a footer line. */
export function GoldLine({ gold }: { gold: number }) {
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <span className="text-text-muted">{t("hud.gold")}</span>
      <span className="font-mono text-warning">● {gold}</span>
    </div>
  );
}

/** A price: gold and materials, each red when the bag is short of it. */
export function Cost({ gold, items = {}, bag }: { gold: number; items?: Record<string, number>; bag: Record<string, number> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {gold > 0 && <span className={`font-mono ${(bag.gold ?? 0) >= gold ? "text-warning" : "text-danger"}`}>● {gold}</span>}
      {Object.entries(items).map(([id, n]) => (
        <span key={id} className={`inline-flex items-center gap-1 ${(bag[id] ?? 0) >= n ? "text-text-secondary" : "text-danger"}`} title={itemName(id)}>
          <ItemIcon id={id} size={20} />
          <span className="font-mono">
            {bag[id] ?? 0}/{n}
          </span>
          <span className="hidden sm:inline">{itemName(id)}</span>
        </span>
      ))}
    </span>
  );
}

export const canPay = (bag: Record<string, number>, gold: number, items: Record<string, number> = {}) => (bag.gold ?? 0) >= gold && Object.entries(items).every(([id, n]) => (bag[id] ?? 0) >= n);

/** Short-lived line confirming the last deal ("Bought Ember Tonic ×2"). */
export function useEconomyNews(format: (ev: BridgeEvents["game:economy"]) => string | null): string | null {
  const [news, setNews] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    let n = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = bridge.on("game:economy", (ev) => {
      const text = format(ev);
      if (!text) return;
      const k = ++n;
      setNews({ text, n: k });
      clearTimeout(timer);
      timer = setTimeout(() => setNews((cur) => (cur?.n === k ? null : cur)), 2400);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return news?.text ?? null;
}

export function News({ text }: { text: string | null }) {
  return (
    <div className="min-h-[1.25rem] text-center text-sm text-success" aria-live="polite">
      {text && <span key={text} className="inline-block animate-[fadeUp_160ms_ease-out_both]">✦ {text}</span>}
    </div>
  );
}
