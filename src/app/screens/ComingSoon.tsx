import { t } from "@/i18n";
import { useRef } from "react";
import { useScreen } from "@/store/screen";
import { useMenuNav } from "@/ui/menu/useMenuNav";

/** Placeholder for screens built in later milestones. */
export function ComingSoon({ title }: { title: string }) {
  const go = useScreen((s) => s.go);
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, { back: () => go("title") });
  return (
    <div className="safe relative z-10 flex h-full items-center justify-center p-6">
      <div ref={ref} className="panel flex max-w-sm flex-col items-center gap-4 p-8 text-center">
        <h2 className="title-display text-2xl">{title}</h2>
        <p className="text-text-secondary">The lantern has not reached this place yet.</p>
        <button className="btn-ghost" onClick={() => go("title")}>{t("menu.back")}</button>
      </div>
    </div>
  );
}
