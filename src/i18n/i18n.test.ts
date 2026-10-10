import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";

describe("i18n", () => {
  it("every English key has a French translation", () => {
    expect(Object.keys(en).filter((k) => !(k in fr))).toEqual([]);
  });

  it("translations keep the same {placeholders}", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    for (const [k, v] of Object.entries(fr)) expect(ph(v!), k).toBe(ph(en[k as keyof typeof en]));
  });
});
