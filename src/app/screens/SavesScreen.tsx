import { useEffect, useRef, useState } from "react";
import { content } from "@/content/registry";
import { getLang, t } from "@/i18n";
import { chooseStart, deleteSave, exportSave, importSave, readSave, SLOTS, useSaves, type SaveSummary, type Slot } from "@/store/saves";
import { useScreen } from "@/store/screen";
import { MenuButton, Modal } from "@/ui/menu/components";
import { localized } from "../items";

/** "1 h 05" / "12 min". */
export function formatPlaytime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}

/** Zone name of the map the save stands in. */
export function placeName(map: string): string {
  const m = content.maps.find(map);
  const z = m && content.zones.find(m.zone);
  return z ? localized(z.name) : map;
}

/** Save slots: load, start a new game, back up (export / import), delete. */
export function SavesScreen() {
  const go = useScreen((s) => s.go);
  const { slots, refresh } = useSaves();
  const [confirm, setConfirm] = useState<{ slot: Slot; action: "new" | "delete" } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const importSlot = useRef<Slot>(1);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(refresh, [refresh]);

  const play = (slot: Slot) => {
    chooseStart(slot, readSave(slot));
    go("solo");
  };
  const fresh = (slot: Slot) => {
    chooseStart(slot, null);
    go("solo");
  };

  return (
    <div className="safe relative z-10 h-full">
      <Modal title={t("saves.title")} onBack={() => go("title")} wide>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setMessage((await importSave(importSlot.current, file)) ? t("saves.imported") : t("saves.importFailed"));
          }}
        />
        {message && <p className="mb-3 text-sm text-accent" role="status">{message}</p>}
        <ul className="flex flex-col gap-3">
          {SLOTS.map((slot) => {
            const s = slots[slot];
            const asking = confirm?.slot === slot ? confirm.action : null;
            return (
              <li key={slot} className="flex flex-wrap items-center gap-3 rounded-tile border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base">{t("saves.slot", { n: slot })}</div>
                  {s ? <SlotLine s={s} /> : <p className="text-sm text-text-muted">{t("saves.empty")}</p>}
                </div>
                {asking ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-warning">{t(asking === "new" ? "saves.overwriteConfirm" : "saves.deleteConfirm")}</span>
                    <MenuButton autoFocus onClick={() => setConfirm(null)}>{t("common.cancel")}</MenuButton>
                    <MenuButton
                      primary
                      onClick={() => {
                        setConfirm(null);
                        if (asking === "new") fresh(slot);
                        else deleteSave(slot);
                      }}
                    >
                      {t(asking === "new" ? "saves.newGame" : "saves.delete")}
                    </MenuButton>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {s && <MenuButton primary onClick={() => play(slot)}>{t("saves.load")}</MenuButton>}
                    <MenuButton onClick={() => (s ? setConfirm({ slot, action: "new" }) : fresh(slot))}>{t("saves.newGame")}</MenuButton>
                    {s && <MenuButton onClick={() => void exportSave(slot).then((ok) => ok && setMessage(t("saves.exported")))}>{t("saves.export")}</MenuButton>}
                    <MenuButton
                      onClick={() => {
                        importSlot.current = slot;
                        fileInput.current?.click();
                      }}
                    >
                      {t("saves.import")}
                    </MenuButton>
                    {s && <MenuButton onClick={() => setConfirm({ slot, action: "delete" })}>{t("saves.delete")}</MenuButton>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-text-muted">{t("saves.where")}</p>
      </Modal>
    </div>
  );
}

function SlotLine({ s }: { s: SaveSummary }) {
  const date = s.savedAt ? new Date(s.savedAt).toLocaleString(getLang(), { dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <p className="text-sm text-text-secondary">
      {t("hud.level", { level: s.level })} · {placeName(s.map)} · {formatPlaytime(s.playtime)}
      {date && <span className="text-text-muted"> · {date}</span>}
    </p>
  );
}
