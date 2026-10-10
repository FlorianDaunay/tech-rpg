import { t } from "@/i18n";
import "@/store/game"; // mirrors engine status from the bridge
import { useScreen } from "@/store/screen";
import { GameCanvas } from "./GameCanvas";
import { ComingSoon } from "./screens/ComingSoon";
import { PlayScreen } from "./screens/PlayScreen";
import { SoundTest } from "./screens/SoundTest";
import { TitleScreen } from "./screens/TitleScreen";

export function App() {
  const screen = useScreen((s) => s.screen);
  return (
    <main className="relative h-full w-full overflow-hidden">
      <GameCanvas />
      {screen === "title" && <TitleScreen />}
      {screen === "solo" && <PlayScreen mode="solo" />}
      {screen === "multi" && <ComingSoon title={t("menu.multi")} />}
      {screen === "settings" && <ComingSoon title={t("menu.settings")} />}
      {screen === "soundtest" && <SoundTest />}
      {screen === "credits" && <ComingSoon title={t("menu.credits")} />}
    </main>
  );
}
