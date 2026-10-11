import { Fragment } from "react";
import { setLang, t } from "@/i18n";
import "@/store/game"; // mirrors engine status from the bridge
import { useScreen } from "@/store/screen";
import { useSettings } from "@/store/settings";
import { GameCanvas } from "./GameCanvas";
import { ComingSoon } from "./screens/ComingSoon";
import { CreditsScreen } from "./screens/CreditsScreen";
import { PlayScreen } from "./screens/PlayScreen";
import { SavesScreen } from "./screens/SavesScreen";
import { NewGameScreen } from "./screens/NewGameScreen";
import { MultiScreen } from "./screens/MultiScreen";
import { useNet } from "@/store/net";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SoundTest } from "./screens/SoundTest";
import { TitleScreen } from "./screens/TitleScreen";

const autoLang = () => (navigator.language.startsWith("fr") ? "fr" : "en");

export function App() {
  const screen = useScreen((s) => s.screen);
  const go = useScreen((s) => s.go);
  // Language is a setting. t() is not reactive, so the HTML screens re-mount when it changes;
  // the canvas must not (that would destroy the running game).
  const lang = useSettings((s) => s.lang) ?? autoLang();
  setLang(lang);
  return (
    <main lang={lang} className="relative h-full w-full overflow-hidden">
      <GameCanvas />
      <Fragment key={lang}>
        {screen === "title" && <TitleScreen />}
        {screen === "solo" && <PlayScreen mode="solo" />}
        {screen === "saves" && <SavesScreen />}
        {screen === "newgame" && <NewGameScreen />}
        {screen === "multi" && <MultiScreen />}
        {screen === "online" && <PlayScreen mode={useNet.getState().session?.role ?? "host"} />}
        {screen === "settings" && <SettingsScreen onBack={() => go("title")} />}
        {screen === "soundtest" && <SoundTest />}
        {screen === "credits" && <CreditsScreen onBack={() => go("title")} />}
      </Fragment>
    </main>
  );
}
