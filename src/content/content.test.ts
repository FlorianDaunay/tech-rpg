import { describe, expect, it } from "vitest";
import { toGameMap } from "./maps";
import { content, validateAllContent } from "./registry";

describe("content", () => {
  it("every content file matches its schema, ids are unique", () => {
    expect(validateAllContent()).toEqual([]);
  });

  it("every map has a player spawn on a walkable cell", () => {
    for (const m of content.maps.all()) {
      const map = toGameMap(m);
      const spawn = map.spawns.find((s) => s.kind === "player");
      expect(spawn, `${m.id} has no player spawn`).toBeDefined();
      const cx = Math.floor(spawn!.x / map.tileSize);
      const cy = Math.floor(spawn!.y / map.tileSize);
      expect(map.solid[cy * map.width + cx], `${m.id} spawn is inside a wall`).toBe(0);
    }
  });
});
