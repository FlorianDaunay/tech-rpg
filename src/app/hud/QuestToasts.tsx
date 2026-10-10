import { useEffect, useState } from "react";
import { bridge } from "@/bridge/events";
import { content } from "@/content/registry";
import { objectiveProgress } from "@/core/narrative/progress";
import { audio } from "@/game/audio";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { localized } from "../items";

interface Toast {
  key: number;
  title: string;
  line: string;
  done: boolean;
}

const LIFETIME = 4200;

/** Quest feed, top-centre under the zone banner: new / updated / ready / complete (+ skill unlocks). */
export function QuestToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const push = (toast: Omit<Toast, "key">) => {
      const key = ++n;
      setToasts((list) => [...list.slice(-2), { key, ...toast }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.key !== key)), LIFETIME);
    };
    const offSkill = bridge.on("game:skill-unlocked", ({ skill }) => {
      const def = content.skills.find(skill);
      if (!def) return;
      audio.sfx("notify", { volume: 0.8 });
      push({ title: localized(def.name), line: t("skill.unlocked"), done: true });
    });
    const offQuest = bridge.on("game:quest", ({ quest, change }) => {
      const def = content.quests.find(quest);
      if (!def) return;
      // The inventory view is published right after the step that produced this event.
      setTimeout(() => {
        const inv = useGameStatus.getState().inventory;
        let line = "";
        if (change === "started") line = t("quest.started");
        else if (change === "ready") line = t("quest.ready");
        else if (change === "done") line = t("quest.done");
        else if (inv) {
          // Show the objective that moved most recently: the first unfinished one with progress.
          const prog = objectiveProgress({ id: "local", bag: inv.bag, progress: inv.progress }, quest);
          const o = prog.find((p) => p.current > 0 && p.current < p.target) ?? prog.find((p) => p.current < p.target);
          const od = o && def.objectives.find((x) => x.id === o.id);
          if (o && od) line = `${localized(od.text)} (${o.current}/${o.target})`;
        }
        if (!line) return;
        audio.sfx(change === "done" ? "quest-complete" : "notify", { volume: change === "progress" ? 0.4 : 0.8 });
        push({ title: localized(def.title), line, done: change === "done" });
      }, 50);
    });
    return () => {
      offSkill();
      offQuest();
    };
  }, []);

  return (
    <div className="safe pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-1.5">
      {toasts.map((x) => (
        <div key={x.key} className={`surface rounded-tile px-4 py-1.5 text-center shadow-card animate-[fadeUp_200ms_ease-out_both] ${x.done ? "border-accent" : ""}`}>
          <div className="font-display text-xs tracking-[0.15em] text-accent uppercase">{x.title}</div>
          <div className="text-sm text-text-primary">{x.line}</div>
        </div>
      ))}
    </div>
  );
}
