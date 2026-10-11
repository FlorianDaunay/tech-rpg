/**
 * Artificial network conditions for testing (both sides of a session apply them to what they send,
 * so the round trip is ~2 × delay). Off by default. Set from the URL (`?lag=150&jitter=20&loss=5`,
 * lag/jitter in ms one way, loss in % of unreliable packets) or at runtime via `window.__netSim`.
 *
 * Reliable messages are delayed but never dropped and keep their order (like a slow TCP);
 * unreliable ones may be dropped and may arrive out of order (jitter), like real UDP-ish channels.
 */
export interface NetConditions {
  /** One-way delay (ms). */
  lag: number;
  /** Random extra delay, 0..jitter ms. */
  jitter: number;
  /** Unreliable packets dropped (0..100 %). */
  loss: number;
}

export const netSim: NetConditions = { lag: 0, jitter: 0, loss: 0 };

export const netSimActive = () => netSim.lag > 0 || netSim.jitter > 0 || netSim.loss > 0;

/** Parses `?lag=&jitter=&loss=` (missing or invalid values stay 0). */
export function conditionsFromQuery(search: string): NetConditions {
  const q = new URLSearchParams(search);
  const num = (k: string, max: number) => Math.min(max, Math.max(0, Number(q.get(k)) || 0));
  return { lag: num("lag", 2000), jitter: num("jitter", 1000), loss: num("loss", 100) };
}

/** Last scheduled delivery per reliable channel (keeps the order under jitter). */
const lastAt = new WeakMap<object, number>();

/**
 * Sends now, later, or never according to `netSim`. `channel` identifies the connection (ordering key).
 * `random` and `now` are injectable for tests.
 */
export function shapedSend(channel: object, reliable: boolean, send: () => void, random = Math.random, now = Date.now()): void {
  if (!netSimActive()) return send();
  if (!reliable && random() * 100 < netSim.loss) return;
  let at = now + netSim.lag + random() * netSim.jitter;
  if (reliable) {
    at = Math.max(at, lastAt.get(channel) ?? 0);
    lastAt.set(channel, at);
  }
  setTimeout(send, at - now);
}

if (typeof window !== "undefined") {
  Object.assign(netSim, conditionsFromQuery(window.location.search));
  (window as unknown as { __netSim: NetConditions }).__netSim = netSim;
}
