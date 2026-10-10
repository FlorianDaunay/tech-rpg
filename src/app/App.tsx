import { t } from "@/i18n";
import { useScreen } from "@/store/screen";
import { GameCanvas } from "./GameCanvas";
import { ComingSoon } from "./screens/ComingSoon";
import { TitleScreen } from "./screens/TitleScreen";

export function App() {
  const screen = useScreen((s) => s.screen);
  return (
    <main className="relative h-full w-full overflow-hidden">
      <GameCanvas />
      {screen === "title" && <TitleScreen />}
      {screen === "solo" && <ComingSoon title={t("menu.solo")} />}
      {screen === "multi" && <ComingSoon title={t("menu.multi")} />}
      {screen === "settings" && <ComingSoon title={t("menu.settings")} />}
      {screen === "credits" && <ComingSoon title={t("menu.credits")} />}
    </main>
  );
}
