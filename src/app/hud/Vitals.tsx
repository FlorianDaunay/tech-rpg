import { content } from "@/content/registry";
import { getLang, t } from "@/i18n";
import { useGameStatus } from "@/store/game";

/** Health + stamina bars, top-left. Values come from the game via the bridge (`game:vitals`). */
export function Vitals() {
  const vitals = useGameStatus((s) => s.vitals);
  if (!vitals) return null;
  const hp = vitals.hp / vitals.maxHp;
  const st = vitals.stamina / vitals.maxStamina;
  const xp = Number.isFinite(vitals.xpNext) ? vitals.xp / vitals.xpNext : 1;
  return (
    <div className="flex w-44 flex-col gap-1 short:w-36" aria-label={t("hud.vitals")}>
      <div className="relative h-3 overflow-hidden rounded-pill border border-border bg-surface">
        <div className={`h-full bg-danger transition-[width] duration-150 ${hp < 0.25 ? "animate-pulse" : ""}`} style={{ width: `${hp * 100}%` }} />
        <span className="absolute inset-0 flex items-center justify-center font-pixel text-[8px] leading-none text-text-primary">
          {vitals.hp} / {vitals.maxHp}
        </span>
      </div>
      <div className="h-1.5 w-4/5 overflow-hidden rounded-pill bg-surface">
        <div className={`h-full transition-[width] duration-100 ${st < 0.2 ? "bg-warning" : "bg-success"}`} style={{ width: `${st * 100}%` }} />
      </div>
      <div className="flex w-4/5 items-center gap-1.5" title={t("hud.xp", { xp: vitals.xp, next: Number.isFinite(vitals.xpNext) ? vitals.xpNext : "—" })}>
        <span className="font-pixel text-[8px] leading-none text-accent">{t("hud.level", { level: vitals.level })}</span>
        <div className="h-1 flex-1 overflow-hidden rounded-pill bg-surface">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${xp * 100}%` }} />
        </div>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <span className="font-pixel text-[9px] text-warning" aria-label={t("hud.gold")}>● {vitals.gold}</span>
        {vitals.statuses.map((id) => {
          const def = content.statuses.find(id);
          if (!def) return null;
          return (
            <span key={id} className="rounded-pill bg-surface px-1.5 font-pixel text-[8px] leading-4 text-text-secondary" title={def.description[getLang()] ?? def.description.en}>
              {def.name[getLang()] ?? def.name.en}
            </span>
          );
        })}
      </div>
      {vitals.dead && <p className="mt-2 font-display text-sm tracking-[0.2em] text-danger uppercase">{t("hud.fallen")}</p>}
    </div>
  );
}
