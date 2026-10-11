import { emptyIntent, type Intent } from "@/core/sim/intent";
import type { SeqInput } from "./protocol";

/** Inputs re-sent in every packet (covers a couple of lost packets). */
export const REDUNDANCY = 3;
/** The host never lets a client's queue grow beyond this (a lagging client skips ahead). */
const MAX_QUEUE = 12;

/**
 * Host side, one per remote player: orders incoming inputs by seq, drops duplicates, hands out one
 * per sim step. When the queue runs dry the player keeps moving/holding as before but presses nothing
 * (a lost press must not repeat). `acked` = the last seq applied (sent back in snapshots).
 */
export class InputQueue {
  private queue: SeqInput[] = [];
  private last: Intent = emptyIntent();
  acked = 0;

  receive(inputs: readonly SeqInput[]): void {
    for (const i of inputs) {
      if (i.seq <= this.acked || this.queue.some((q) => q.seq === i.seq)) continue;
      this.queue.push(i);
    }
    this.queue.sort((a, b) => a.seq - b.seq);
    if (this.queue.length > MAX_QUEUE) {
      // Way behind: merge the presses of what we skip into the next input so no action is lost.
      const skipped = this.queue.splice(0, this.queue.length - MAX_QUEUE);
      const next = this.queue[0]!;
      next.intent = { ...next.intent, pressed: [...new Set([...skipped.flatMap((s) => s.intent.pressed), ...next.intent.pressed])], commands: [...skipped.flatMap((s) => s.intent.commands ?? []), ...(next.intent.commands ?? [])] };
    }
  }

  /** The intent for this step. */
  next(): Intent {
    const i = this.queue.shift();
    if (!i) return { ...this.last, pressed: [], commands: [] };
    this.acked = i.seq;
    this.last = i.intent;
    return i.intent;
  }
}

/** Client side: numbers inputs, keeps the ones the host hasn't confirmed (replayed after each snapshot). */
export class PendingInputs {
  private seq = 0;
  private pending: SeqInput[] = [];

  add(intent: Intent): SeqInput {
    const input = { seq: ++this.seq, intent };
    this.pending.push(input);
    return input;
  }

  /** The packet to send: the newest few inputs. */
  packet(): SeqInput[] {
    return this.pending.slice(-REDUNDANCY);
  }

  /** Drops what the host has applied; returns what must be replayed on top of its state. */
  ack(seq: number): SeqInput[] {
    this.pending = this.pending.filter((p) => p.seq > seq);
    return this.pending;
  }
}
