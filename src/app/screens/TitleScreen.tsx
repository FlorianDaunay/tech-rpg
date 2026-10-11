import { GAME } from "@/config/game";
import { t } from "@/i18n";
import { useEffect, useRef } from "react";
import { chooseStart, firstEmptySlot, lastSlot, readSave, useSaves } from "@/store/saves";
import { formatPlaytime, placeName } from "./SavesScreen";
import { useScreen } from "@/store/screen";
import { useMenuNav } from "@/ui/menu/useMenuNav";

export function TitleScreen() {
  const go = useScreen((s) => s.go);
  const nav = useRef<HTMLElement>(null);
  useMenuNav(nav);
  const slots = useSaves((s) => s.slots);
  useEffect(() => useSaves.getState().refresh(), []);
  const last = lastSlot();
  const latest = last ? slots[last] : null;
  const hasSaves = Object.values(slots).some(Boolean);
  const newGame = () => {
    const free = firstEmptySlot();
    if (free === null) return go("saves"); // every slot used: pick one to overwrite
    chooseStart(free, null);
    go("solo");
  };
  return (
    <div className="safe relative z-10 flex h-full flex-col items-center justify-center gap-10 px-6 short:flex-row short:gap-12">
      <header className="text-center short:text-left animate-[fadeUp_900ms_ease-out_both]">
        <h1 className="title-display text-5xl font-black text-text-primary short:text-4xl drop-shadow-[0_0_24px_rgb(var(--color-accent)/0.55)] sm:text-7xl short:sm:text-5xl">
          {GAME.title}
        </h1>
        <p className="mt-2 font-display text-lg tracking-[0.35em] text-accent uppercase short:text-base">{GAME.subtitle}</p>
        <p className="mt-3 font-display text-xs tracking-[0.4em] text-text-muted uppercase">{GAME.tagline}</p>
      </header>
      <nav ref={nav} className="panel flex w-full max-w-xs flex-col gap-3 p-4 short:gap-2 short:p-3 animate-[fadeUp_900ms_200ms_ease-out_both]">
        {latest && last ? (
          <button className="btn-primary flex flex-col items-center" data-autofocus onClick={() => (chooseStart(last, readSave(last)), go("solo"))}>
            <span>{t("menu.continue")}</span>
            <span className="text-xs font-normal opacity-80">
              {t("hud.level", { level: latest.level })} · {placeName(latest.map)} · {formatPlaytime(latest.playtime)}
            </span>
          </button>
        ) : null}
        <button className={latest ? "btn-ghost" : "btn-primary"} onClick={newGame}>{t("menu.newGame")}</button>
        {hasSaves && <button className="btn-ghost" onClick={() => go("saves")}>{t("menu.load")}</button>}
        <button className="btn-ghost" onClick={() => go("multi")}>{t("menu.multi")}</button>
        <button className="btn-ghost" onClick={() => go("settings")}>{t("menu.settings")}</button>
        <button className="btn-ghost" onClick={() => go("credits")}>{t("menu.credits")}</button>
      </nav>
      <footer className="absolute bottom-3 right-4 font-pixel text-[10px] text-text-muted">v{GAME.version}</footer>
    </div>
  );
}
