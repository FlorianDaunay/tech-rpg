import { create } from "zustand";
import { GAME } from "@/config/game";
import { registerContent } from "@/content/boot";
import { content } from "@/content/registry";
import { migrateSave, type SaveData } from "@/core/save/save";
import { ngPlusUnlocked, type WorldRules } from "@/core/sim/rules";

/**
 * Save slots in localStorage (browser: per site; Android: the app's private WebView storage).
 * Every read goes through `migrateSave`, so old or hand-edited saves are upgraded and cleaned.
 */
export const SLOTS = [1, 2, 3] as const;
export type Slot = (typeof SLOTS)[number];

const keyOf = (slot: number) => `${GAME.storagePrefix}-save-${slot}`;
const LAST_KEY = `${GAME.storagePrefix}-save-last`;

export interface SaveSummary {
  slot: Slot;
  level: number;
  map: string;
  playtime: number;
  savedAt: number;
  rules: WorldRules;
  /** Story finished: New Game+ can start from it. */
  canNgPlus: boolean;
}

const mapExists = (id: string) => !!content.maps.find(id);

export function readSave(slot: number): SaveData | null {
  registerContent();
  try {
    const raw = localStorage.getItem(keyOf(slot));
    return raw ? migrateSave(JSON.parse(raw), mapExists) : null;
  } catch {
    return null;
  }
}

const summarize = (slot: Slot, s: SaveData): SaveSummary => ({
  slot,
  level: s.player.level,
  map: s.map,
  playtime: s.playtime,
  savedAt: s.savedAt,
  rules: s.rules,
  canNgPlus: ngPlusUnlocked(s.player.progress.flags),
});

function scan(): Record<Slot, SaveSummary | null> {
  return Object.fromEntries(SLOTS.map((slot) => {
    const s = readSave(slot);
    return [slot, s ? summarize(slot, s) : null];
  })) as Record<Slot, SaveSummary | null>;
}

interface SavesState {
  slots: Record<Slot, SaveSummary | null>;
  /** What the next world start uses: chosen on the title screen, read by the play screen. */
  pending: { slot: Slot; save: SaveData | null; rules?: WorldRules } | null;
  /** Slot the New Game screen will start in. */
  newSlot: Slot | null;
  refresh: () => void;
}

export const useSaves = create<SavesState>()((set) => ({
  slots: { 1: null, 2: null, 3: null },
  pending: null,
  newSlot: null,
  refresh: () => set({ slots: scan() }),
}));

let persistAsked = false;

/** Writes a slot. Returns false when storage refuses (quota, private mode). */
export function writeSave(slot: number, data: SaveData): boolean {
  try {
    localStorage.setItem(keyOf(slot), JSON.stringify(data));
    localStorage.setItem(LAST_KEY, String(slot));
  } catch {
    return false;
  }
  // Ask the browser not to evict our storage under disk pressure (no prompt in most browsers).
  if (!persistAsked) {
    persistAsked = true;
    void navigator.storage?.persist?.().catch(() => {});
  }
  const s = useSaves.getState();
  if (SLOTS.includes(slot as Slot)) useSaves.setState({ slots: { ...s.slots, [slot]: summarize(slot as Slot, data) } });
  return true;
}

export function deleteSave(slot: Slot): void {
  localStorage.removeItem(keyOf(slot));
  if (localStorage.getItem(LAST_KEY) === String(slot)) localStorage.removeItem(LAST_KEY);
  useSaves.getState().refresh();
}

/** The slot written last, if it still holds a save. */
export function lastSlot(): Slot | null {
  const slots = useSaves.getState().slots;
  const last = Number(localStorage.getItem(LAST_KEY)) as Slot;
  if (slots[last]) return last;
  // Fallback: the most recently saved one.
  const any = SLOTS.map((s) => slots[s]).filter((s): s is SaveSummary => !!s).sort((a, b) => b.savedAt - a.savedAt)[0];
  return any?.slot ?? null;
}

export const firstEmptySlot = (): Slot | null => SLOTS.find((s) => !useSaves.getState().slots[s]) ?? null;

/** Picks what the next "Solo" start loads (save) or begins (null save = new game in that slot). */
export const chooseStart = (slot: Slot, save: SaveData | null, rules?: WorldRules) => useSaves.setState({ pending: { slot, save, rules } });

/** Opens the New Game screen (difficulty, Omens) for a slot. */
export const pickNewGame = (slot: Slot) => useSaves.setState({ newSlot: slot });

const fileName = (slot: Slot) => `${GAME.storagePrefix}-save-${slot}-${new Date().toISOString().slice(0, 10)}.json`;

/**
 * Backup of a slot as a JSON file. Android (and mobile browsers): the share sheet (Drive, mail…);
 * desktop: a download.
 */
export async function exportSave(slot: Slot): Promise<boolean> {
  const raw = localStorage.getItem(keyOf(slot));
  if (!raw) return false;
  const file = new File([raw], fileName(slot), { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: GAME.title });
      return true;
    }
  } catch (e) {
    // The user closed the share sheet: not an error worth a fallback download.
    if (e instanceof DOMException && e.name === "AbortError") return false;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Reads a backup file into a slot. Returns false if it isn't a (compatible) save. */
export async function importSave(slot: Slot, file: File): Promise<boolean> {
  registerContent();
  try {
    const data = migrateSave(JSON.parse(await file.text()), mapExists);
    return !!data && writeSave(slot, data);
  } catch {
    return false;
  }
}
