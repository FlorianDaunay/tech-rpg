import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";

/** Ping colour: green under 80 ms, amber under 160 ms, red above. */
const pingClass = (ms: number | null) => (ms === null ? "text-text-muted" : ms < 80 ? "text-success" : ms < 160 ? "text-warning" : "text-danger");

/** Online only, under the vitals: my link (ping / hosting) and each other player's name, level, health and ping. */
export function PartyPanel() {
  const party = useGameStatus((s) => s.party);
  if (!party) return null;
  return (
    <div className="flex w-44 flex-col gap-1 short:w-36" aria-label={t("hud.party")}>
      <span className={`font-pixel text-[8px] leading-none ${party.role === "host" ? "text-accent" : pingClass(party.ping)}`}>
        {party.role === "host" ? t("hud.hosting") : t("hud.ping", { ms: party.ping ?? "—" })}
      </span>
      {party.others.map((p) => (
        <div key={p.id} className={`flex flex-col gap-0.5 ${p.connected ? "" : "opacity-50"}`}>
          <div className="flex items-baseline gap-1.5 font-pixel text-[8px] leading-none">
            <span className="truncate text-text-primary">{p.name}</span>
            <span className="text-accent">{t("hud.level", { level: p.level })}</span>
            <span className={`ml-auto ${p.connected ? pingClass(p.ping) : "text-text-muted"}`}>
              {!p.connected ? t("hud.away") : !p.here ? t("hud.elsewhere") : p.ping === null ? "" : t("hud.ping", { ms: p.ping })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-pill bg-surface">
            <div className={`h-full transition-[width] duration-150 ${p.dead ? "bg-text-muted" : "bg-success"}`} style={{ width: `${p.here ? Math.max(0, p.hp / p.maxHp) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
