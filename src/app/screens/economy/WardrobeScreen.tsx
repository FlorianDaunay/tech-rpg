import { content } from "@/content/registry";
import type { CosmeticKind } from "@/core/economy/defs";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { Modal } from "@/ui/menu/components";
import { CosmeticIcon, localized } from "../../items";
import { sendEconomy } from "./common";

const SLOTS: CosmeticKind[] = ["lantern", "trail", "pet"];

/** Cosmetics the player owns: wear one per slot (lantern light, footstep trail, pet trinket). */
export function WardrobeScreen() {
  const inv = useGameStatus((s) => s.inventory);
  const back = useMenu((s) => s.back);
  if (!inv) return null;
  const { cosmetics } = inv;

  return (
    <Modal title={t("wardrobe.title")} onBack={back} wide>
      <div className="flex flex-col gap-5">
        {SLOTS.map((slot) => {
          const all = content.cosmetics.all().filter((c) => c.kind === slot);
          const worn = cosmetics[slot];
          return (
            <section key={slot}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t(`wardrobe.${slot}`)}</h3>
                {worn && (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => sendEconomy({ type: "cosmetic", slot, id: null })}>
                    {t("wardrobe.remove")}
                  </button>
                )}
              </div>
              <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
                {all.map((c) => {
                  const owned = cosmetics.owned.includes(c.id);
                  const on = worn === c.id;
                  return (
                    <button
                      key={c.id}
                      disabled={!owned}
                      title={localized(c.description)}
                      className={`tile-hover flex items-center gap-2 rounded-tile border p-1.5 text-left transition hover:bg-surface-hover disabled:opacity-40 ${on ? "border-accent bg-accent/10" : "border-border/60"}`}
                      onClick={() => sendEconomy({ type: "cosmetic", slot, id: on ? null : c.id })}
                    >
                      <CosmeticIcon id={c.id} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{localized(c.name)}</span>
                        <span className={`block text-[10px] uppercase tracking-wider ${on ? "text-accent" : "text-text-muted"}`}>{on ? t("wardrobe.worn") : owned ? t("wardrobe.owned") : t("wardrobe.locked")}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        <p className="text-xs text-text-muted">{t("wardrobe.hint")}</p>
      </div>
    </Modal>
  );
}
