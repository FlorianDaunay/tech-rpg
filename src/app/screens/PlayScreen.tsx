import { useEffect } from "react";
import { bridge, type GameMode } from "@/bridge/events";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useScreen } from "@/store/screen";
import { useSettings } from "@/store/settings";
import { TouchControls } from "@/ui/touch/TouchControls";
import { Vitals } from "../hud/Vitals";

/** In-game screen: loading veil, then the HUD layer over the running world. */
export function PlayScreen({ mode }: { mode: GameMode }) {
  const { engineReady, loading, inWorld, debugText } = useGameStatus();
  const showDebug = useSettings((s) => s.showFps);
  const go = useScreen((s) => s.go);

  useEffect(() => {
    if (engineReady && !inWorld) bridge.emit("ui:start", { mode });
    // Start once, when the engine is up (it may still be downloading when the screen opens).
  }, [engineReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const quit = () => {
    bridge.emit("ui:quit");
    useGameStatus.setState({ inWorld: false, vitals: null });
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
        <div className="flex items-start gap-3">
          <button className="btn-ghost pointer-events-auto px-3 py-1.5 text-sm" onClick={quit}>
            {t("menu.back")}
          </button>
          <Vitals />
        </div>
        {showDebug && <pre className="mt-2 font-pixel text-[10px] leading-4 text-warning">{debugText}</pre>}
      </div>
    </div>
  );
}
