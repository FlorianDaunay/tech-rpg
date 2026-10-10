import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { touchInput, touchPress, touchRelease } from "@/bridge/touch";
import type { Action } from "@/core/sim/intent";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useInputDevice } from "@/store/input";
import { useSettings } from "@/store/settings";

const STICK_RADIUS = 56;

interface StickState {
  id: number;
  baseX: number;
  baseY: number;
  knobX: number;
  knobY: number;
}

function vibrate(ms: number) {
  if (useSettings.getState().haptics) navigator.vibrate?.(ms);
}

/**
 * Mobile controls: a floating stick (appears where the thumb lands on the left half) and an
 * action cluster on the right. Shown when the last input was touch (or forced in settings).
 */
export function TouchControls() {
  const device = useInputDevice((s) => s.device);
  const mode = useSettings((s) => s.touchControls);
  const leftHanded = useSettings((s) => s.touchLeftHanded);
  const visible = mode === "always" || (mode === "auto" && device === "touch");

  useEffect(() => {
    touchInput.active = visible;
    if (!visible) {
      touchInput.move = { x: 0, y: 0 };
      touchInput.held.clear();
    }
  }, [visible]);

  if (!visible) return null;
  return (
    <div className={`pointer-events-none absolute inset-0 z-20 flex ${leftHanded ? "flex-row-reverse" : ""}`}>
      <StickZone />
      <ActionCluster mirrored={leftHanded} />
    </div>
  );
}

function StickZone() {
  const [stick, setStick] = useState<StickState | null>(null);
  const zone = useRef<HTMLDivElement>(null);

  const update = (e: ReactPointerEvent, s: StickState) => {
    const dx = e.clientX - s.baseX;
    const dy = e.clientY - s.baseY;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1;
    const next = { ...s, knobX: s.baseX + dx * k, knobY: s.baseY + dy * k };
    touchInput.move = { x: (dx * k) / STICK_RADIUS, y: (dy * k) / STICK_RADIUS };
    setStick(next);
  };

  const end = () => {
    touchInput.move = { x: 0, y: 0 };
    setStick(null);
  };

  const rect = zone.current?.getBoundingClientRect();
  return (
    <div
      ref={zone}
      className="pointer-events-auto relative h-full w-1/2 touch-none"
      onPointerDown={(e) => {
        if (stick) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const s = { id: e.pointerId, baseX: e.clientX, baseY: e.clientY, knobX: e.clientX, knobY: e.clientY };
        setStick(s);
      }}
      onPointerMove={(e) => stick && e.pointerId === stick.id && update(e, stick)}
      onPointerUp={(e) => stick && e.pointerId === stick.id && end()}
      onPointerCancel={end}
    >
      {stick && rect ? (
        <>
          <div
            className="absolute rounded-full border-2 border-text-primary/25 bg-surface/40"
            style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2, left: stick.baseX - rect.left - STICK_RADIUS, top: stick.baseY - rect.top - STICK_RADIUS }}
          />
          <div
            className="absolute h-14 w-14 rounded-full bg-text-primary/70 shadow-overlay"
            style={{ left: stick.knobX - rect.left - 28, top: stick.knobY - rect.top - 28 }}
          />
        </>
      ) : (
        <div className="absolute bottom-[12%] left-[18%] h-24 w-24 rounded-full border-2 border-dashed border-text-primary/15" />
      )}
    </div>
  );
}

interface ButtonSpec {
  action: Action;
  label: string;
  /** Position in the cluster (percent of a square box anchored bottom-right). */
  x: number;
  y: number;
  size: number;
  primary?: boolean;
}

const BUTTONS: ButtonSpec[] = [
  { action: "attack", label: "⚔", x: 64, y: 64, size: 84, primary: true },
  { action: "dodge", label: "⤳", x: 28, y: 80, size: 58 },
  { action: "heavy", label: "✦", x: 82, y: 26, size: 58 },
  { action: "skill1", label: "1", x: 30, y: 44, size: 52 },
  { action: "skill2", label: "2", x: 50, y: 18, size: 52 },
  { action: "ultimate", label: "✹", x: 14, y: 12, size: 54 },
  { action: "block", label: "⛨", x: 4, y: 62, size: 48 },
];

function ActionCluster({ mirrored }: { mirrored: boolean }) {
  return (
    <div className="relative h-full w-1/2">
      <div className={`safe absolute bottom-3 ${mirrored ? "left-3" : "right-3"} h-[min(300px,62vh)] w-[min(300px,62vh)]`}>
        {BUTTONS.map((b) => (
          <ActionButton key={b.action} spec={b} mirrored={mirrored} />
        ))}
      </div>
      <div className="safe absolute right-4 top-4 flex gap-2">
        <button
          className="pointer-events-auto h-11 w-11 rounded-full surface text-lg text-text-primary"
          onPointerDown={() => touchPress("inventory")}
          onPointerUp={() => touchRelease("inventory")}
          aria-label={t("inventory.title")}
        >
          ⛁
        </button>
        <button
          className="pointer-events-auto h-11 w-11 rounded-full surface text-lg text-text-primary"
          onPointerDown={() => touchPress("pause")}
          onPointerUp={() => touchRelease("pause")}
          aria-label={t("pause.title")}
        >
          ❚❚
        </button>
      </div>
    </div>
  );
}

function ActionButton({ spec, mirrored }: { spec: ButtonSpec; mirrored: boolean }) {
  const [down, setDown] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const x = mirrored ? 100 - spec.x : spec.x;
  // Skill buttons show their cooldown / readiness (and hide when the slot is empty).
  const skill = useGameStatus((s) => s.vitals?.skills.find((k) => k.slot === spec.action));
  const ult = useGameStatus((s) => (spec.action === "ultimate" ? (s.vitals?.ult ?? 0) : null));
  if (skill && !skill.id) return null;
  const cooling = !!skill && skill.cd > 0 && skill.cdMax > 0;
  return (
    <button
      aria-label={spec.action}
      className={`pointer-events-auto absolute flex touch-none items-center justify-center rounded-full font-display text-xl transition-transform duration-75 ${
        spec.primary ? "bg-accent/80 text-accent-foreground shadow-overlay" : "surface text-text-primary"
      } ${down ? "scale-90 brightness-125" : ""} ${skill && !skill.ready ? "opacity-60" : ""} ${ult === 1 && skill?.ready ? "ring-2 ring-accent" : ""} overflow-hidden`}
      style={{ width: spec.size, height: spec.size, left: `calc(${x}% - ${spec.size / 2}px)`, top: `calc(${spec.y}% - ${spec.size / 2}px)` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = { x: e.clientX, y: e.clientY };
        setDown(true);
        touchPress(spec.action);
        vibrate(spec.primary ? 12 : 8);
      }}
      onPointerMove={(e) => {
        // Dragging off a skill button aims it (twin-stick style); a plain tap uses auto-aim.
        if (!origin.current) return;
        const dx = e.clientX - origin.current.x;
        const dy = e.clientY - origin.current.y;
        const d = Math.hypot(dx, dy);
        touchInput.aim = d > 18 ? { x: dx / d, y: dy / d } : null;
      }}
      onPointerUp={() => {
        origin.current = null;
        setDown(false);
        touchRelease(spec.action);
        touchInput.aim = null;
      }}
      onPointerCancel={() => {
        origin.current = null;
        setDown(false);
        touchRelease(spec.action);
      }}
    >
      {spec.label}
      {cooling && (
        <span className="absolute inset-0 flex items-center justify-center bg-canvas/60 font-pixel text-xs text-text-primary">{Math.ceil(skill.cd)}</span>
      )}
      {ult !== null && ult < 1 && <span className="absolute inset-x-0 bottom-0 bg-accent/40" style={{ height: `${ult * 100}%` }} />}
    </button>
  );
}
