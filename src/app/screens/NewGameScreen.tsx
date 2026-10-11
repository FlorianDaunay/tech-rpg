import { useState } from "react";
import { defaultRules, type WorldRules } from "@/core/sim/rules";
import { t } from "@/i18n";
import { chooseStart, useSaves } from "@/store/saves";
import { useScreen } from "@/store/screen";
import { MenuButton, Modal } from "@/ui/menu/components";
import { RulesPicker } from "./RulesPicker";

/** Before a new game: difficulty and Omens (both can be changed later from the pause menu). */
export function NewGameScreen() {
  const go = useScreen((s) => s.go);
  const slot = useSaves((s) => s.newSlot);
  const [rules, setRules] = useState<WorldRules>(defaultRules);
  const start = () => {
    if (slot === null) return go("saves");
    chooseStart(slot, null, rules);
    go("solo");
  };
  return (
    <div className="safe relative z-10 h-full">
      <Modal
        title={t("menu.newGame")}
        onBack={() => go("title")}
        wide
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">{t("rules.changeLater")}</span>
            <MenuButton primary onClick={start}>{t("rules.begin")}</MenuButton>
          </div>
        }
      >
        <RulesPicker value={rules} onChange={setRules} />
      </Modal>
    </div>
  );
}
