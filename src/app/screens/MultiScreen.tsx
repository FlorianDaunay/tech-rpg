import { useEffect, useState } from "react";
import { content } from "@/content/registry";
import { t, type I18nKey } from "@/i18n";
import { useNet } from "@/store/net";
import { chooseStart, firstEmptySlot, readSave, SLOTS, useSaves } from "@/store/saves";
import { useScreen } from "@/store/screen";
import { useSettings } from "@/store/settings";
import { MenuButton, Modal, Row } from "@/ui/menu/components";
import { formatPlaytime, placeName } from "./SavesScreen";
import { RulesPicker, rulesLabel } from "./RulesPicker";
import type { WorldRules } from "@/core/sim/rules";

/**
 * Multiplayer: pick the character you bring (a save slot), then host a room (share its code) or join
 * one. The lobby lists who is in; the host starts, and everyone enters the host's world.
 */
export function MultiScreen() {
  const go = useScreen((s) => s.go);
  const net = useNet();
  const slots = useSaves((s) => s.slots);
  const name = useSettings((s) => s.playerName);
  const setSettings = useSettings((s) => s.set);
  const [slot, setSlot] = useState<number | null>(() => SLOTS.find((s) => slots[s]) ?? null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  /** Host editing the world rules in the lobby (null = not editing). */
  const [editRules, setEditRules] = useState<WorldRules | null>(null);
  useEffect(() => useSaves.getState().refresh(), []);

  // The host started (or we joined a game in progress): into the world.
  useEffect(() => {
    if (net.session && net.room?.started) enter();
  }, [net.room?.started, net.session]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The slot a new initiate is saved in (none left = not saved). */
  const savingSlot = () => slot ?? firstEmptySlot();
  function enter() {
    const s = savingSlot();
    // The host continues its own save's world; a client lands in the host's.
    if (s !== null && net.session?.role === "host") chooseStart(s as 1 | 2 | 3, readSave(s), net.room?.rules);
    else if (s !== null) chooseStart(s as 1 | 2 | 3, null);
    go("online");
  }
  const host = () => void net.host({ name: name || t("multi.defaultName"), password, slot: savingSlot() });
  const join = () => void net.join({ code, name: name || t("multi.defaultName"), password, slot: savingSlot() });
  const back = () => {
    net.leave();
    go("title");
  };

  const inRoom = net.session && net.room;
  // Actions live in the panel footer: always on screen, even on a landscape phone.
  const footer =
    inRoom && editRules ? (
      <div className="flex justify-end gap-2">
        <MenuButton onClick={() => setEditRules(null)}>{t("common.cancel")}</MenuButton>
        <MenuButton
          primary
          onClick={() => {
            net.setRules(editRules);
            setEditRules(null);
          }}
        >
          {t("rules.apply")}
        </MenuButton>
      </div>
    ) : inRoom ? (
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-xs text-text-muted">{net.session!.role === "host" ? t("multi.shareHint") : t("multi.waiting")}</span>
        <div className="flex shrink-0 gap-2">
          <MenuButton onClick={() => net.leave()}>{t("multi.leave")}</MenuButton>
          {net.session!.role === "host" && <MenuButton primary autoFocus onClick={enter}>{t("multi.start")}</MenuButton>}
        </div>
      </div>
    ) : undefined;
  return (
    <div className="safe relative z-10 h-full">
      <Modal title={t("menu.multi")} onBack={back} wide footer={footer}>
        {net.status === "error" && net.error && <p className="mb-3 text-sm text-danger" role="alert">{t(`multi.error.${net.error}` as I18nKey)}</p>}
        {net.status === "connecting" && <p className="mb-3 text-sm text-text-secondary">{t("multi.connecting")}</p>}

        {inRoom && editRules ? (
          <div className="flex flex-col gap-4">
            <RulesPicker value={editRules} onChange={setEditRules} />
          </div>
        ) : inRoom ? (
          <div className="flex flex-col gap-4 short:gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-text-muted">{t("multi.roomCode")}</div>
                <div className="font-mono text-3xl tracking-[0.3em] text-accent short:text-2xl">{net.room!.code}</div>
              </div>
              {net.session!.role === "host" && (
                <MenuButton onClick={() => void navigator.clipboard?.writeText(net.room!.code)}>{t("multi.copy")}</MenuButton>
              )}
            </div>
            {net.room!.rules && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 bg-canvas/40 px-3 py-2 text-sm">
                <span>
                  <span className="text-text-muted">{t("multi.rules")}: </span>
                  {rulesLabel(net.room!.rules)}
                  {net.room!.rules.omens.length > 0 && <span className="text-warning"> · {net.room!.rules.omens.map((o) => content.omens.find(o)?.glyph ?? "").join(" ")}</span>}
                </span>
                {net.session!.role === "host" && <MenuButton onClick={() => setEditRules(structuredClone(net.room!.rules!))}>{t("multi.changeRules")}</MenuButton>}
              </div>
            )}
            <ul className="flex flex-col gap-1.5">
              {net.room!.players.map((p) => (
                <li key={p.id} className={`flex items-center justify-between rounded-tile border border-border px-3 py-2 text-sm ${p.connected ? "" : "opacity-50"}`}>
                  <span>
                    {p.name} {p.id === net.session!.me && <span className="text-text-muted">({t("multi.you")})</span>} {p.id === net.room!.hostId && <span className="text-accent">· {t("multi.host")}</span>}
                  </span>
                  <span className="text-text-muted">{t("hud.level", { level: p.level })}{p.connected ? "" : ` · ${t("multi.away")}`}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Row label={t("multi.name")}>
              <input className="input w-48" maxLength={24} value={name} placeholder={t("multi.defaultName")} onChange={(e) => setSettings({ playerName: e.target.value })} />
            </Row>
            <Row label={t("multi.character")} hint={t("multi.characterHint")}>
              <select className="input w-56" value={slot ?? ""} onChange={(e) => setSlot(e.target.value ? Number(e.target.value) : null)}>
                {SLOTS.map((s) => {
                  const sum = slots[s];
                  return sum ? (
                    <option key={s} value={s}>
                      {t("saves.slot", { n: s })} · {t("hud.level", { level: sum.level })} · {placeName(sum.map)} · {rulesLabel(sum.rules)} · {formatPlaytime(sum.playtime)}
                    </option>
                  ) : null;
                })}
                <option value="">{t("multi.newInitiate")}</option>
              </select>
            </Row>
            <Row label={t("multi.password")} hint={t("multi.passwordHint")}>
              <input className="input w-48" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Row>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <section className="rounded-tile border border-border p-3">
                <h3 className="mb-1 font-display">{t("multi.hostTitle")}</h3>
                <p className="mb-3 text-xs text-text-secondary">{t("multi.hostHint")}</p>
                <MenuButton primary autoFocus onClick={host}>{t("multi.hostButton")}</MenuButton>
              </section>
              <section className="rounded-tile border border-border p-3">
                <h3 className="mb-1 font-display">{t("multi.joinTitle")}</h3>
                <input
                  className="input mb-3 w-full font-mono uppercase tracking-[0.3em]"
                  maxLength={5}
                  placeholder="ABCDE"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && code.length === 5 && join()}
                />
                <MenuButton disabled={code.length !== 5} onClick={join}>{t("multi.joinButton")}</MenuButton>
              </section>
            </div>
            <p className="mt-3 text-xs text-text-muted">{t("multi.p2pNote")}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
