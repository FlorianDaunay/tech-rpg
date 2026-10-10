import Phaser from "phaser";
import { bridge } from "@/bridge/events";
import { toGameMap } from "@/content/maps";
import { content } from "@/content/registry";
import { createPlayer, SIM_DT, stepSim, type SimState } from "@/core/sim/state";
import type { GameMap } from "@/core/world/map";
import { useSettings } from "@/store/settings";
import { bindPixelZoom } from "../camera";
import { ActorView } from "../entities/ActorView";
import { InputRouter } from "../input/InputRouter";
import { renderMap, renderObjects } from "../world/renderMap";
import type { WorldStart } from "./PreloadScene";

const LOCAL_ID = "p1";
const START_MAP = "test-grove";
/** Never simulate more than this many steps per frame (tab was in background, slow device). */
const MAX_STEPS_PER_FRAME = 5;

/**
 * The gameplay scene: owns the fixed-step simulation loop and renders sim state.
 * Rules live in src/core; this class wires input → sim → views.
 */
export class WorldScene extends Phaser.Scene {
  private map!: GameMap;
  private sim!: SimState;
  private input2!: InputRouter;
  private views = new Map<string, ActorView>();
  private prev = new Map<string, { x: number; y: number }>();
  private accumulator = 0;
  private lastDebug = 0;
  private disposers: (() => void)[] = [];

  constructor() {
    super("world");
  }

  create(_data: WorldStart): void {
    this.map = toGameMap(content.maps.get(START_MAP));
    renderMap(this, this.map);
    renderObjects(this, this.map);

    const spawn = this.map.spawns.find((s) => s.kind === "player") ?? { x: 64, y: 64 };
    this.sim = { tick: 0, mapId: this.map.id, players: { [LOCAL_ID]: createPlayer(LOCAL_ID, "characters/male-01-1", spawn.x, spawn.y) } };

    for (const p of Object.values(this.sim.players)) {
      this.views.set(p.id, new ActorView(this, p.look, p.x, p.y));
      this.prev.set(p.id, { x: p.x, y: p.y });
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.width * this.map.tileSize, this.map.height * this.map.tileSize);
    cam.startFollow(this.views.get(LOCAL_ID)!.sprite, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    this.disposers.push(bindPixelZoom(this, cam));

    this.input2 = new InputRouter(this.game.canvas);
    this.disposers.push(() => this.input2.destroy());

    this.disposers.push(bridge.on("ui:quit", () => this.scene.start("title")));
    this.events.once("shutdown", () => this.cleanup());
    this.cameras.main.fadeIn(400, 7, 6, 11);
    bridge.emit("game:world-ready", { mapId: this.map.id });
  }

  override update(_time: number, delta: number): void {
    this.accumulator = Math.min(this.accumulator + delta / 1000, SIM_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= SIM_DT) {
      for (const p of Object.values(this.sim.players)) this.prev.set(p.id, { x: p.x, y: p.y });
      stepSim(this.sim, this.map, { [LOCAL_ID]: this.input2.sample() });
      this.accumulator -= SIM_DT;
    }
    // Render between the last two sim states so motion is smooth at any refresh rate.
    const alpha = this.accumulator / SIM_DT;
    for (const p of Object.values(this.sim.players)) {
      const prev = this.prev.get(p.id) ?? p;
      const x = prev.x + (p.x - prev.x) * alpha;
      const y = prev.y + (p.y - prev.y) * alpha;
      this.views.get(p.id)?.update(x, y, p.facing, p.moving);
    }
    this.updateAimOrigin();
    this.updateDebug();
  }

  private updateAimOrigin(): void {
    const sprite = this.views.get(LOCAL_ID)?.sprite;
    if (!sprite) return;
    const cam = this.cameras.main;
    // World → screen (CSS px): Phaser RESIZE mode keeps canvas CSS size = game size.
    this.input2.setAimOrigin((sprite.x - cam.worldView.x) * cam.zoom, (sprite.y - cam.worldView.y) * cam.zoom);
  }

  /** Debug info goes to the HTML HUD (crisp, not affected by camera zoom), at 4 Hz. */
  private updateDebug(): void {
    if (!useSettings.getState().showFps || this.time.now - this.lastDebug < 250) return;
    this.lastDebug = this.time.now;
    const p = this.sim.players[LOCAL_ID]!;
    bridge.emit(
      "game:debug",
      `fps ${this.game.loop.actualFps.toFixed(0)} · tick ${this.sim.tick}
` +
        `pos ${p.x.toFixed(1)},${p.y.toFixed(1)} · speed ${Math.hypot(p.vx, p.vy).toFixed(0)} · ${p.facing}`
    );
  }

  private cleanup(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.views.forEach((v) => v.destroy());
    this.views.clear();
  }
}
