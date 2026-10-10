import { en, type I18nKey } from "./en";
import { fr } from "./fr";

export type Lang = "en" | "fr";
const dictionaries: Record<Lang, Partial<Record<I18nKey, string>>> = { en, fr };

let current: Lang = navigator.language.startsWith("fr") ? "fr" : "en";

export const setLang = (lang: Lang) => (current = lang);
export const getLang = () => current;

/** Translate a key, with `{name}` placeholders. Falls back to English, then to the key. */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const text = dictionaries[current][key] ?? en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : text;
}

export type { I18nKey };
