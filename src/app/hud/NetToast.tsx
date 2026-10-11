import { useEffect, useState } from "react";
import { bridge } from "@/bridge/events";
import { t, type I18nKey } from "@/i18n";

/** Host migration news, top centre: "reconnecting…" stays until it resolves, the rest fade. */
export function NetToast() {
  const [status, setStatus] = useState<"migrating" | "reconnected" | "promoted" | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = bridge.on("game:net", ({ status }) => {
      clearTimeout(timer);
      setStatus(status);
      if (status !== "migrating") timer = setTimeout(() => setStatus(null), 3500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
  if (!status) return null;
  return (
    <div className="safe pointer-events-none absolute inset-x-0 top-24 flex justify-center" role="status">
      <div className={`surface rounded-pill px-4 py-1.5 text-sm shadow-card animate-[fadeUp_200ms_ease-out_both] ${status === "migrating" ? "text-warning" : "text-success"}`}>
        {t(`net.${status}` as I18nKey)}
      </div>
    </div>
  );
}
