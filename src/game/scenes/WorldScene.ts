import Phaser from "phaser";
import { COMBAT_COLORS, hex } from "@/config/palette";
import { bridge, type InventoryView } from "@/bridge/events";
import { toGameMap } from "@/content/maps";
import { content } from "@/content/registry";
import type { Actor } from "@/core/combat/actor";
import { assistAim } from "@/core/combat/aim";
import { STAMINA } from "@/core/combat/moves";
import type { Command } from "@/core/sim/intent";
import { arenaLocked, chestTarget, createSim, populateMap, SIM_DT, spawnPlayer, stepSim, talkTarget, type SimState } from "@/core/sim/state";
import type { ZoneContent } from "@/content/schemas/zone";
import { xpToNext } from "@/core/progression/level";
import { findSkill, getEnemy, SKILL_SLOTS } from "@/core/combat/defs";
import { skillBlocker, skillCooldown, ultimateFill, unlockedSkills } from "@/core/combat/skills";
import { talentPointsLeft } from "@/core/progression/talents";
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
import { mapMarkers, minimapLayout } from "../world/minimap";
import type { WorldStart } from "./PreloadScene";
import { capturePlayer, captureSave, restorePlayer } from "@/core/save/save";
import { applyRules } from "@/core/sim/rules";
import { isSolidCell } from "@/core/world/map";
import { writeSave } from "@/store/saves";

const LOCAL_ID = "p1";
const START_MAP = "cinderhold";
/** Never simulate more than this many steps per frame (tab was in background, slow device). */
const MAX_STEPS_PER_FRAME = 5;
const VITALS_INTERVAL = 66;
/** Minimap markers refresh (ms). */
const MARKERS_INTERVAL = 120;
/** Autosave every this many ms of play while out of combat. */
const AUTOSAVE_MS = 60_000;
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
  private objectImages: Phaser.GameObjects.Image[] = [];
  private markersAt = 0;
  private bossKey = "";
  /** Seconds played in this save (counts only unpaused frames). */
  private playtime = 0;
  private lastSave = 0;
  /** Something worth keeping happened (level-up, talent, quest): save at the end of this frame. */
  private saveSoon = false;

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
    this.bossKey = "";
    this.playtime = data.playtime ?? 0;
    this.saveSoon = false;

    this.map = toGameMap(content.maps.get(data.map ?? START_MAP));
    this.zone = content.zones.get(this.map.zone);
    this.tilemap = renderMap(this, this.map);
    this.objectImages = renderObjects(this, this.map);

    this.sim = createSim(this.map.id, (Math.random() * 2 ** 32) >>> 0, data.time ?? START_TIME, data.rules);
    const playerSpawns = this.map.spawns.filter((s) => s.kind === "player");
    let spawn: { x: number; y: number } = playerSpawns.find((s) => s.id === data.arrive) ?? playerSpawns[0] ?? { x: 64, y: 64 };
    // A loaded save resumes where the player stood, if that spot is still walkable.
    const ts = this.map.tileSize;
    if (data.at && data.at.x >= 0 && !isSolidCell(this.map, Math.floor(data.at.x / ts), Math.floor(data.at.y / ts))) spawn = data.at;
    const me = spawnPlayer(this.sim, LOCAL_ID, "characters/male-01-1", spawn.x, spawn.y, data.carry ?? STARTER_GEAR);
    if (data.carry) restorePlayer(me, data.carry);
    populateMap(this.sim, this.map, new Set(me.progress?.cleared ?? []), this.zone.respawn);
    for (const c of this.sim.chests) if (c.opened) this.markChestOpened(c.key);

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

    this.disposers.push(
      bridge.on("ui:quit", () => {
        this.save();
        this.scene.start("title");
      })
    );
    this.disposers.push(bridge.on("ui:save", () => this.save(true)));
    this.disposers.push(
      bridge.on("ui:rules", (rules) => {
        // Solo only for now: in co-op the host's lobby will own the rules.
        if (this.start.mode !== "solo") return;
        applyRules(this.sim, { ...rules, ngPlus: this.sim.rules.ngPlus });
        this.inventoryKey = "";
        this.updateInventory(this.sim.actors[LOCAL_ID]);
        this.save();
      })
    );
    // Leaving the tab / backgrounding the Android app may be the last chance to save.
    const onHide = () => document.visibilityState === "hidden" && this.save();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    this.disposers.push(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    });
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
    bridge.emit("game:minimap", minimapLayout(this.map, this.zone.id));
    this.markersAt = 0;
    // Arriving somewhere (new game, map change, loaded save) is a checkpoint.
    this.save();
  }

  /**
   * Writes the local player to the run's save slot. Skipped without a slot (multiplayer client),
   * while dead, or mid-transition. Returns whether a save was written.
   */
  private save(manual = false): boolean {
    const me = this.sim?.actors[LOCAL_ID];
    if (this.start.slot === undefined || !me || me.action.kind === "dead" || this.travelling) return false;
    this.lastSave = this.time.now;
    this.saveSoon = false;
    const ok = writeSave(this.start.slot, captureSave(me, this.map.id, this.sim.time, this.playtime, Date.now(), this.sim.rules));
    bridge.emit("game:saved", { ok, manual });
    return ok;
  }

  /** An opened chest is drawn dimmed (no open-lid frame in the art yet). */
  private markChestOpened(key: string): void {
    const i = this.map.objects.findIndex((o) => o.chest?.key === key);
    this.objectImages[i]?.setTint(hex(COMBAT_COLORS.chestOpened));
  }

  /** Checkpoint events and the periodic out-of-combat autosave. */
  private autosave(events: readonly { type: string; id?: string; change?: string; chest?: string }[]): void {
    for (const ev of events) {
      // Any party member's chest is empty for everyone (and recorded in every player's progress).
      if (ev.type === "chest" && ev.chest) {
        this.markChestOpened(ev.chest);
        this.saveSoon = true;
      }
      if (ev.id !== LOCAL_ID) continue;
      if ( ev.type === "level-up" || ev.type === "mastery-up" || ev.type === "talent" || ev.type === "loadout" || (ev.type === "quest" && ev.change === "done")) this.saveSoon = true;
    }
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
      this.autosave(this.sim.events);
      this.accumulator -= SIM_DT;
      for (const ev of this.sim.events) {
        if (ev.type === "pickup" && ev.actor === LOCAL_ID) bridge.emit("game:loot", { item: ev.item, count: ev.count });
        if (ev.type === "portal" && ev.id === LOCAL_ID) return this.travel(ev.to, ev.arrive);
        if (ev.type === "quest" && ev.id === LOCAL_ID) bridge.emit("game:quest", { quest: ev.quest, change: ev.change });
        if (ev.type === "skill-unlocked" && ev.id === LOCAL_ID) bridge.emit("game:skill-unlocked", { skill: ev.skill });
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
    this.updateBoss();
    this.updateDebug();
    if (this.time.now >= this.markersAt) {
      this.markersAt = this.time.now + MARKERS_INTERVAL;
      bridge.emit("game:markers", mapMarkers(this.sim, this.map.tileSize, LOCAL_ID));
    }

    this.playtime += delta / 1000;
    const calm = this.musicState === "explore";
    if (this.saveSoon || (calm && this.time.now - this.lastSave > AUTOSAVE_MS)) this.save();
  }

  /** Fade out and restart the scene on the target map, carrying the local player state and the clock. */
  private travel(to: string, arrive: string): void {
    if (this.travelling) return;
    this.travelling = true;
    const me = this.sim.actors[LOCAL_ID];
    const carry = me?.progress ? capturePlayer(me) : undefined;
    audio.sfx("portal", { volume: 0.5 });
    this.cameras.main.fadeOut(350, 7, 6, 11);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.restart({ mode: this.start.mode, map: to, arrive, carry, time: this.sim.time, slot: this.start.slot, playtime: this.playtime, rules: this.sim.rules } satisfies WorldStart)
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
    this.autosave(this.sim.events);
    if (this.saveSoon) this.save();
    for (const ev of this.sim.events) {
      if (ev.type === "quest" && ev.id === LOCAL_ID) bridge.emit("game:quest", { quest: ev.quest, change: ev.change });
      if (ev.type === "skill-unlocked" && ev.id === LOCAL_ID) bridge.emit("game:skill-unlocked", { skill: ev.skill });
    }
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
    const alive = me && me.action.kind !== "dead";
    const npc = alive ? talkTarget(this.sim, me) : null;
    const chest = alive && !npc ? chestTarget(this.sim, me) : null;
    const prompt = npc ? ({ kind: "talk", npc: npc.type } as const) : chest ? ({ kind: "chest" } as const) : null;
    const key = prompt ? JSON.stringify(prompt) : "";
    if (key === this.promptKey) return;
    this.promptKey = key;
    bridge.emit("game:prompt", prompt);
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
      level: me.level,
      talents: { ...me.talents },
      talentPoints: talentPointsLeft(me),
      loadout: { ...me.loadout },
      unlockedSkills: unlockedSkills(me),
      rules: this.sim.rules,
      mastery: { ...me.mastery },
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
    else if (intent.pressed.includes("talents")) bridge.emit("game:menu", "talents");
    else if (intent.pressed.includes("map")) bridge.emit("game:menu", "map");
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
      const big = a.look.startsWith("bosses/");
      this.views.set(a.id, new ActorView(this, a.look, a.x, a.y, a.kind === "enemy" && !big, big));
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
    const state = this.bossFight() ? "boss" : me.hp > 0 && me.hp < me.stats.maxHp * 0.25 ? "danger-low-hp" : hunted ? "combat" : "explore";
    if (state === this.musicState) return;
    this.musicState = state;
    audio.music.setState(state);
  }

  /** The living boss engaged with the local player, if any. */
  private bossFight(): Actor | undefined {
    return Object.values(this.sim.actors).find((a) => a.kind === "enemy" && a.action.kind !== "dead" && a.ai?.target === LOCAL_ID && !!getEnemy(a.type).boss);
  }

  private updateBoss(): void {
    const b = this.bossFight();
    const def = b && getEnemy(b.type).boss;
    const view = b && def ? { enemy: b.type, hp: b.hp, maxHp: b.stats.maxHp, phase: b.ai!.phase, thresholds: def.phases.slice(1).map((p) => p.below), sealed: arenaLocked(this.sim) } : null;
    const key = view ? `${view.enemy}|${view.hp}|${view.phase}|${view.sealed}` : "";
    if (key === this.bossKey) return;
    this.bossKey = key;
    bridge.emit("game:boss", view);
  }

  private updateVitals(me: Actor | undefined): void {
    if (!me || this.time.now - this.lastVitals < VITALS_INTERVAL) return;
    this.lastVitals = this.time.now;
    const vitals = { hp: me.hp, maxHp: me.stats.maxHp, stamina: Math.round(me.stamina), maxStamina: STAMINA.max, dead: me.action.kind === "dead", gold: me.bag.gold ?? 0, statuses: me.statuses.map((s) => s.id), level: me.level, xp: me.xp, xpNext: xpToNext(me.level), skills: skillViews(me), ult: ultimateFill(me) };
    const key = `${vitals.hp}|${vitals.stamina}|${vitals.dead}|${vitals.gold}|${vitals.statuses.join()}|${vitals.level}|${vitals.xp}|${vitals.skills.map((s) => `${s.id}:${s.cd.toFixed(1)}:${s.ready}`).join()}|${vitals.ult.toFixed(2)}`;
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

/** HUD view of the skill slots: equipped skill, cooldown left / total, usable now. */
function skillViews(me: Actor) {
  return SKILL_SLOTS.map((slot) => {
    const id = me.loadout[slot];
    const def = id ? findSkill(id) : undefined;
    return { slot, id: def?.id ?? null, cd: def ? skillCooldown(me, def.id) : 0, cdMax: def?.cooldown ?? 0, ready: skillBlocker(me, slot) === null };
  });
}
