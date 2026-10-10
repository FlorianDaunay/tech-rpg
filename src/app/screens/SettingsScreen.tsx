import { useEffect, useState } from "react";
import { ACTIONS } from "@/core/sim/intent";
import { t, type I18nKey } from "@/i18n";
import { useScreen } from "@/store/screen";
import { DEFAULT_KEYS, useSettings, type Binding, type MoveDir, type TouchMode } from "@/store/settings";
import { themes, useActiveTheme, useThemeStore } from "@/themes";
import { Modal, Row, Segmented, Slider, Tabs, Toggle, uiSound } from "@/ui/menu/components";
import { suspendMenuNav } from "@/ui/menu/useMenuNav";

type Tab = "audio" | "controls" | "display";
const MOVES: MoveDir[] = ["up", "down", "left", "right"];
/** Menu keys are rebindable too, but these must stay reachable. */
const ALL_BINDABLE = [...MOVES, ...ACTIONS] as const;

/** "KeyW" → "W", "Mouse0" → "Left click"… */
export function keyLabel(code: Binding): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const named: Record<string, string> = {
    Mouse0: t("keys.mouseLeft"), Mouse1: t("keys.mouseMiddle"), Mouse2: t("keys.mouseRight"),
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: t("keys.space"),
    ShiftLeft: "Shift", ShiftRight: "Shift R", ControlLeft: "Ctrl", ControlRight: "Ctrl R", AltLeft: "Alt", Escape: "Esc", Tab: "Tab", Enter: "Enter",
  };
  return named[code] ?? code;
}

/** Settings, reachable from the title and the pause menu. Every change applies and persists immediately. */
export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("audio");
  return (
    <Modal title={t("menu.settings")} onBack={onBack} wide>
      <Tabs<Tab> tabs={[{ id: "audio", label: t("settings.audio") }, { id: "controls", label: t("settings.controls") }, { id: "display", label: t("settings.display") }]} value={tab} onChange={setTab} />
      {tab === "audio" && <AudioTab />}
      {tab === "controls" && <ControlsTab />}
      {tab === "display" && <DisplayTab />}
    </Modal>
  );
}

function AudioTab() {
  const volume = useSettings((s) => s.volume);
  const set = useSettings((s) => s.set);
  const go = useScreen((s) => s.go);
  const inGame = useScreen((s) => s.screen) === "solo";
  return (
    <div>
      {(["master", "music", "sfx"] as const).map((k) => (
        <Row key={k} label={t(`settings.volume.${k}`)}>
          <Slider label={t(`settings.volume.${k}`)} value={volume[k]} onChange={(v) => set({ volume: { ...volume, [k]: v } })} />
        </Row>
      ))}
      {import.meta.env.DEV && !inGame && (
        <Row label={t("soundtest.title")} hint="dev">
          <button className="btn-ghost py-1.5 text-sm" onClick={() => go("soundtest")}>{t("soundtest.open")}</button>
        </Row>
      )}
    </div>
  );
}

function ControlsTab() {
  const s = useSettings();
  const [capture, setCapture] = useState<{ action: (typeof ALL_BINDABLE)[number]; slot: number } | null>(null);

  // Capture the next key or mouse button for a binding slot. Escape cancels, Backspace clears.
  useEffect(() => {
    if (!capture) return;
    suspendMenuNav(true);
    const assign = (code: Binding | null) => {
      const list = [...s.keys[capture.action]];
      if (code) list[capture.slot] = code;
      else list.splice(capture.slot, 1);
      s.rebind(capture.action, list.filter(Boolean));
      uiSound.confirm();
      setCapture(null);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === "Escape") return setCapture(null);
      assign(e.code === "Backspace" ? null : e.code);
    };
    const onMouse = (e: MouseEvent) => {
      if ((e.target as HTMLElement).dataset.capture) return; // the click that started capture
      e.preventDefault();
      assign(`Mouse${e.button}`);
    };
    const onContext = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    window.addEventListener("contextmenu", onContext, true);
    return () => {
      // Let the key-up of the captured key pass before menus react again.
      setTimeout(() => suspendMenuNav(false), 0);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
      window.removeEventListener("contextmenu", onContext, true);
    };
  }, [capture]); // eslint-disable-line react-hooks/exhaustive-deps

  const conflicts = (code: Binding, action: string) => ALL_BINDABLE.filter((a) => a !== action && s.keys[a].includes(code));

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("settings.keyboard")}</h3>
          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => (uiSound.click(), s.resetKeys())}>{t("settings.resetKeys")}</button>
        </div>
        <p className="mb-2 text-xs text-text-muted">{t("settings.rebindHint")}</p>
        <div className="grid gap-x-6 md:grid-cols-2">
          {ALL_BINDABLE.map((action) => (
            <Row key={action} label={t(`action.${action}` as I18nKey)}>
              <div className="flex gap-1.5">
                {[0, 1].map((slot) => {
                  const code = s.keys[action][slot];
                  const active = capture?.action === action && capture.slot === slot;
                  const clash = code ? conflicts(code, action) : [];
                  return (
                    <button
                      key={slot}
                      data-capture="1"
                      title={clash.length ? t("settings.conflict", { actions: clash.map((a) => t(`action.${a}` as I18nKey)).join(", ") }) : undefined}
                      className={`min-w-[4.5rem] rounded-control border px-2 py-1 font-mono text-xs ${active ? "animate-pulse border-accent text-accent" : clash.length ? "border-warning text-warning" : "border-border text-text-primary"} hover:bg-surface-hover`}
                      onClick={() => (uiSound.click(), setCapture({ action, slot }))}
                    >
                      {active ? t("settings.pressKey") : code ? keyLabel(code) : "—"}
                    </button>
                  );
                })}
              </div>
            </Row>
          ))}
        </div>
        {JSON.stringify(s.keys) !== JSON.stringify(DEFAULT_KEYS) && <p className="mt-1 text-xs text-text-muted">{t("settings.customKeys")}</p>}
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{t("settings.gamepad")}</h3>
        <p className="text-xs text-text-secondary">{t("settings.gamepadLayout")}</p>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{t("settings.touch")}</h3>
        <Row label={t("settings.touchControls")}>
          <Segmented<TouchMode>
            options={[{ id: "auto", label: t("settings.auto") }, { id: "always", label: t("settings.always") }, { id: "never", label: t("settings.never") }]}
            value={s.touchControls}
            onChange={(v) => s.set({ touchControls: v })}
          />
        </Row>
        <Row label={t("settings.leftHanded")}><Toggle label={t("settings.leftHanded")} value={s.touchLeftHanded} onChange={(v) => s.set({ touchLeftHanded: v })} /></Row>
        <Row label={t("settings.aimAssist")} hint={t("settings.aimAssistHint")}><Toggle label={t("settings.aimAssist")} value={s.aimAssist} onChange={(v) => s.set({ aimAssist: v })} /></Row>
        <Row label={t("settings.haptics")}><Toggle label={t("settings.haptics")} value={s.haptics} onChange={(v) => s.set({ haptics: v })} /></Row>
      </section>
    </div>
  );
}

function DisplayTab() {
  const s = useSettings();
  const theme = useActiveTheme();
  const selectTheme = useThemeStore((st) => st.selectTheme);
  return (
    <div>
      <Row label={t("settings.language")}>
        <Segmented<"auto" | "en" | "fr">
          options={[{ id: "auto", label: t("settings.auto") }, { id: "en", label: "English" }, { id: "fr", label: "Français" }]}
          value={s.lang ?? "auto"}
          onChange={(v) => s.set({ lang: v === "auto" ? null : v })}
        />
      </Row>
      <Row label={t("settings.theme")} hint={t("settings.themeHint")}>
        <select className="rounded-control border border-border bg-canvas px-2 py-1.5 text-sm" value={theme.id} onChange={(e) => (uiSound.click(), selectTheme(e.target.value))}>
          {themes.map((th) => (
            <option key={th.id} value={th.id}>{th.name}</option>
          ))}
        </select>
      </Row>
      <Row label={t("settings.screenShake")} hint={t("settings.screenShakeHint")}>
        <Slider label={t("settings.screenShake")} value={s.screenShake} onChange={(v) => s.set({ screenShake: v })} />
      </Row>
      <Row label={t("settings.showFps")}><Toggle label={t("settings.showFps")} value={s.showFps} onChange={(v) => s.set({ showFps: v })} /></Row>
    </div>
  );
}
