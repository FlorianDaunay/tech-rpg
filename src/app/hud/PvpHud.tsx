import { useEffect, useState } from "react";
import { bridge, type BridgeEvents } from "@/bridge/events";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";

const FEED_MS = 4500;
const FEED_MAX = 4;

/** PvP arena only: scoreboard (top centre) and kill feed (right, under the minimap). */
export function PvpHud() {
  const score = useGameStatus((s) => s.pvp);
  const [feed, setFeed] = useState<(BridgeEvents["game:pvp-kill"] & { n: number })[]>([]);
  useEffect(() => {
    let n = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const offs = [
      bridge.on("game:pvp-kill", (k) => {
        const item = { ...k, n: ++n };
        setFeed((f) => [...f, item].slice(-FEED_MAX));
        timers.push(setTimeout(() => setFeed((f) => f.filter((x) => x.n !== item.n)), FEED_MS));
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      timers.forEach(clearTimeout);
    };
  }, []);
  if (!score) return null;
  return (
    <>
      <div className="safe pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <table className="surface rounded-tile px-2 font-pixel text-[8px] leading-4 shadow-card" aria-label={t("pvp.score")}>
          <thead>
            <tr className="text-text-muted">
              <th className="px-1.5 text-left font-normal">{t("pvp.score")}</th>
              <th className="px-1.5 font-normal" title={t("pvp.killsLong")}>{t("pvp.kills")}</th>
              <th className="px-1.5 font-normal" title={t("pvp.deathsLong")}>{t("pvp.deaths")}</th>
            </tr>
          </thead>
          <tbody>
            {score.rows.map((r) => (
              <tr key={r.id} className={r.me ? "text-accent" : "text-text-primary"}>
                <td className="max-w-28 truncate px-1.5">{r.name}</td>
                <td className="px-1.5 text-center">{r.kills}</td>
                <td className="px-1.5 text-center">{r.deaths}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="safe pointer-events-none absolute right-3 top-48 flex flex-col items-end gap-1" aria-live="polite">
        {feed.map((k) => (
          <li key={k.n} className={`surface rounded-pill px-3 py-1 text-xs shadow-card animate-[fadeUp_200ms_ease-out_both] ${k.mine ? "text-success" : k.me ? "text-danger" : "text-text-secondary"}`}>
            {k.killer ? t("pvp.killed", { killer: k.killer, victim: k.victim }) : t("pvp.fell", { victim: k.victim })}
            {k.streak >= 3 && <span className="ml-1.5 text-warning">{t("pvp.streak", { n: k.streak })}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
