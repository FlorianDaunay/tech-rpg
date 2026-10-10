import { useRef, useState } from "react";
import { bridge, type InventoryView } from "@/bridge/events";
import { content } from "@/content/registry";
import { SKILL_SLOTS, type SkillSlot, type TalentTree } from "@/core/combat/defs";
import { learnBlocker, talentPointsSpent } from "@/core/progression/talents";
import type { Command } from "@/core/sim/intent";
import { audio } from "@/game/audio";
import { t, type I18nKey } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { MenuButton, Modal, Tabs } from "@/ui/menu/components";
import { skillLook } from "../hud/SkillBar";
import { localized } from "../items";

type Tab = TalentTree | "skills";
const COLS = 5;
const TREE_GLYPH = { blade: "⚔", ward: "⛨", arcana: "✹" } as const;
const STAT_KEYS = { maxHp: "stats.hp", power: "stats.power", defense: "stats.defense", critChance: "stats.crit", speed: "stats.speed" } as const;

const command = (c: Command) => bridge.emit("ui:command", c);

/** Talent constellations (Blade / Ward / Arcana) and the skill loadout. Learning is a sim command. */
export function TalentsScreen() {
  const back = useMenu((s) => s.back);
  const inv = useGameStatus((s) => s.inventory);
  const [tab, setTab] = useState<Tab>("blade");
  const [confirm, setConfirm] = useState(false);
  if (!inv) return null;
  const spent = Object.keys(inv.talents).length > 0;
  return (
    <Modal
      title={t("talents.title")}
      onBack={back}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`font-display text-sm ${inv.talentPoints > 0 ? "text-accent" : "text-text-muted"}`}>{t("talents.points", { n: inv.talentPoints })}</span>
          {confirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">{t("talents.respecConfirm")}</span>
              <MenuButton autoFocus onClick={() => setConfirm(false)}>{t("common.cancel")}</MenuButton>
              <MenuButton primary onClick={() => (command({ type: "respec" }), setConfirm(false))}>{t("talents.respec")}</MenuButton>
            </div>
          ) : (
            spent && <MenuButton onClick={() => setConfirm(true)}>{t("talents.respec")}</MenuButton>
          )}
        </div>
      }
    >
      <Tabs<Tab>
        tabs={[
          { id: "blade", label: `${TREE_GLYPH.blade} ${t("talents.tree.blade")}` },
          { id: "ward", label: `${TREE_GLYPH.ward} ${t("talents.tree.ward")}` },
          { id: "arcana", label: `${TREE_GLYPH.arcana} ${t("talents.tree.arcana")}` },
          { id: "skills", label: t("talents.skills") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "skills" ? <Loadout inv={inv} /> : <Constellation key={tab} tree={tab} inv={inv} />}
    </Modal>
  );
}

function Constellation({ tree, inv }: { tree: TalentTree; inv: InventoryView }) {
  const talents = content.talents.all().filter((x) => x.tree === tree);
  // Nothing is selected at first (details show the first star): a click / tap selects, a second one
  // learns, so a stray tap never spends a point. Keyboard / gamepad focus selects as it moves.
  const [selected, setSelected] = useState("");
  const pointing = useRef(false);
  const first = [...talents].sort((a, b) => a.y - b.y || a.x - b.x)[0]?.id ?? "";
  const rows = Math.max(1, ...talents.map((x) => x.y + 1));
  const pos = (x: number, y: number) => ({ left: ((x + 0.5) / COLS) * 100, top: ((y + 0.5) / rows) * 100 });
  const holder = { level: inv.level, talents: inv.talents };
  const learn = (id: string) => {
    if (learnBlocker(holder, id)) return audio.sfx("ui-error");
    audio.sfx("ui-confirm");
    command({ type: "talent", talent: id });
  };
  const sel = content.talents.find(selected || first);

  return (
    <div className="flex flex-col gap-4 md:flex-row short:flex-row">
      <div className="relative mx-auto aspect-[5/4] w-full max-w-md shrink-0 rounded-tile bg-canvas/60 short:h-[38vh] short:w-auto short:max-w-none">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {talents.flatMap((x) =>
            x.requires.map((r) => {
              const req = content.talents.find(r);
              if (!req) return null;
              const a = pos(req.x, req.y);
              const b = pos(x.x, x.y);
              const lit = (inv.talents[x.id] ?? 0) > 0;
              return <line key={`${r}-${x.id}`} x1={a.left} y1={a.top} x2={b.left} y2={b.top} stroke="currentColor" strokeWidth={lit ? 0.9 : 0.5} vectorEffect="non-scaling-stroke" className={lit ? "text-accent" : "text-text-muted opacity-50"} />;
            })
          )}
        </svg>
        {talents.map((x) => {
          const rank = inv.talents[x.id] ?? 0;
          const why = learnBlocker(holder, x.id);
          const p = pos(x.x, x.y);
          return (
            <button
              key={x.id}
              aria-label={localized(x.name)}
              aria-pressed={selected === x.id}
              className={`absolute flex h-11 w-11 short:h-9 short:w-9 short:text-base -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 text-lg leading-none transition ${
                rank > 0 ? "border-accent bg-accent/25 text-accent" : why === null ? "border-accent/70 bg-surface text-text-primary" : "border-border bg-surface text-text-muted"
              } ${selected === x.id ? "scale-110 shadow-overlay ring-2 ring-accent/60" : ""}`}
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
              onPointerDown={() => (pointing.current = true)}
              onFocus={() => !pointing.current && setSelected(x.id)}
              onClick={() => {
                pointing.current = false;
                if (selected === x.id) learn(x.id);
                else {
                  audio.sfx("ui-click");
                  setSelected(x.id);
                }
              }}
            >
              {x.skill ? "✦" : "★"}
              <span className="font-pixel text-[7px]">
                {rank}/{x.ranks}
              </span>
            </button>
          );
        })}
      </div>
      {sel && <TalentDetails id={sel.id} inv={inv} onLearn={() => learn(sel.id)} />}
    </div>
  );
}

function TalentDetails({ id, inv, onLearn }: { id: string; inv: InventoryView; onLearn: () => void }) {
  const def = content.talents.get(id);
  const rank = inv.talents[id] ?? 0;
  const why = learnBlocker({ level: inv.level, talents: inv.talents }, id);
  const reason =
    why === "maxed"
      ? t("talents.why.maxed")
      : why === "points"
        ? t("talents.why.points")
        : why === "requires"
          ? t("talents.why.requires", { names: def.requires.filter((r) => !inv.talents[r]).map((r) => localized(content.talents.get(r).name)).join(", ") })
          : why === "tree"
            ? t("talents.why.tree", { n: def.treePoints - talentPointsSpent({ level: inv.level, talents: inv.talents }, def.tree) })
            : "";
  const skill = def.skill ? content.skills.find(def.skill) : undefined;
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-2" aria-live="polite">
      <h3 className="font-display text-lg">{localized(def.name)}</h3>
      <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
        <span className="rounded-pill border border-border px-2">{t("talents.rank", { rank, max: def.ranks })}</span>
        <span className="rounded-pill border border-border px-2">{t("talents.cost", { n: def.cost })}</span>
      </div>
      <p className="text-sm text-text-secondary">{localized(def.description)}</p>
      {skill && <p className="text-sm text-accent">✦ {localized(skill.name)} — {localized(skill.description)}</p>}
      {Object.entries(def.stats).length > 0 && (
        <ul className="flex flex-wrap gap-x-3 text-xs text-text-muted">
          {Object.entries(def.stats).map(([k, v]) => (
            <li key={k}>
              {k in STAT_KEYS ? t(STAT_KEYS[k as keyof typeof STAT_KEYS] as I18nKey) : k} {formatStat(k, v!)}
            </li>
          ))}
        </ul>
      )}
      {reason && <p className="text-sm text-warning">{reason}</p>}
      <div className="mt-1">
        <MenuButton primary disabled={why !== null} onClick={onLearn}>
          {t("talents.learn")}
        </MenuButton>
      </div>
    </section>
  );
}

const formatStat = (k: string, v: number) => (k === "critChance" ? `+${Math.round(v * 100)}%` : k === "critMultiplier" ? `+${Math.round(v * 100)}% crit` : `+${v}`);

function Loadout({ inv }: { inv: InventoryView }) {
  const skills = content.skills.all().sort((a, b) => a.unlockLevel - b.unlockLevel);
  const slotName = (s: SkillSlot) => t(`talents.slot.${s}` as I18nKey);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {SKILL_SLOTS.map((slot) => {
          const look = skillLook(inv.loadout[slot]);
          return (
            <div key={slot} className="flex items-center gap-2 rounded-tile border border-border p-2">
              <span className="text-2xl leading-none" style={{ color: look.color }}>{look.glyph}</span>
              <div className="min-w-0">
                <div className="text-xs text-text-muted">{slotName(slot)}</div>
                <div className="truncate text-sm">{look.name || "—"}</div>
              </div>
            </div>
          );
        })}
      </div>
      <ul className="flex flex-col gap-2">
        {skills.map((s) => {
          const unlocked = inv.unlockedSkills.includes(s.id);
          const look = skillLook(s.id);
          const slots: SkillSlot[] = s.kind === "ultimate" ? ["ultimate"] : ["skill1", "skill2"];
          return (
            <li key={s.id} className={`flex flex-wrap items-center gap-3 rounded-tile border p-3 ${unlocked ? "border-border" : "border-border/50 opacity-60"}`}>
              <span className="text-2xl leading-none" style={{ color: look.color }}>{look.glyph}</span>
              <div className="min-w-0 flex-1">
                <div className="font-display">{localized(s.name)}</div>
                <p className="text-sm text-text-secondary">{localized(s.description)}</p>
                <p className="text-xs text-text-muted">{unlocked ? t("talents.cooldown", { s: s.cooldown }) : t("talents.locked", { level: s.unlockLevel })}</p>
              </div>
              {unlocked && (
                <div className="flex gap-2">
                  {slots.map((slot) => (
                    <MenuButton key={slot} disabled={inv.loadout[slot] === s.id} onClick={() => command({ type: "loadout", slot, skill: s.id })}>
                      {t("talents.equipIn", { slot: slotName(slot) })}
                    </MenuButton>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
