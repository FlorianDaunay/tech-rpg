export const en = {
  "menu.solo": "Solo",
  "menu.multi": "Multiplayer",
  "menu.settings": "Settings",
  "menu.credits": "Credits",
  "menu.continue": "Continue",
  "menu.back": "Back",
  "soundtest.title": "Sound test",
  "soundtest.open": "Sound test (dev)",
  "soundtest.music": "Music",
  "soundtest.ambience": "Ambience",
  "soundtest.sfx": "Sound effects",
  "soundtest.volume.master": "Master",
  "soundtest.volume.music": "Music",
  "soundtest.volume.sfx": "Effects",
  "hud.vitals": "Health and stamina",
  "hud.fallen": "You have fallen… the Lantern calls you back",
  "common.loading": "Kindling the lantern…",
} as const;

export type I18nKey = keyof typeof en;
