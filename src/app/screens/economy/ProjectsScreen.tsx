import { content } from "@/content/registry";
import { isBuilt } from "@/core/economy/economy";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu, useService } from "@/store/menu";
import { Modal } from "@/ui/menu/components";
import { localized, statLine } from "../../items";
import { canPay, Cost, GoldLine, News, sendEconomy, useEconomyNews } from "./common";

/**
 * Cinderhold's building projects an NPC takes donations for. A finished project stands in the
 * village (for its builder) and grants its bonus for good.
 */
export function ProjectsScreen() {
  const inv = useGameStatus((s) => s.inventory);
  const service = useService();
  const back = useMenu((s) => s.back);
  const news = useEconomyNews((ev) => (ev.type === "built" ? t("projects.built", { name: localized(content.projects.get(ev.project).name) }) : null));
  if (!inv || service?.kind !== "projects") return null;
  const npc = content.npcs.find(service.npc);
  const me = { progress: inv.progress };
  const projects = content.projects.all().filter((p) => p.npc === service.npc);
  const builtCount = content.projects.all().filter((p) => isBuilt(me, p.id)).length;

  return (
    <Modal title={t("projects.title", { name: npc ? localized(npc.name) : "" })} onBack={back} wide footer={<GoldLine gold={inv.bag.gold ?? 0} />}>
      <p className="mb-2 text-center text-xs text-text-muted">{t("projects.progress", { built: builtCount, total: content.projects.all().length })}</p>
      <News text={news} />
      <ul className="stagger grid gap-3 md:grid-cols-2">
        {projects.map((p) => {
          const built = isBuilt(me, p.id);
          const missing = p.requires.filter((r) => !isBuilt(me, r));
          const affordable = canPay(inv.bag, p.cost.gold, p.cost.items);
          return (
            <li key={p.id} className={`flex flex-col gap-2 rounded-tile border p-3 ${built ? "border-success/60 bg-success/5" : "border-border bg-canvas/40"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-base">{localized(p.name)}</span>
                {built && <span className="text-xs font-semibold text-success">✓ {t("projects.done")}</span>}
              </div>
              <p className="text-sm text-text-secondary">{localized(p.description)}</p>
              <Effects effects={p.effects} />
              {!built &&
                (missing.length ? (
                  <p className="text-xs text-text-muted">🔒 {t("projects.requires", { list: missing.map((r) => localized(content.projects.get(r).name)).join(", ") })}</p>
                ) : (
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                    <Cost gold={p.cost.gold} items={p.cost.items} bag={inv.bag} />
                    <button className="btn-primary px-3 py-1 text-sm" disabled={!affordable} onClick={() => sendEconomy({ type: "build", project: p.id })}>
                      {t("projects.build")}
                    </button>
                  </div>
                ))}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function Effects({ effects }: { effects: (ReturnType<typeof content.projects.all>)[number]["effects"] }) {
  const lines = [
    ...Object.entries(effects.stats ?? {}).map(([k, v]) => statLine(k, v!)),
    ...(effects.xp ? [t("projects.fx.xp", { n: Math.round(effects.xp * 100) })] : []),
    ...(effects.shopDiscount ? [t("projects.fx.shop", { n: Math.round(effects.shopDiscount * 100) })] : []),
    ...(effects.forgeDiscount ? [t("projects.fx.forge", { n: Math.round(effects.forgeDiscount * 100) })] : []),
    ...(effects.rotatingSlots ? [t("projects.fx.slots", { n: effects.rotatingSlots })] : []),
  ];
  if (!lines.length) return null;
  return <div className="text-xs text-accent">{lines.map((l) => `◆ ${l}`).join("  ")}</div>;
}
