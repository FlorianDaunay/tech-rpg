import type { SkillView } from "@/bridge/events";
import { ELEMENT_COLORS } from "@/config/palette";
import { content } from "@/content/registry";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useInputDevice } from "@/store/input";
import { useSettings } from "@/store/settings";
import { keyLabel } from "../screens/SettingsScreen";
import { localized } from "../items";

/** Glyph per element (skills without one use the Lantern's star). */
export const SKILL_GLYPHS = { ember: "✹", frost: "❄", storm: "ϟ", hollow: "◉" } as const;
const PAD_LABELS = { skill1: "LB", skill2: "RB", ultimate: "RT" } as const;

/** Glyph + colour of a skill, shared with the touch buttons. */
export function skillLook(id: string | null): { glyph: string; color: string | undefined; name: string } {
  const def = id ? content.skills.find(id) : undefined;
  if (!def) return { glyph: "·", color: undefined, name: "" };
  return { glyph: def.element ? SKILL_GLYPHS[def.element] : "✦", color: def.element ? ELEMENT_COLORS[def.element] : undefined, name: localized(def.name) };
}

/** Skill 1 / skill 2 / ultimate with cooldowns and the Ember gauge, bottom-centre (keyboard and gamepad). */
export function SkillBar() {
  const vitals = useGameStatus((s) => s.vitals);
  const device = useInputDevice((s) => s.device);
  const keys = useSettings((s) => s.keys);
  if (!vitals || device === "touch" || vitals.skills.every((s) => !s.id)) return null;
  return (
    <div className="safe pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-2" aria-label={t("hud.skills")}>
      {vitals.skills.map((s) => (
        <Slot key={s.slot} view={s} label={device === "gamepad" ? PAD_LABELS[s.slot] : keys[s.slot][0] ? keyLabel(keys[s.slot][0]!) : "?"} ult={s.slot === "ultimate" ? vitals.ult : null} />
      ))}
    </div>
  );
}

function Slot({ view, label, ult }: { view: SkillView; label: string; ult: number | null }) {
  const look = skillLook(view.id);
  const cooling = view.cd > 0 && view.cdMax > 0;
  const title = ult !== null ? `${look.name} — ${t("hud.ultimate", { pct: Math.round(ult * 100) })}` : look.name;
  return (
    <div className={`surface relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-control ${ult === 1 && view.ready ? "ring-2 ring-accent" : ""}`} title={title}>
      <span className={`text-xl leading-none ${view.ready ? "" : "opacity-40"}`} style={{ color: look.color }}>
        {look.glyph}
      </span>
      {cooling && (
        <>
          <div className="absolute inset-x-0 top-0 bg-canvas/70" style={{ height: `${(view.cd / view.cdMax) * 100}%` }} />
          <span className="absolute inset-0 flex items-center justify-center font-pixel text-[10px] text-text-primary">{Math.ceil(view.cd)}</span>
        </>
      )}
      {ult !== null && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-canvas/80">
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${ult * 100}%` }} />
        </div>
      )}
      <kbd className="absolute right-0.5 top-0.5 font-mono text-[8px] leading-none text-text-secondary">{label}</kbd>
    </div>
  );
}
