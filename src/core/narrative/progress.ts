import type { SimEvent } from "../combat/events";
import { allQuests, findDialogue, findQuest, type Condition, type DialogueChoice, type Effect, type QuestState } from "./defs";

/** A player's story state. Lives on the player actor, travels across maps (and into saves later). */
export interface Progress {
  flags: string[];
  /** Started quests. Absent = never started. */
  /** `ready` = "ready to turn in" was already announced (so it is announced once, when it happens). */
  quests: Record<string, { done: boolean; counts: Record<string, number>; ready?: boolean }>;
  /** Kills per enemy type (bestiary). */
  kills: Record<string, number>;
  /** NPCs talked to (talk objectives, codex). */
  met: string[];
  /** Maps visited (reach objectives). */
  visited: string[];
  /** One-time spawns slain for good (`map:spawn`), e.g. guardians. */
  cleared: string[];
}

/** The parts of a player the narrative rules read and write. */
export interface StoryActor {
  id: string;
  bag: Record<string, number>;
  progress: Progress;
  /** Adopted companion (players). */
  pet?: string | null;
}

export const emptyProgress = (): Progress => ({ flags: [], quests: {}, kills: {}, met: [], visited: [], cleared: [] });

const owned = (a: StoryActor, item: string) => a.bag[item] ?? 0;

function objectiveMet(a: StoryActor, questId: string, o: NonNullable<ReturnType<typeof findQuest>>["objectives"][number]): boolean {
  const q = a.progress.quests[questId];
  switch (o.kind) {
    case "kill":
      return (q?.counts[o.id] ?? 0) >= o.count;
    case "collect":
      return owned(a, o.item) >= o.count;
    case "talk":
      return (q?.counts[o.id] ?? 0) >= 1;
    case "reach":
      return a.progress.visited.includes(o.map);
    case "flag":
      return a.progress.flags.includes(o.flag);
  }
}

/** none → active → ready (all objectives met, waiting for turn-in) → done. */
export function questState(a: StoryActor, id: string): QuestState {
  const q = a.progress.quests[id];
  if (!q) return "none";
  if (q.done) return "done";
  const def = findQuest(id);
  return def && def.objectives.every((o) => objectiveMet(a, id, o)) ? "ready" : "active";
}

/** Progress of each objective for the journal: [current, target]. */
export function objectiveProgress(a: StoryActor, id: string): { id: string; current: number; target: number }[] {
  const def = findQuest(id);
  if (!def) return [];
  const q = a.progress.quests[id];
  return def.objectives.map((o) => {
    if (o.kind === "kill") return { id: o.id, current: Math.min(o.count, q?.counts[o.id] ?? 0), target: o.count };
    if (o.kind === "collect") return { id: o.id, current: Math.min(o.count, owned(a, o.item)), target: o.count };
    return { id: o.id, current: objectiveMet(a, id, o) ? 1 : 0, target: 1 };
  });
}

export function evalCondition(a: StoryActor, c: Condition): boolean {
  if ("quest" in c) {
    const s = questState(a, c.quest);
    return Array.isArray(c.is) ? c.is.includes(s) : s === c.is;
  }
  if ("flag" in c) return a.progress.flags.includes(c.flag) === c.set;
  return owned(a, c.item) >= c.count;
}

export const evalAll = (a: StoryActor, cs: Condition[]) => cs.every((c) => evalCondition(a, c));

function addItem(a: StoryActor, item: string, count: number) {
  a.bag[item] = (a.bag[item] ?? 0) + count;
}
function removeItem(a: StoryActor, item: string, count: number) {
  const left = owned(a, item) - count;
  if (left > 0) a.bag[item] = left;
  else delete a.bag[item];
}

export function startQuest(events: SimEvent[], a: StoryActor, id: string): void {
  if (!findQuest(id) || a.progress.quests[id]) return;
  a.progress.quests[id] = { done: false, counts: {} };
  events.push({ type: "quest", id: a.id, quest: id, change: "started" });
  // Objectives already satisfied (e.g. map already visited) show up right away.
  if (questState(a, id) === "ready") {
    a.progress.quests[id]!.ready = true;
    events.push({ type: "quest", id: a.id, quest: id, change: "ready" });
  }
}

/** Turn-in: only when ready. Hands over collected items, grants rewards, chains the next quest. */
export function completeQuest(events: SimEvent[], a: StoryActor, id: string): boolean {
  const def = findQuest(id);
  if (!def || questState(a, id) !== "ready") return false;
  if (def.consumeItems) for (const o of def.objectives) if (o.kind === "collect") removeItem(a, o.item, o.count);
  if (def.rewards.gold) addItem(a, "gold", def.rewards.gold);
  for (const r of def.rewards.items) addItem(a, r.item, r.count);
  a.progress.quests[id]!.done = true;
  events.push({ type: "quest", id: a.id, quest: id, change: "done" });
  if (def.next) startQuest(events, a, def.next);
  return true;
}

export function applyEffect(events: SimEvent[], a: StoryActor, e: Effect): void {
  if ("startQuest" in e) startQuest(events, a, e.startQuest);
  else if ("completeQuest" in e) completeQuest(events, a, e.completeQuest);
  else if ("setFlag" in e) {
    if (!a.progress.flags.includes(e.setFlag)) a.progress.flags.push(e.setFlag);
  } else if ("clearFlag" in e) a.progress.flags = a.progress.flags.filter((f) => f !== e.clearFlag);
  else if ("give" in e) addItem(a, e.give, e.count);
  else if ("take" in e && owned(a, e.take) >= e.count) removeItem(a, e.take, e.count);
  else if ("adoptPet" in e) {
    a.pet = e.adoptPet;
    events.push({ type: "pet-adopted", id: a.id, pet: e.adoptPet });
  }
}

/**
 * A dialogue choice chosen in the UI. The host re-checks that the node and choice exist and that
 * the choice's conditions hold for this player, then applies its effects.
 */
export function chooseDialogue(events: SimEvent[], a: StoryActor, dialogue: string, node: string, choice: number): DialogueChoice | null {
  const c = findDialogue(dialogue)?.nodes[node]?.choices[choice];
  if (!c || !evalAll(a, c.if)) return null;
  for (const e of c.do) applyEffect(events, a, e);
  return c;
}

const readyNow = (a: StoryActor, id: string) => questState(a, id) === "ready";

/**
 * Quest bookkeeping from this step's sim events: kills, talks, pickups (collect), arrivals.
 * Emits a quest event only for quests whose objectives actually moved.
 */
export function trackProgress(events: SimEvent[], a: StoryActor, mapId: string): void {
  const changed = new Set<string>();
  // Note: this step's pickups are already in the bag, so "was it ready?" comes from the stored flag,
  // not from re-evaluating now.
  const active = () => allQuests().filter((d) => a.progress.quests[d.id] && !a.progress.quests[d.id]!.done);
  const bump = (questId: string, objective: string) => {
    const q = a.progress.quests[questId]!;
    q.counts[objective] = (q.counts[objective] ?? 0) + 1;
    changed.add(questId);
  };
  if (!a.progress.visited.includes(mapId)) {
    a.progress.visited.push(mapId);
    for (const d of active()) if (d.objectives.some((o) => o.kind === "reach" && o.map === mapId)) changed.add(d.id);
  }
  for (const ev of [...events]) {
    if (ev.type === "kill-credit" && ev.id === a.id) {
      a.progress.kills[ev.enemy] = (a.progress.kills[ev.enemy] ?? 0) + 1;
      for (const d of active())
        for (const o of d.objectives) if (o.kind === "kill" && o.enemy === ev.enemy && (a.progress.quests[d.id]!.counts[o.id] ?? 0) < o.count) bump(d.id, o.id);
    } else if (ev.type === "talk" && ev.id === a.id) {
      if (!a.progress.met.includes(ev.npc)) a.progress.met.push(ev.npc);
      for (const d of active()) for (const o of d.objectives) if (o.kind === "talk" && o.npc === ev.npc && !a.progress.quests[d.id]!.counts[o.id]) bump(d.id, o.id);
    } else if ((ev.type === "pickup" && ev.actor === a.id) || (ev.type === "use" && ev.id === a.id)) {
      const item = ev.item;
      for (const d of active()) if (d.objectives.some((o) => o.kind === "collect" && o.item === item)) changed.add(d.id);
    }
  }
  // Flags can be set anywhere (a boss falling, a dialogue): announce each flag objective once when met.
  for (const d of active())
    for (const o of d.objectives) if (o.kind === "flag" && a.progress.flags.includes(o.flag) && !a.progress.quests[d.id]!.counts[o.id]) bump(d.id, o.id);
  for (const id of changed) {
    const q = a.progress.quests[id]!;
    const ready = readyNow(a, id);
    if (ready && !q.ready) events.push({ type: "quest", id: a.id, quest: id, change: "ready" });
    else if (!ready) events.push({ type: "quest", id: a.id, quest: id, change: "progress" });
    q.ready = ready;
  }
}
