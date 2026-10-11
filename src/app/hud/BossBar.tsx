import { content } from "@/content/registry";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { localized } from "../items";

/** Herald health, top centre while one fights the local player: name, phase marks, sealed exits. */
export function BossBar() {
  const boss = useGameStatus((s) => s.boss);
  const menuOpen = useMenu((s) => s.stack.length > 0);
  if (!boss || menuOpen) return null;
  const def = content.enemies.find(boss.enemy);
  const ratio = Math.max(0, boss.hp / boss.maxHp);
  return (
    <div className="safe pointer-events-none absolute inset-x-0 top-14 flex justify-center px-4 short:top-12">
      <div className="w-full max-w-xl animate-[fadeUp_250ms_ease-out_both]">
        <div className="mb-1 flex items-end justify-between gap-3">
          <span className="font-display text-sm uppercase tracking-[0.2em] text-text-primary drop-shadow">{def ? localized(def.name) : boss.enemy}</span>
          {boss.sealed && <span className="text-xs text-warning drop-shadow">{t("boss.sealed")}</span>}
        </div>
        <div className="relative h-3 overflow-hidden rounded-pill border border-border bg-canvas/80">
          <div className="absolute inset-y-0 left-0 bg-danger transition-[width] duration-200" style={{ width: `${ratio * 100}%` }} />
          {boss.thresholds.map((th, i) => (
            <span key={i} className={`absolute inset-y-0 w-0.5 ${boss.phase > i ? "bg-text-muted" : "bg-text-primary"}`} style={{ left: `${th * 100}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
