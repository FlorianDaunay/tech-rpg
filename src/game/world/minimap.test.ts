import { describe, expect, it } from "vitest";
import { MINIMAP_COLORS } from "@/config/palette";
import { toGameMap } from "@/content/maps";
import { content } from "@/content/registry";
import { minimapLayout } from "./minimap";

describe("minimap layout", () => {
  it("every map gets one known colour per cell and its exits", () => {
    for (const m of content.maps.all()) {
      const map = toGameMap(m);
      const layout = minimapLayout(map, map.zone);
      expect(layout.cells).toHaveLength(map.width * map.height);
      expect(Math.max(...layout.cells)).toBeLessThan(layout.palette.length);
      expect(layout.portals).toHaveLength(map.portals.length);
    }
  });

  it("water and paths keep their own colours", () => {
    const layout = minimapLayout(toGameMap(content.maps.get("whispering-wilds")), "whispering-wilds");
    const used = new Set(Array.from(layout.cells, (i) => layout.palette[i]));
    expect(used.has(MINIMAP_COLORS.tiles["dirt-path"])).toBe(true);
    expect(used.has(MINIMAP_COLORS.tiles["water-shore"])).toBe(true);
  });
});
