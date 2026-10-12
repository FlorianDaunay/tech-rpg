import { useState } from "react";
import { bridge, type GameMode } from "@/bridge/events";
import { t } from "@/i18n";
import { useMenu } from "@/store/menu";
import { MenuButton, Modal } from "@/ui/menu/components";

/** Esc / Start / ⏸: resume, inventory, settings, back to title. */
export function PauseMenu({ onQuit, mode }: { onQuit: () => void; mode: GameMode }) {
  const { back, open, closeAll } = useMenu();
  const [confirmQuit, setConfirmQuit] = useState(false);
  return (
    <Modal title={t("pause.title")} onBack={back}>
      <nav className="stagger flex flex-col gap-2.5">
        {confirmQuit ? (
          <>
            <p className="mb-1 text-sm text-text-secondary">{t("pause.quitConfirm")}</p>
            <MenuButton autoFocus onClick={() => setConfirmQuit(false)}>{t("common.cancel")}</MenuButton>
            <MenuButton primary onClick={() => (closeAll(), onQuit())}>{t("pause.quit")}</MenuButton>
          </>
        ) : (
          <>
            <MenuButton primary autoFocus onClick={closeAll}>{t("pause.resume")}</MenuButton>
            <MenuButton onClick={() => open("inventory")}>{t("inventory.title")}</MenuButton>
            <MenuButton onClick={() => open("talents")}>{t("talents.title")}</MenuButton>
            <MenuButton onClick={() => open("map")}>{t("map.title")}</MenuButton>
            <MenuButton onClick={() => open("journal")}>{t("journal.title")}</MenuButton>
            <MenuButton onClick={() => open("codex")}>{t("codex.title")}</MenuButton>
            <MenuButton onClick={() => open("rules")}>{t("rules.title")}</MenuButton>
            <MenuButton onClick={() => bridge.emit("ui:save")}>{t("pause.save")}</MenuButton>
            <MenuButton onClick={() => open("settings")}>{t("menu.settings")}</MenuButton>
            <MenuButton onClick={() => setConfirmQuit(true)}>{t("pause.quit")}</MenuButton>
          </>
        )}
      </nav>
    </Modal>
  );
}
