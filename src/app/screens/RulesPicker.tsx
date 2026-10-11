import { content } from "@/content/registry";
import type { WorldRules } from "@/core/sim/rules";
import { t, type I18nKey } from "@/i18n";
import { uiSound } from "@/ui/menu/components";
import { localized } from "../items";

/** "Enemy damage ×1.3 · XP ×1.25". */
export function modsLine(mods: Record<string, number | undefined>): string {
  return Object.entries(mods)
    .filter(([, v]) => v !== undefined && v !== 1)
    .map(([k, v]) => `${t(`mods.${k}` as I18nKey)} ×${Math.round(v! * 100) / 100}`)
    .join(" · ");
}

/** Difficulty name, plus "NG+2" on later cycles. */
export function rulesLabel(r: WorldRules): string {
  const d = content.difficulties.find(r.difficulty);
  return [d ? localized(d.name) : r.difficulty, r.ngPlus > 0 ? t("rules.ngPlusN", { n: r.ngPlus }) : ""].filter(Boolean).join(" · ");
}

/** Difficulty cards + Omen toggles. Controlled: the caller decides when to apply. */
export function RulesPicker({ value, onChange }: { value: WorldRules; onChange: (r: WorldRules) => void }) {
  const difficulties = content.difficulties.all().sort((a, b) => a.order - b.order);
  const omens = content.omens.all();
  const toggle = (id: string) => {
    uiSound.click();
    onChange({ ...value, omens: value.omens.includes(id) ? value.omens.filter((o) => o !== id) : [...value.omens, id] });
  };
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{t("rules.difficulty")}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {difficulties.map((d) => {
            const on = value.difficulty === d.id;
            return (
              <button
                key={d.id}
                aria-pressed={on}
                data-autofocus={on || undefined}
                className={`rounded-tile border p-2.5 text-left transition hover:bg-surface-hover ${on ? "border-accent bg-accent/10" : "border-border"}`}
                onClick={() => (uiSound.click(), onChange({ ...value, difficulty: d.id }))}
              >
                <div className="flex justify-between font-display text-sm">
                  {localized(d.name)}
                  {on && <span className="text-accent">✓</span>}
                </div>
                <div className="text-xs text-text-secondary">{localized(d.description)}</div>
                {modsLine(d.mods) && <div className="mt-1 text-[11px] text-text-muted">{modsLine(d.mods)}</div>}
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{t("rules.omens")}</h3>
        <p className="mb-2 text-xs text-text-muted">{t("rules.omensHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {omens.map((o) => {
            const on = value.omens.includes(o.id);
            return (
              <button
                key={o.id}
                aria-pressed={on}
                className={`flex gap-2.5 rounded-tile [&>span:last-child]:flex-1 border p-2.5 text-left transition hover:bg-surface-hover ${on ? "border-warning bg-warning/10" : "border-border"}`}
                onClick={() => toggle(o.id)}
              >
                <span className={`text-xl leading-none ${on ? "text-warning" : "text-text-muted"}`}>{o.glyph}</span>
                <span className="min-w-0">
                  <span className="flex justify-between gap-2 font-display text-sm">
                    {localized(o.name)}
                    {on && <span className="text-warning">✓</span>}
                  </span>
                  <span className="block text-xs text-text-secondary">{localized(o.description)}</span>
                  <span className="mt-1 block text-[11px] text-text-muted">{modsLine(o.mods)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
