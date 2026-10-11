import { useEffect } from "react";
import { bridge, type GameMode } from "@/bridge/events";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useInputDevice } from "@/store/input";
import { useMenu } from "@/store/menu";
import { useScreen } from "@/store/screen";
import { useSettings } from "@/store/settings";
import { firstEmptySlot, useSaves } from "@/store/saves";
import { TouchControls } from "@/ui/touch/TouchControls";
import { LootToasts } from "../hud/LootToasts";
import { Vitals } from "../hud/Vitals";
import { ZoneBanner } from "../hud/ZoneBanner";
import { Prompt } from "../hud/Prompt";
import { QuestToasts } from "../hud/QuestToasts";
import { SaveIndicator } from "../hud/SaveIndicator";
import { Minimap } from "../hud/Minimap";
import { BossBar } from "../hud/BossBar";
import { MapScreen } from "./MapScreen";
import { SkillBar } from "../hud/SkillBar";
import { CodexScreen } from "./CodexScreen";
import { RulesScreen } from "./RulesScreen";
import { DialogueBox } from "./DialogueBox";
import { JournalScreen } from "./JournalScreen";
import { InventoryScreen } from "./InventoryScreen";
import { PauseMenu } from "./PauseMenu";
import { SettingsScreen } from "./SettingsScreen";
import { TalentsScreen } from "./TalentsScreen";

/** In-game screen: loading veil, then the HUD layer over the running world, and the in-game menus. */
export function PlayScreen({ mode }: { mode: GameMode }) {
  const { engineReady, loading, inWorld, debugText } = useGameStatus();
  const showDebug = useSettings((s) => s.showFps);
  const device = useInputDevice((s) => s.device);
  const go = useScreen((s) => s.go);
  const menu = useMenu((s) => s.stack.at(-1));
  const { open, back, closeAll } = useMenu();

  useEffect(() => {
    if (engineReady && !inWorld) {
      // Chosen on the title screen (Continue / New game / Load); default: a new game in a free slot.
      const pending = useSaves.getState().pending ?? (mode !== "client" ? { slot: firstEmptySlot() ?? undefined, save: null, rules: undefined } : null);
      // A client brings no world: it enters the host's (its slot only receives its character).
      bridge.emit("ui:start", { mode, slot: pending?.slot, save: mode === "client" ? null : pending?.save, rules: pending?.rules });
      useSaves.setState({ pending: null });
    }
    // Start once, when the engine is up (it may still be downloading when the screen opens).
  }, [engineReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the screen never leaves a menu (and the pause) behind. A language change re-mounts this
  // screen while staying in game: keep the menus then.
  useEffect(() => () => void (!["solo", "online"].includes(useScreen.getState().screen) && useMenu.getState().closeAll()), []);

  // The host left / the connection dropped: back to the multiplayer screen, which shows why.
  useEffect(
    () =>
      bridge.on("game:ended", () => {
        closeAll();
        useGameStatus.setState({ inWorld: false, vitals: null, inventory: null, zoneEnter: null });
        go("multi");
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const quit = () => {
    closeAll();
    bridge.emit("ui:quit");
    useGameStatus.setState({ inWorld: false, vitals: null, inventory: null, zoneEnter: null });
    go("title");
  };

  if (!inWorld) {
    return (
      <div className="safe relative z-10 flex h-full flex-col items-center justify-center gap-4">
        <p className="font-display tracking-[0.3em] text-text-secondary uppercase">{t("common.loading")}</p>
        <div className="h-1.5 w-56 overflow-hidden rounded-pill bg-surface">
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round((loading ?? 0) * 100)}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <TouchControls />
      <div className="safe pointer-events-none absolute left-0 top-0 flex flex-col gap-2 p-3">
        <Vitals />
        {showDebug && <pre className="font-pixel text-[10px] leading-4 text-warning">{debugText}</pre>}
      </div>
      {device !== "touch" && !menu && (
        <div className="safe pointer-events-auto absolute right-3 top-3 flex gap-2">
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => open("inventory")} title={`${t("inventory.title")} (I)`}>⛁</button>
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => open("pause")} title={`${t("pause.title")} (Esc)`}>☰</button>
        </div>
      )}
      <LootToasts />
      <ZoneBanner />
      <QuestToasts />
      <Prompt />
      <Minimap />
      <BossBar />
      <SaveIndicator />
      {!menu && <SkillBar />}
      {menu === "pause" && <PauseMenu onQuit={quit} mode={mode} />}
      {menu === "inventory" && <InventoryScreen />}
      {menu === "settings" && <SettingsScreen onBack={back} />}
      {menu === "dialogue" && <DialogueBox />}
      {menu === "journal" && <JournalScreen />}
      {menu === "codex" && <CodexScreen />}
      {menu === "talents" && <TalentsScreen />}
      {menu === "rules" && <RulesScreen />}
      {menu === "map" && <MapScreen />}
    </div>
  );
}
