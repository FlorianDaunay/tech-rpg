import { describe, expect, it } from "vitest";
import { CYCLE_SECONDS, cyclePhase, darknessAt, nightness } from "./daynight";

describe("day/night", () => {
  it("cycles", () => {
    expect(cyclePhase(0)).toBe(0);
    expect(cyclePhase(CYCLE_SECONDS * 1.25)).toBeCloseTo(0.25);
    expect(cyclePhase(-CYCLE_SECONDS * 0.25)).toBeCloseTo(0.75);
  });

  it("is brightest at phase 0 and darkest at midnight", () => {
    expect(nightness(0)).toBeCloseTo(0);
    expect(nightness(CYCLE_SECONDS / 2)).toBeCloseTo(1);
    expect(darknessAt(0, [0.3, 0.8])).toBeCloseTo(0.3);
    expect(darknessAt(CYCLE_SECONDS / 2, [0.3, 0.8])).toBeCloseTo(0.8);
  });
});
