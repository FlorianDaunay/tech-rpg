export const en = {
  "menu.solo": "Solo",
  "menu.multi": "Multiplayer",
  "menu.settings": "Settings",
  "menu.credits": "Credits",
  "menu.continue": "Continue",
  "menu.back": "Back",
  "common.loading": "Kindling the lantern…",
} as const;

export type I18nKey = keyof typeof en;
