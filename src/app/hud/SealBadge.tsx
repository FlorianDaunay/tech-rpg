import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";

/** "Exit sealed — 2 wardens left" under the top edge; a short "the way opens" when the last one falls. */
export function SealBadge() {
  const seal = useGameStatus((s) => s.seal);
  const [justOpened, setJustOpened] = useState(false);
  const left = seal?.left ?? null;
  useEffect(() => {
    if (left !== 0) return setJustOpened(false);
    setJustOpened(true);
    const timer = setTimeout(() => setJustOpened(false), 3500);
    return () => clearTimeout(timer);
  }, [left]);
  if (!seal || (seal.left === 0 && !justOpened)) return null;
  const open = seal.left === 0;
  return (
    <div className="safe pointer-events-none absolute inset-x-0 top-3 flex justify-center short:top-2" role="status">
      <div className={`surface flex items-center gap-2 rounded-pill px-3 py-1 text-xs shadow-card animate-[fadeUp_200ms_ease-out_both] ${open ? "text-success" : "text-warning"}`}>
        <span aria-hidden>{open ? "✦" : "✕"}</span>
        <span>{open ? t("seal.open") : t("seal.left", { left: seal.left, total: seal.total })}</span>
        {!open && (
          <span className="flex gap-0.5" aria-hidden>
            {Array.from({ length: seal.total }, (_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-pill ${i < seal.total - seal.left ? "bg-success" : "bg-warning"}`} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
