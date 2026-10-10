import credits from "@/content/data/credits.json";
import { GAME } from "@/config/game";
import { t } from "@/i18n";
import { Modal } from "@/ui/menu/components";

interface Credit {
  id: string;
  title: string;
  author: string;
  url?: string;
  licence: string;
  licenceUrl?: string;
  attributionRequired: boolean;
  attribution?: string;
}

/** Asset and library credits from content/data/credits.json. CC BY entries show their exact attribution line. */
export function CreditsScreen({ onBack }: { onBack: () => void }) {
  const list = (credits as { credits: Credit[] }).credits;
  return (
    <Modal title={t("menu.credits")} onBack={onBack} wide>
      <div className="mb-5 text-center">
        <div className="title-display text-2xl">{GAME.title}</div>
        <div className="font-display text-sm tracking-[0.3em] text-accent uppercase">{GAME.subtitle}</div>
        <p className="mt-2 text-xs text-text-muted">{t("credits.audio")}</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((c) => (
          <li key={c.id} className="rounded-tile border border-border p-3">
            <div className="text-sm font-semibold">{c.title}</div>
            <div className="text-xs text-text-secondary">{c.author}</div>
            <div className="mt-1 text-xs text-text-muted">
              {c.licenceUrl ? (
                <a className="underline" href={c.licenceUrl} target="_blank" rel="noreferrer">{c.licence}</a>
              ) : (
                c.licence
              )}
              {c.url && (
                <>
                  {" · "}
                  <a className="underline" href={c.url} target="_blank" rel="noreferrer">{c.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>
                </>
              )}
            </div>
            {c.attributionRequired && c.attribution && <p className="mt-1.5 text-xs text-text-primary">{c.attribution}</p>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
