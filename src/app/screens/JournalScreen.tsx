import { useState } from "react";
import { content } from "@/content/registry";
import { objectiveProgress, questState } from "@/core/narrative/progress";
import { t, type I18nKey } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { Modal, Tabs } from "@/ui/menu/components";
import { ItemIcon, localized } from "../items";
import { useSheetTabs } from "../sheetTabs";

type Tab = "active" | "done";
const TYPE_ORDER = { main: 0, side: 1, bounty: 2 } as const;

/** Quest log: active quests with objective progress and rewards; completed ones below. */
export function JournalScreen() {
  const back = useMenu((s) => s.back);
  const inv = useGameStatus((s) => s.inventory);
  const [tab, setTab] = useState<Tab>("active");
  if (!inv) return null;
  const story = { id: "local", bag: inv.bag, progress: inv.progress };
  const quests = content.quests
    .all()
    .filter((q) => {
      const s = questState(story, q.id);
      return tab === "done" ? s === "done" : s === "active" || s === "ready";
    })
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);

  return (
    <Modal title={t("journal.title")} onBack={back} wide tabs={useSheetTabs("journal")}>
      <Tabs<Tab> tabs={[{ id: "active", label: t("journal.active") }, { id: "done", label: t("journal.done") }]} value={tab} onChange={setTab} />
      {quests.length === 0 && <p className="text-sm text-text-muted">{tab === "active" ? t("journal.none") : t("journal.noneDone")}</p>}
      <div className="flex flex-col gap-3">
        {quests.map((q) => {
          const state = questState(story, q.id);
          const giver = q.giver ? content.npcs.find(q.giver) : undefined;
          return (
            <article key={q.id} tabIndex={0} className={`rounded-tile border p-3 ${state === "ready" ? "border-accent" : "border-border"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-base">{localized(q.title)}</h3>
                <span className="rounded-pill border border-border px-2 text-xs text-text-secondary">{t(`journal.type.${q.type}` as I18nKey)}</span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{localized(q.summary)}</p>
              {state !== "done" && (
                <ul className="mt-2 flex flex-col gap-1">
                  {objectiveProgress(story, q.id).map((o) => {
                    const def = q.objectives.find((x) => x.id === o.id)!;
                    const met = o.current >= o.target;
                    return (
                      <li key={o.id} className={`flex items-center gap-2 text-sm ${met ? "text-text-muted line-through" : "text-text-primary"}`}>
                        <span className={met ? "text-success" : "text-text-muted"}>{met ? "✓" : "○"}</span>
                        {localized(def.text)}
                        {o.target > 1 && <span className="font-mono text-xs text-text-muted">{o.current}/{o.target}</span>}
                      </li>
                    );
                  })}
                  {state === "ready" && giver && <li className="text-sm text-accent">➜ {t("journal.returnTo", { name: localized(giver.name) })}</li>}
                </ul>
              )}
              {(q.rewards.gold > 0 || q.rewards.items.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  {t("journal.rewards")}
                  {q.rewards.gold > 0 && <span className="text-warning">● {q.rewards.gold}</span>}
                  {q.rewards.items.map((r) => (
                    <span key={r.item} className="inline-flex items-center gap-1">
                      <ItemIcon id={r.item} size={22} />
                      {r.count > 1 && `×${r.count}`}
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Modal>
  );
}
