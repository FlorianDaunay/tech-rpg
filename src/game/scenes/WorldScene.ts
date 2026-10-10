import Phaser from "phaser";
import { bridge, type InventoryView } from "@/bridge/events";
import { toGameMap } from "@/content/maps";
import { content } from "@/content/registry";
import type { Actor } from "@/core/combat/actor";
import { assistAim } from "@/core/combat/aim";
import { STAMINA } from "@/core/combat/moves";
import type { Command } from "@/core/sim/intent";
import { createSim, SIM_DT, spawnEnemy, spawnNpc, spawnPlayer, stepSim, talkTarget, type SimState } from "@/core/sim/state";
import type { ZoneContent } from "@/content/schemas/zone";
import { equip } from "@/core/combat/equipment";
import { darknessAt, START_TIME } from "@/core/world/daynight";
import type { GameMap } from "@/core/world/map";
import { useInputDevice } from "@/store/input";
import { useSettings } from "@/store/settings";
import { audio } from "../audio";
import { bindPixelZoom } from "../camera";
import { ActorView } from "../entities/ActorView";
import { CombatFx } from "../fx/CombatFx";
import { InputRouter } from "../input/InputRouter";
import { Lighting } from "../systems/Lighting";
import { Weather } from "../systems/Weather";
import { renderMap, renderObjects } from "../world/renderMap";
import type { PlayerCarry, WorldStart } from "./PreloadScene";

const LOCAL_ID = "p1";
const START_MAP = "cinderhold";
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
  private zone!: ZoneContent;
  private start!: WorldStart;
  private lighting!: Lighting;
  private weather!: Weather;
  /** A portal was taken: the scene is fading out to the next map. */
  private travelling = false;
  /** Made with scene.make (not on the display list): must be destroyed by hand on shutdown. */
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
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
  /** Solo: a menu is open, the simulation is frozen. */
  private paused = false;
  /** Menu commands waiting for the next local Intent. */
  private commands: Command[] = [];
  private inventoryKey = "";
  private promptKey = "";
  private disposers: (() => void)[] = [];

  constructor() {
    super("world");
  }

  create(data: WorldStart): void {
    this.start = data;
    this.travelling = false;
    this.views.clear();
    this.prev.clear();
    this.accumulator = 0;
    this.freezeMs = 0;
    this.slowMo = { scale: 1, ms: 0 };
    this.musicState = "";
    this.vitalsKey = "";
    this.paused = false;
    this.commands = [];
    this.inventoryKey = "";
    this.promptKey = "";

    this.map = toGameMap(content.maps.get(data.map ?? START_MAP));
    this.zone = content.zones.get(this.map.zone);
    this.tilemap = renderMap(this, this.map);
    renderObjects(this, this.map);

    this.sim = createSim(this.map.id, (Math.random() * 2 ** 32) >>> 0, data.time ?? START_TIME);
    const playerSpawns = this.map.spawns.filter((s) => s.kind === "player");
    const spawn = playerSpawns.find((s) => s.id === data.arrive) ?? playerSpawns[0] ?? { x: 64, y: 64 };
    const me = spawnPlayer(this.sim, LOCAL_ID, "characters/male-01-1", spawn.x, spawn.y, data.carry ?? STARTER_GEAR);
    if (data.carry) {
      equip(me, data.carry.weapon, data.carry.shield);
      Object.assign(me, { hp: Math.max(1, Math.min(me.stats.maxHp, data.carry.hp)), stamina: data.carry.stamina, bag: { ...data.carry.bag }, progress: structuredClone(data.carry.progress) });
    }
    for (const s of this.map.spawns) {
      if (s.kind === "enemy" && s.ref) spawnEnemy(this.sim, s.ref, s.x, s.y);
      else if (s.kind === "npc" && s.ref) spawnNpc(this.sim, s.ref, s.x, s.y);
    }

    this.fx = new CombatFx({
      scene: this,
      localId: LOCAL_ID,
      actor: (id) => this.sim.actors[id],
      flash: (id) => this.views.get(id)?.flash(),
      hitStop: (ms) => (this.freezeMs = Math.max(this.freezeMs, ms)),
      slowMo: (scale, ms) => (this.slowMo = { scale, ms }),
      light: (x, y, radius, color) => this.lighting.flash(x, y, radius, color),
    });
    this.lighting = new Lighting(this, this.map.lights, this.zone.lighting.playerLight);
    this.weather = new Weather(this, this.zone.weather);
    this.syncViews();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.width * this.map.tileSize, this.map.height * this.map.tileSize);
    cam.startFollow(this.views.get(LOCAL_ID)!.sprite, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    this.disposers.push(bindPixelZoom(this, cam));

    this.input2 = new InputRouter(this.game.canvas);
    this.disposers.push(() => this.input2.destroy());

    audio.music.setZone(this.zone.music ?? this.zone.id);
    audio.music.setState("explore");
    audio.ambience.set(this.zone.ambience ?? this.zone.id);

    this.disposers.push(bridge.on("ui:quit", () => this.scene.start("title")));
    this.disposers.push(bridge.on("ui:command", (c) => this.commands.push(c)));
    this.disposers.push(
      bridge.on("ui:pause", (paused) => {
        this.paused = paused;
        audio.duck(paused ? 0.55 : 0, 250);
        if (!paused) this.input2.flush();
        // Commands from the menu (equip, drink) apply right away even while paused.
        if (paused) this.applyMenuCommands();
      })
    );
    this.events.once("shutdown", () => this.cleanup());
    this.cameras.main.fadeIn(400, 7, 6, 11);
    bridge.emit("game:world-ready", { mapId: this.map.id });
    bridge.emit("game:zone", { zone: this.zone.id, map: this.map.id });
  }

  override update(_time: number, delta: number): void {
    if (this.travelling) return;
    if (this.paused) {
      this.applyMenuCommands();
      this.updateVitals(this.sim.actors[LOCAL_ID]);
      return;
    }
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
      for (const ev of this.sim.events) {
        if (ev.type === "pickup" && ev.actor === LOCAL_ID) bridge.emit("game:loot", { item: ev.item, count: ev.count });
        if (ev.type === "portal" && ev.id === LOCAL_ID) return this.travel(ev.to, ev.arrive);
        if (ev.type === "quest" && ev.id === LOCAL_ID) bridge.emit("game:quest", { quest: ev.quest, change: ev.change });
        if (ev.type === "talk" && ev.id === LOCAL_ID) {
          // The dialogue reads progress for its conditions: publish it first (talk objectives just moved).
          this.updateInventory(this.sim.actors[LOCAL_ID]);
          this.turnToward(ev.actor);
          bridge.emit("game:dialogue", { npc: ev.npc, dialogue: ev.dialogue });
        }
      }
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
    const meView = this.views.get(LOCAL_ID)?.sprite;
    this.lighting.setAmbient(this.zone.lighting.ambient, darknessAt(this.sim.time, this.zone.lighting.darkness));
    this.lighting.update(meView && me && me.action.kind !== "dead" ? { x: meView.x, y: meView.y + 14 } : null, this.sim.projectiles);
    this.weather.update();
    this.updateAimOrigin();
    this.updateMusic(me);
    this.updateVitals(me);
    this.updateInventory(me);
    this.updatePrompt(me);
    this.updateDebug();
  }

  /** Fade out and restart the scene on the target map, carrying the local player state and the clock. */
  private travel(to: string, arrive: string): void {
    if (this.travelling) return;
    this.travelling = true;
    const me = this.sim.actors[LOCAL_ID];
    const carry: PlayerCarry | undefined = me?.progress ? { hp: me.hp, stamina: me.stamina, bag: { ...me.bag }, weapon: me.weapon, shield: me.shield, progress: structuredClone(me.progress) } : undefined;
    audio.sfx("portal", { volume: 0.5 });
    this.cameras.main.fadeOut(350, 7, 6, 11);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.restart({ mode: this.start.mode, map: to, arrive, carry, time: this.sim.time } satisfies WorldStart)
    );
  }

  /**
   * While paused the sim doesn't step, but equip/use must still feel instant: run one zero-input
   * step that carries only the commands. (Online, commands just ride the next Intent.)
   */
  private applyMenuCommands(): void {
    if (!this.commands.length) return;
    const commands = this.commands.splice(0);
    const me = this.sim.actors[LOCAL_ID];
    if (!me) return;
    stepSim(this.sim, this.map, { [LOCAL_ID]: { move: { x: 0, y: 0 }, aim: null, held: [], pressed: [], commands } });
    this.fx.handle(this.sim.events);
    for (const ev of this.sim.events) if (ev.type === "quest" && ev.id === LOCAL_ID) bridge.emit("game:quest", { quest: ev.quest, change: ev.change });
    this.updateInventory(me);
  }

  /** NPCs face the player who talks to them. */
  private turnToward(npcId: string): void {
    const npc = this.sim.actors[npcId];
    const me = this.sim.actors[LOCAL_ID];
    if (npc && me) npc.aim = { x: me.x - npc.x, y: me.y - npc.y };
  }

  /** "Talk" prompt near an NPC (HUD shows the key, or a tappable button on touch). */
  private updatePrompt(me: Actor | undefined): void {
    const npc = me && me.action.kind !== "dead" ? talkTarget(this.sim, me) : null;
    const key = npc?.type ?? "";
    if (key === this.promptKey) return;
    this.promptKey = key;
    bridge.emit("game:prompt", npc ? { kind: "talk", npc: npc.type } : null);
  }

  private updateInventory(me: Actor | undefined): void {
    if (!me?.progress) return;
    const view: InventoryView = {
      bag: { ...me.bag },
      weapon: me.weapon,
      shield: me.shield,
      hp: me.hp,
      maxHp: me.stats.maxHp,
      stats: { power: me.stats.power, defense: me.stats.defense, critChance: me.stats.critChance, critMultiplier: me.stats.critMultiplier, speed: me.stats.speed },
      progress: structuredClone(me.progress),
    };
    const key = JSON.stringify(view);
    if (key === this.inventoryKey) return;
    this.inventoryKey = key;
    bridge.emit("game:inventory", view);
  }

  private localIntent() {
    const intent = this.input2.sample();
    // Menu keys open React menus instead of reaching the sim.
    if (intent.pressed.includes("pause")) bridge.emit("game:menu", "pause");
    else if (intent.pressed.includes("inventory")) bridge.emit("game:menu", "inventory");
    if (this.commands.length) intent.commands = this.commands.splice(0);
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
    this.lighting.destroy();
    this.weather.destroy();
    this.tilemap?.destroy();
    this.tilemap = null;
    this.views.forEach((v) => v.destroy());
    this.views.clear();
    this.anims.globalTimeScale = 1;
    audio.music.setState("explore");
    audio.ambience.set(null);
  }
}
