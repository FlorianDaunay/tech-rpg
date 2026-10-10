import { t } from "@/i18n";
import { useScreen } from "@/store/screen";

/** Placeholder for screens built in later milestones. */
export function ComingSoon({ title }: { title: string }) {
  const go = useScreen((s) => s.go);
  return (
    <div className="safe relative z-10 flex h-full items-center justify-center p-6">
      <div className="panel flex max-w-sm flex-col items-center gap-4 p-8 text-center">
        <h2 className="title-display text-2xl">{title}</h2>
        <p className="text-text-secondary">The lantern has not reached this place yet.</p>
        {import.meta.env.DEV && title === t("menu.settings") && (
          <button className="btn-ghost" onClick={() => go("soundtest")}>{t("soundtest.open")}</button>
        )}
        <button className="btn-ghost" onClick={() => go("title")}>{t("menu.back")}</button>
      </div>
    </div>
  );
}
