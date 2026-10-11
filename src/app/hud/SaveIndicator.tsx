import { useEffect, useState } from "react";
import { bridge } from "@/bridge/events";
import { t } from "@/i18n";

/** Small "Saved" flash under the top-right buttons after each save; a longer warning if storage refused it. */
export function SaveIndicator() {
  const [state, setState] = useState<{ ok: boolean; key: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let n = 0;
    const off = bridge.on("game:saved", ({ ok }) => {
      clearTimeout(timer);
      setState({ ok, key: ++n });
      timer = setTimeout(() => setState(null), ok ? 1600 : 5000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  if (!state) return null;
  return (
    <div key={state.key} className="safe pointer-events-none absolute right-3 top-16 animate-[fadeUp_150ms_ease-out_both]" role="status">
      <span className={`surface rounded-pill px-3 py-1 font-pixel text-[9px] ${state.ok ? "text-success" : "text-danger"}`}>
        {state.ok ? `✓ ${t("hud.saved")}` : `⚠ ${t("hud.saveFailed")}`}
      </span>
    </div>
  );
}
