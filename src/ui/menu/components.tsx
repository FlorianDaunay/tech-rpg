import { useEffect, useRef, type ReactNode } from "react";
import { audio } from "@/game/audio";
import { t } from "@/i18n";
import { useMenuNav } from "./useMenuNav";

/** UI click/hover feedback (juice is a feature for menus too). */
export const uiSound = {
  click: () => audio.sfx("ui-click", { volume: 0.6 }),
  confirm: () => audio.sfx("ui-confirm", { volume: 0.7 }),
  back: () => audio.sfx("ui-back", { volume: 0.6 }),
  hover: () => audio.sfx("ui-hover", { volume: 0.35 }),
  error: () => audio.sfx("ui-error", { volume: 0.6 }),
  open: () => audio.sfx("ui-open", { volume: 0.45 }),
};

/**
 * Full-screen menu layer: dimmed backdrop, a panel, keyboard/gamepad navigation, Escape/B to go back.
 * Every menu (pause, inventory, settings, credits) is one of these.
 */
export function Modal({ title, onBack, children, wide = false, footer }: { title: string; onBack?: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const back = onBack
    ? () => {
        uiSound.back();
        onBack();
      }
    : undefined;
  useMenuNav(ref, { back });
  useEffect(() => void uiSound.open(), []);
  return (
    <div className="safe menu-backdrop pointer-events-auto absolute inset-0 z-30 flex items-center justify-center p-3 backdrop-blur-[2px] animate-[fadeUp_180ms_ease-out_both]">
      <EmberDrift />
      <div ref={ref} role="dialog" aria-label={title} className={`panel-ornate flex max-h-full w-full flex-col ${wide ? "max-w-4xl" : "max-w-md"}`}>
        <span className="corner corner-tl" aria-hidden />
        <span className="corner corner-tr" aria-hidden />
        <span className="corner corner-bl" aria-hidden />
        <span className="corner corner-br" aria-hidden />
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 short:py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="title-rule hidden sm:block" aria-hidden />
            <span className="text-xs text-accent" aria-hidden>✦</span>
            <h2 className="title-display title-glow truncate text-xl short:text-lg">{title}</h2>
            <span className="text-xs text-accent" aria-hidden>✦</span>
            <span className="title-rule flip" aria-hidden />
          </div>
          {back && (
            <button className="btn-ghost px-3 py-1.5 text-sm short:py-1" onClick={back} aria-label={t("menu.back")}>
              ✕
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 short:p-3">{children}</div>
        {footer && <footer className="border-t border-border px-5 py-3 short:py-2">{footer}</footer>}
      </div>
    </div>
  );
}

/** Embers drifting up behind a menu (pure CSS; positions fixed per mote so renders are stable). */
const MOTES = Array.from({ length: 16 }, (_, i) => ({ left: (i * 37 + 11) % 100, duration: 7 + ((i * 53) % 60) / 10, delay: -((i * 29) % 70) / 10, drift: ((i * 17) % 60) - 30, size: 2 + (i % 3) }));
function EmberDrift() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {MOTES.map((m, i) => (
        <span key={i} className="ember-mote" style={{ left: `${m.left}%`, width: m.size, height: m.size, animationDuration: `${m.duration}s`, animationDelay: `${m.delay}s`, ["--drift" as string]: `${m.drift}px` }} />
      ))}
    </div>
  );
}

export function MenuButton({ children, onClick, primary = false, autoFocus = false, disabled = false }: { children: ReactNode; onClick: () => void; primary?: boolean; autoFocus?: boolean; disabled?: boolean }) {
  return (
    <button
      className={primary ? "btn-primary" : "btn-ghost"}
      data-autofocus={autoFocus || undefined}
      disabled={disabled}
      onMouseEnter={uiSound.hover}
      onFocus={uiSound.hover}
      onClick={() => {
        uiSound.click();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 rounded-control bg-canvas/60 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === value}
          className={`flex-1 rounded-control px-3 py-1.5 text-sm font-semibold transition duration-200 ${tab.id === value ? "tab-active bg-accent text-accent-foreground" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"}`}
          onClick={() => {
            uiSound.click();
            onChange(tab.id);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled row: label on the left, control on the right. */
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-text-primary">{label}</div>
        {hint && <div className="text-xs text-text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Slider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={0} max={1} step={0.05} value={value} aria-label={label} className="w-36 accent-[rgb(var(--color-accent))] short:w-28" onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-9 text-right font-mono text-xs text-text-secondary">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={`relative h-6 w-11 rounded-pill border border-border transition ${value ? "bg-accent" : "bg-canvas"}`}
      onClick={() => {
        uiSound.click();
        onChange(!value);
      }}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-pill bg-text-primary transition-all ${value ? "left-6" : "left-1"}`} />
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-control bg-canvas/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={o.id === value}
          className={`rounded-control px-2.5 py-1 text-xs font-semibold ${o.id === value ? "bg-accent text-accent-foreground" : "text-text-secondary hover:bg-surface-hover"}`}
          onClick={() => {
            uiSound.click();
            onChange(o.id);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
