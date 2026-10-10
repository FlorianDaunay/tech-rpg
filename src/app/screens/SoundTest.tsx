import { useEffect, useState } from "react";
import { audio, SFX_NAMES, SONG_IDS, type MusicState, type SfxName } from "@/game/audio";
import { t } from "@/i18n";
import { useScreen } from "@/store/screen";
import { useSettings } from "@/store/settings";

const STATES: MusicState[] = ["explore", "combat", "boss", "danger-low-hp", "silence"];
const ZONES = [null, "hub", "whispering-wilds", "ashen-graveyard", "deep-mines", "fallen-citadel", "hollow-rift"];

/** Dev tool: every SFX, every song with its adaptive states, ambience beds and volume sliders. */
export function SoundTest() {
  const go = useScreen((s) => s.go);
  const volume = useSettings((s) => s.volume);
  const set = useSettings((s) => s.set);
  const [song, setSong] = useState<string | null>(null);
  const [state, setState] = useState<MusicState>("explore");
  const [amb, setAmb] = useState<string | null>(null);
  const [hum, setHum] = useState<ReturnType<typeof audio.sfx>>(null);

  useEffect(() => () => audio.music.stop(0.5), []);

  const play = async (name: SfxName) => {
    await audio.unlock();
    if (name === "lantern-hum") {
      if (hum) {
        hum.stop();
        setHum(null);
      } else setHum(audio.sfx(name));
      return;
    }
    audio.sfx(name, name === "swing-charge" ? { duration: 1 } : undefined);
  };

  return (
    <div className="safe relative z-10 h-full overflow-y-auto p-4">
      <div className="panel mx-auto flex max-w-4xl flex-col gap-5 p-5">
        <header className="flex items-center justify-between">
          <h2 className="title-display text-2xl">{t("soundtest.title")}</h2>
          <button className="btn-ghost" onClick={() => go("settings")}>{t("menu.back")}</button>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          {(["master", "music", "sfx"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-sm text-text-secondary">
              {t(`soundtest.volume.${k}`)} — {Math.round(volume[k] * 100)}%
              <input type="range" min={0} max={1} step={0.01} value={volume[k]}
                onChange={(e) => set({ volume: { ...volume, [k]: Number(e.target.value) } })} />
            </label>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-display text-text-primary">{t("soundtest.music")}</h3>
          <div className="flex flex-wrap gap-2">
            {SONG_IDS.map((id) => (
              <button key={id} className={song === id ? "btn-primary" : "btn-ghost"}
                onClick={async () => {
                  await audio.unlock();
                  if (id === "victory" || id === "defeat") audio.music.sting(id);
                  else {
                    audio.music.play(id);
                    setSong(id);
                  }
                }}>{id}</button>
            ))}
            <button className="btn-ghost" onClick={() => { audio.music.stop(); setSong(null); }}>■</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <button key={s} className={state === s ? "btn-primary" : "btn-ghost"}
                onClick={() => { audio.music.setState(s); setState(s); }}>{s}</button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-display text-text-primary">{t("soundtest.ambience")}</h3>
          <div className="flex flex-wrap gap-2">
            {ZONES.map((z) => (
              <button key={z ?? "none"} className={amb === z ? "btn-primary" : "btn-ghost"}
                onClick={async () => { await audio.unlock(); audio.ambience.set(z); setAmb(z); }}>{z ?? "—"}</button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-display text-text-primary">{t("soundtest.sfx")}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SFX_NAMES.map((name) => (
              <button key={name} className={name === "lantern-hum" && hum ? "btn-primary" : "btn-ghost"}
                onClick={() => void play(name)}>{name}</button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
