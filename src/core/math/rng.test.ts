import { describe, expect, it } from "vitest";
import { createRng, hashSeed } from "./rng";

describe("rng", () => {
  it("is deterministic for a seed and resumable from its state", () => {
    const a = createRng(42);
    const first = [a.next(), a.next()];
    const b = createRng(42);
    expect([b.next(), b.next()]).toEqual(first);
    const resumed = createRng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it("keeps int() within inclusive bounds", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it("respects weights roughly", () => {
    const rng = createRng(1);
    let rare = 0;
    for (let i = 0; i < 10000; i++) if (rng.weighted([["common", 9], ["rare", 1]] as const) === "rare") rare++;
    expect(rare).toBeGreaterThan(800);
    expect(rare).toBeLessThan(1200);
  });

  it("hashes strings stably", () => {
    expect(hashSeed("2026-10-10")).toBe(hashSeed("2026-10-10"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});
