import { useEffect, useState } from "react";
import { bridge, type BridgeEvents } from "@/bridge/events";
import { touchPress, touchRelease } from "@/bridge/touch";
import { content } from "@/content/registry";
import { t } from "@/i18n";
import { useInputDevice } from "@/store/input";
import { useMenu } from "@/store/menu";
import { useSettings } from "@/store/settings";
import { keyLabel } from "../screens/SettingsScreen";
import { localized } from "../items";

/**
 * Context action near the player ("F  Talk — Maelis"). On touch it is the button itself (the
 * cluster has no interact button: the action only appears when there is something to do).
 */
export function Prompt() {
  const [prompt, setPrompt] = useState<BridgeEvents["game:prompt"]>(null);
  const device = useInputDevice((s) => s.device);
  const key = useSettings((s) => s.keys.interact[0]);
  const menuOpen = useMenu((s) => s.stack.length > 0);
  useEffect(() => bridge.on("game:prompt", setPrompt), []);
  if (!prompt || menuOpen) return null;
  const npc = prompt.kind === "talk" ? content.npcs.find(prompt.npc) : undefined;
  const label = prompt.kind === "chest" ? t("prompt.open") : `${t("prompt.talk")}${npc ? ` — ${localized(npc.name)}` : ""}`;
  const glyph = device === "gamepad" ? "B" : key ? keyLabel(key) : "?";

  if (device === "touch") {
    return (
      // Centred by a flex wrapper: the fade-in animation owns `transform`, so no translate-x centring.
      <div className="pointer-events-none absolute inset-x-0 bottom-[42%] z-[25] flex justify-center">
        <button
          className="btn-primary pointer-events-auto animate-[fadeUp_150ms_ease-out_both] px-4 py-2 text-sm"
          onPointerDown={() => touchPress("interact")}
          onPointerUp={() => touchRelease("interact")}
        >
          {label}
        </button>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[30%] flex justify-center">
      <div className="surface flex items-center gap-2 rounded-pill px-3 py-1.5 text-sm shadow-card animate-[fadeUp_150ms_ease-out_both]">
        <kbd className="rounded-control border border-border bg-canvas px-1.5 font-mono text-xs text-accent">{glyph}</kbd>
        <span>{label}</span>
      </div>
    </div>
  );
}
