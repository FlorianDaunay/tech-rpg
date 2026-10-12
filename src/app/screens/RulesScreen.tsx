import { useState } from "react";
import { bridge } from "@/bridge/events";
import type { WorldRules } from "@/core/sim/rules";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useMenu } from "@/store/menu";
import { MenuButton, Modal, uiSound } from "@/ui/menu/components";
import { RulesPicker, rulesLabel } from "./RulesPicker";

/** Pause → World rules: change difficulty / Omens mid-run (enemies rescale at once). Online only the host may. */
export function RulesScreen({ readOnly = false }: { readOnly?: boolean }) {
  const current = useGameStatus((s) => s.inventory?.rules);
  const back = useMenu((s) => s.back);
  const [rules, setRules] = useState<WorldRules | null>(current ?? null);
  if (!current || !rules) return null;
  const changed = rules.difficulty !== current.difficulty || [...rules.omens].sort().join() !== [...current.omens].sort().join();
  return (
    <Modal
      title={t("rules.title")}
      onBack={back}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-text-muted">{t("rules.current", { rules: rulesLabel(current) })}</span>
          {readOnly ? (
            <span className="text-xs text-text-muted">{t("rules.hostOnly")}</span>
          ) : (
            <MenuButton
              primary
              disabled={!changed}
              onClick={() => {
                uiSound.confirm();
                bridge.emit("ui:rules", rules);
                back();
              }}
            >
              {t("rules.apply")}
            </MenuButton>
          )}
        </div>
      }
    >
      <div className={readOnly ? "pointer-events-none opacity-60" : undefined} aria-disabled={readOnly || undefined}>
        <RulesPicker value={readOnly ? current : rules} onChange={setRules} />
      </div>
    </Modal>
  );
}
