import Phaser from "phaser";
import { bridge } from "@/bridge/events";
import { toGameMap } from "@/content/maps";
import { content } from "@/content/registry";
import type { Actor } from "@/core/combat/actor";
import { assistAim } from "@/core/combat/aim";
import { STAMINA } from "@/core/combat/moves";
import { createSim, SIM_DT, spawnEnemy, spawnPlayer, stepSim, type SimState } from "@/core/sim/state";
import type { GameMap } from "@/core/world/map";
import { useInputDevice } from "@/store/input";
import { useSettings } from "@/store/settings";
import { audio } from "../audio";
import { bindPixelZoom } from "../camera";
import { ActorView } from "../entities/ActorView";
import { CombatFx } from "../fx/CombatFx";
import { InputRouter } from "../input/InputRouter";
import { renderMap, renderObjects } from "../world/renderMap";
import type { WorldStart } from "./PreloadScene";

const LOCAL_ID = "p1";
const START_MAP = "test-grove";
/** Never simulate more than this many steps per frame (tab was in background, slow device). */
const MAX_STEPS_PER_FRAME = 5;
const VITALS_INTERVAL = 66;
/** Until the inventory exists (M7): what a new initiate carries. */
const STARTER_GEAR = { weapon: "initiate-blade", shield: "initiate-buckler" };

/**
 * The gameplay scene: owns the fixed-step simulation loop and renders sim state.
 * Rules live in src/core; this class wires input → sim → views + fx.
 */
export class WorldScene extends Phaser.Scene {
  private map!: GameMap;
  private sim!: SimState;
  private input2!: InputRouter;
  private fx!: CombatFx;
  private views = new Map<string, ActorView>();
  private prev = new Map<string, { x: number; y: number }>();
  private accumulator = 0;
  /** Hit-stop: real ms left during which the sim is frozen. */
  private freezeMs = 0;
  private slowMo = { scale: 1, ms: 0 };
  private lastDebug = 0;
  private lastVitals = 0;
  private vitalsKey = "";
  private musicState = "";
  private disposers: (() => void)[] = [];

  constructor() {
    super("world");
  }

  create(_data: WorldStart): void {
    this.views.clear();
    this.prev.clear();
    this.accumulator = 0;
    this.freezeMs = 0;
    this.slowMo = { scale: 1, ms: 0 };
    this.musicState = "";
    this.vitalsKey = "";

    this.map = toGameMap(content.maps.get(START_MAP));
    renderMap(this, this.map);
    renderObjects(this, this.map);

    this.sim = createSim(this.map.id, (Math.random() * 2 ** 32) >>> 0);
    const spawn = this.map.spawns.find((s) => s.kind === "player") ?? { x: 64, y: 64 };
    spawnPlayer(this.sim, LOCAL_ID, "characters/male-01-1", spawn.x, spawn.y, STARTER_GEAR);
    for (const s of this.map.spawns) if (s.kind === "enemy" && s.ref) spawnEnemy(this.sim, s.ref, s.x, s.y);

    this.fx = new CombatFx({
      scene: this,
      localId: LOCAL_ID,
      actor: (id) => this.sim.actors[id],
      flash: (id) => this.views.get(id)?.flash(),
      hitStop: (ms) => (this.freezeMs = Math.max(this.freezeMs, ms)),
      slowMo: (scale, ms) => (this.slowMo = { scale, ms }),
    });
    this.syncViews();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.width * this.map.tileSize, this.map.height * this.map.tileSize);
    cam.startFollow(this.views.get(LOCAL_ID)!.sprite, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    this.disposers.push(bindPixelZoom(this, cam));

    this.input2 = new InputRouter(this.game.canvas);
    this.disposers.push(() => this.input2.destroy());

    audio.music.setZone(this.map.zone);
    audio.music.setState("explore");
    audio.ambience.set(this.map.zone);

    this.disposers.push(bridge.on("ui:quit", () => this.scene.start("title")));
    this.events.once("shutdown", () => this.cleanup());
    this.cameras.main.fadeIn(400, 7, 6, 11);
    bridge.emit("game:world-ready", { mapId: this.map.id });
  }

  override update(_time: number, delta: number): void {
    // Hit-stop freezes the sim (the frame holds); slow-mo scales sim time after a perfect parry.
    let simDelta = delta;
    if (this.freezeMs > 0) {
      const frozen = Math.min(this.freezeMs, delta);
      this.freezeMs -= frozen;
      simDelta -= frozen;
    }
    if (this.slowMo.ms > 0) {
      this.slowMo.ms -= delta;
      simDelta *= this.slowMo.scale;
    }
    this.anims.globalTimeScale = this.freezeMs > 0 ? 0 : this.slowMo.ms > 0 ? this.slowMo.scale : 1;

    this.accumulator = Math.min(this.accumulator + simDelta / 1000, SIM_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= SIM_DT) {
      for (const a of Object.values(this.sim.actors)) this.prev.set(a.id, { x: a.x, y: a.y });
      stepSim(this.sim, this.map, { [LOCAL_ID]: this.localIntent() });
      this.fx.handle(this.sim.events);
      this.accumulator -= SIM_DT;
    }
    this.syncViews();

    // Render between the last two sim states so motion is smooth at any refresh rate.
    const alpha = this.freezeMs > 0 ? 1 : this.accumulator / SIM_DT;
    for (const a of Object.values(this.sim.actors)) {
      const prev = this.prev.get(a.id) ?? a;
      this.views.get(a.id)?.update(prev.x + (a.x - prev.x) * alpha, prev.y + (a.y - prev.y) * alpha, a);
    }
    this.fx.syncProjectiles(this.sim.projectiles);
    this.fx.syncPickups(this.sim.pickups);
    this.fx.syncCharges();

    const me = this.sim.actors[LOCAL_ID];
    if (me) audio.setListener(me.x, me.y);
    this.updateAimOrigin();
    this.updateMusic(me);
    this.updateVitals(me);
    this.updateDebug();
  }

  private localIntent() {
    const intent = this.input2.sample();
    const me = this.sim.actors[LOCAL_ID];
    const device = useInputDevice.getState().device;
    // Aim assist for touch and stick-less gamepad aiming: snap attacks onto the nearest foe in front.
    if (me && !intent.aim && device !== "keyboard" && useSettings.getState().aimAssist && intent.pressed.some((p) => p === "attack" || p === "heavy")) {
      const aim = assistAim({ ...me, aim: intent.move.x || intent.move.y ? intent.move : me.aim }, Object.values(this.sim.actors));
      if (aim) intent.aim = aim;
    }
    return intent;
  }

  /** Creates views for new actors, removes views of despawned ones. */
  private syncViews(): void {
    for (const a of Object.values(this.sim.actors)) {
      if (this.views.has(a.id)) continue;
      this.views.set(a.id, new ActorView(this, a.look, a.x, a.y, a.kind === "enemy"));
      this.prev.set(a.id, { x: a.x, y: a.y });
    }
    for (const [id, view] of this.views) {
      if (this.sim.actors[id]) continue;
      view.destroy();
      this.views.delete(id);
      this.prev.delete(id);
    }
  }

  /** Adaptive music: combat while something hunts the player, danger when nearly dead. */
  private updateMusic(me: Actor | undefined): void {
    if (!me) return;
    const hunted = Object.values(this.sim.actors).some((a) => a.ai?.target === LOCAL_ID);
    const state = me.hp > 0 && me.hp < me.stats.maxHp * 0.25 ? "danger-low-hp" : hunted ? "combat" : "explore";
    if (state === this.musicState) return;
    this.musicState = state;
    audio.music.setState(state);
  }

  private updateVitals(me: Actor | undefined): void {
    if (!me || this.time.now - this.lastVitals < VITALS_INTERVAL) return;
    this.lastVitals = this.time.now;
    const vitals = { hp: me.hp, maxHp: me.stats.maxHp, stamina: Math.round(me.stamina), maxStamina: STAMINA.max, dead: me.action.kind === "dead", gold: me.bag.gold ?? 0, statuses: me.statuses.map((s) => s.id) };
    const key = `${vitals.hp}|${vitals.stamina}|${vitals.dead}|${vitals.gold}|${vitals.statuses.join()}`;
    if (key === this.vitalsKey) return;
    this.vitalsKey = key;
    bridge.emit("game:vitals", vitals);
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
    const p = this.sim.actors[LOCAL_ID];
    if (!p) return;
    bridge.emit(
      "game:debug",
      `fps ${this.game.loop.actualFps.toFixed(0)} · tick ${this.sim.tick} · actors ${Object.keys(this.sim.actors).length}
` +
        `pos ${p.x.toFixed(1)},${p.y.toFixed(1)} · ${p.action.kind} · hp ${p.hp} · st ${p.stamina.toFixed(0)}`
    );
  }

  private cleanup(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.fx.destroy();
    this.views.forEach((v) => v.destroy());
    this.views.clear();
    this.anims.globalTimeScale = 1;
    audio.music.setState("explore");
    audio.ambience.set(null);
  }
}
