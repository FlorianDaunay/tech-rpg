import { useState } from "react";
import { content } from "@/content/registry";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { Modal, Tabs } from "@/ui/menu/components";
import { localized } from "../items";
import { SheetFrame } from "../SheetFrame";
import { useSheetTabs } from "../sheetTabs";

type Tab = "lore" | "bestiary" | "people";

/** Light markdown used by lore bodies: paragraphs, **bold**, *italics*. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="mb-3 leading-relaxed">
          {p.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, j) =>
            part.startsWith("**") ? <strong key={j} className="text-text-primary">{part.slice(2, -2)}</strong> : part.startsWith("*") ? <em key={j}>{part.slice(1, -1)}</em> : part
          )}
        </p>
      ))}
    </>
  );
}

/** What the player has learned: lore pages unlocked by flags, creatures fought, people met. */
export function CodexScreen() {
  const back = useMenu((s) => s.back);
  const inv = useGameStatus((s) => s.inventory);
  const [tab, setTab] = useState<Tab>("lore");
  const [open, setOpen] = useState<string | null>(null);
  if (!inv) return null;
  const flags = new Set(inv.progress.flags);
  const unlocked = (u: string) => u === "start" || (u.startsWith("flag:") && flags.has(u.slice(5)));
  const lore = content.lore.all().filter((l) => unlocked(l.unlock)).sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
  const enemies = content.enemies.all().filter((e) => (inv.progress.kills[e.id] ?? 0) > 0);
  const people = content.npcs.all().filter((n) => inv.progress.met.includes(n.id));
  const page = lore.find((l) => l.id === open) ?? lore[0];

  return (
    <Modal title={t("codex.title")} onBack={back} wide tabs={useSheetTabs("codex")}>
      <Tabs<Tab> tabs={[{ id: "lore", label: t("codex.lore") }, { id: "bestiary", label: t("codex.bestiary") }, { id: "people", label: t("codex.people") }]} value={tab} onChange={setTab} />
      {tab === "lore" && (
        <div className="grid gap-4 md:grid-cols-[13rem_1fr]">
          <nav className="flex flex-col gap-0.5 md:max-h-[55vh] md:overflow-y-auto">
            {lore.map((l) => (
              <button key={l.id} onClick={() => setOpen(l.id)} className={`rounded-control px-2 py-1 text-left text-sm hover:bg-surface-hover ${page?.id === l.id ? "bg-accent/15 text-text-primary" : "text-text-secondary"}`}>
                {localized(l.title)}
              </button>
            ))}
          </nav>
          {page && (
            <article className="text-sm text-text-secondary">
              <h3 className="title-display mb-1 text-lg text-text-primary">{localized(page.title)}</h3>
              <p className="mb-3 italic text-text-muted">{localized(page.summary)}</p>
              <Prose text={localized(page.body)} />
            </article>
          )}
        </div>
      )}
      {tab === "bestiary" && (
        <div className="grid gap-3 md:grid-cols-2">
          {enemies.length === 0 && <p className="text-sm text-text-muted">{t("codex.noneFought")}</p>}
          {enemies.map((e) => (
            <article key={e.id} tabIndex={0} className="flex gap-3 rounded-tile border border-border p-3">
              <div className="shrink-0 rounded-tile bg-canvas/70 p-1"><SheetFrame assetKey={e.look} size={56} /></div>
              <div className="min-w-0">
                <h3 className="font-semibold">{localized(e.name)}</h3>
                <p className="text-xs text-text-secondary">{localized(e.description)}</p>
                <p className="mt-1 text-xs text-text-muted">{t("codex.defeated", { count: inv.progress.kills[e.id] ?? 0 })}</p>
              </div>
            </article>
          ))}
        </div>
      )}
      {tab === "people" && (
        <div className="grid gap-3 md:grid-cols-2">
          {people.length === 0 && <p className="text-sm text-text-muted">{t("codex.noneMet")}</p>}
          {people.map((n) => (
            <article key={n.id} tabIndex={0} className="flex gap-3 rounded-tile border border-border p-3">
              <div className="shrink-0 rounded-tile bg-canvas/70 p-1"><SheetFrame assetKey={n.look} size={56} /></div>
              <div className="min-w-0">
                <h3 className="font-semibold">{localized(n.name)}</h3>
                {n.title && <p className="text-xs text-accent">{localized(n.title)}</p>}
                <p className="mt-1 text-xs text-text-secondary">{localized(n.description)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}
