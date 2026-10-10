import { useEffect, useMemo, useRef, useState } from "react";
import { bridge } from "@/bridge/events";
import { content } from "@/content/registry";
import { evalAll } from "@/core/narrative/progress";
import { t } from "@/i18n";
import { useGameStatus } from "@/store/game";
import { useDialogue, useMenu } from "@/store/menu";
import { uiSound } from "@/ui/menu/components";
import { useMenuNav } from "@/ui/menu/useMenuNav";
import { localized } from "../items";
import { SheetFrame } from "../SheetFrame";

const CHARS_PER_SEC = 55;

/**
 * Conversation panel at the bottom of the screen. Walks the dialogue tree locally (text is
 * presentation); choices with effects go to the sim as commands, which re-check their conditions.
 * Choices are filtered with the same condition rules as the sim, on the latest published progress.
 */
export function DialogueBox() {
  const current = useDialogue();
  const back = useMenu((s) => s.back);
  const inv = useGameStatus((s) => s.inventory);
  const def = current ? content.dialogues.find(current.dialogue) : undefined;
  const npc = current ? content.npcs.find(current.npc) : undefined;
  const story = useMemo(() => (inv ? { id: "local", bag: inv.bag, progress: inv.progress } : null), [inv]);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Opening node: first entry whose conditions hold, else `start`. Chosen once per conversation.
  useEffect(() => {
    if (!def || !story) return;
    setNodeId(def.entries.find((e) => evalAll(story, e.if))?.node ?? def.start);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  const node = def && nodeId ? def.nodes[nodeId] : undefined;
  const text = node ? localized(node.text) : "";
  const done = shown >= text.length;

  // Typewriter; any key or click finishes the line first.
  useEffect(() => {
    setShown(0);
    if (!text) return;
    const start = performance.now();
    const timer = setInterval(() => {
      const n = Math.floor(((performance.now() - start) / 1000) * CHARS_PER_SEC);
      // Never go backwards: a skip (Space/click) already revealed the whole line.
      setShown((prev) => Math.max(prev, Math.min(text.length, n)));
      if (n >= text.length) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [text]);

  const close = () => back();
  useMenuNav(ref, { back: close, autoFocus: false });

  const goto = (next: string | undefined) => {
    if (next && def?.nodes[next]) setNodeId(next);
    else close();
  };

  const choices = node && story ? node.choices.map((c, i) => ({ c, i })).filter(({ c }) => evalAll(story, c.if)) : [];

  // Focus the first option once the line is fully shown (keyboard/gamepad flow).
  useEffect(() => {
    if (done) ref.current?.querySelector<HTMLElement>("[data-option]")?.focus({ preventScroll: true });
  }, [done, nodeId]);

  // 1-9 pick a choice; Space/Enter skips the typewriter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!done && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(text.length);
        return;
      }
      const n = Number(e.key);
      if (done && n >= 1 && n <= choices.length) ref.current?.querySelectorAll<HTMLElement>("[data-option]")[n - 1]?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!def || !node || !npc) return null;
  const pick = (i: number) => {
    const c = node.choices[i]!;
    uiSound.click();
    if (c.do.length) bridge.emit("ui:command", { type: "dialogue", dialogue: def.id, node: nodeId!, choice: i });
    goto(c.next);
  };
  const speaker = node.speaker === "player" ? t("dialogue.you") : localized(npc.name);

  return (
    <div className="safe pointer-events-auto absolute inset-0 z-30 flex items-end justify-center bg-canvas/30 p-3" onClick={() => !done && setShown(text.length)}>
      <div ref={ref} role="dialog" aria-label={speaker} className="panel flex w-full max-w-3xl gap-4 p-4 animate-[fadeUp_180ms_ease-out_both] short:gap-3 short:p-3">
        {node.speaker === "npc" && (
          <div className="hidden shrink-0 flex-col items-center gap-1 sm:flex">
            <div className="rounded-tile border border-border bg-canvas/70 p-1">
              <SheetFrame assetKey={npc.look} size={72} />
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="font-display text-sm tracking-[0.15em] text-accent uppercase">{speaker}</div>
            {node.speaker === "npc" && npc.title && <div className="text-xs text-text-muted">{localized(npc.title)}</div>}
          </div>
          <p className="min-h-[3.5rem] text-base leading-relaxed text-text-primary short:min-h-[2.5rem] short:text-sm">
            {text.slice(0, shown)}
            <span className="opacity-0">{text.slice(shown)}</span>
          </p>
          <div className={`flex flex-col gap-1.5 transition-opacity ${done ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            {choices.length ? (
              choices.map(({ c, i }, k) => (
                <button key={i} data-option className="btn-ghost justify-start py-2 text-left text-sm" onClick={(e) => (e.stopPropagation(), pick(i))}>
                  <span className="font-mono text-xs text-text-muted">{k + 1}</span> {localized(c.text)}
                </button>
              ))
            ) : (
              <button data-option className="btn-primary self-end py-2 text-sm" onClick={(e) => (e.stopPropagation(), uiSound.click(), goto(node.next))}>
                {node.next ? t("dialogue.continue") : t("dialogue.end")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
