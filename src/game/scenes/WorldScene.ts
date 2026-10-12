import Phaser from "phaser";
import { COMBAT_COLORS, hex } from "@/config/palette";
import { bridge, type InventoryView } from "@/bridge/events";
import { toGameMap } from "@/content/maps";
import { content } from "@/content/registry";
import type { Actor } from "@/core/combat/actor";
import { assistAim } from "@/core/combat/aim";
import { STAMINA } from "@/core/combat/moves";
import type { Command } from "@/core/sim/intent";
import { arenaLocked, chestTarget, createSim, OBJECT_REACH, enablePvp, populateMap, portalWardens, SIM_DT, spawnPlayer, stepSim, talkTarget, type SimState } from "@/core/sim/state";
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
import { ArenaWalls } from "../systems/ArenaWalls";
import { SealBarriers } from "../systems/SealBarriers";
import { Cosmetics } from "../systems/Cosmetics";
import { findCosmetic } from "@/core/economy/defs";
import { findMapContent, resolvePortal } from "@/content/rift";
import { dailySeed, parseRiftMapId } from "@/core/world/riftgen";
import { dangerMods, objectTarget } from "@/core/economy/economy";
import type { Modifiers } from "@/core/combat/modifiers";
import type { WorldStart } from "./PreloadScene";
import { capturePlayer, captureSave, restorePlayer } from "@/core/save/save";
import { applyRules, defaultRules, type WorldRules } from "@/core/sim/rules";
import { isSolidCell } from "@/core/world/map";
import { readSave, writeSave } from "@/store/saves";
import { useNet } from "@/store/net";
import { ClientLink, HostLink, SEAT_LOOKS } from "@/net/links";
import { actorTuple, applySnapshot } from "@/net/codec";
import { predictStep, reconcile } from "@/net/predict";
import { netSim, netSimActive } from "@/net/debug/latency";
import { hostile } from "@/core/combat/pvp";
import { tradePartner, tradeTarget } from "@/core/trade/trade";
import { t } from "@/i18n";
import type { SimEvent } from "@/core/combat/events";
import type { PlayerState } from "@/core/save/save";

/** Solo / host seat. */
const HOST_ID = "p1";
const START_MAP = "cinderhold";
/** Never simulate more than this many steps per frame (tab was in background, slow device). */
const MAX_STEPS_PER_FRAME = 5;
const VITALS_INTERVAL = 66;
/** Party panel + name tags refresh (ms). */
const PARTY_INTERVAL = 250;
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
  private cosmetics!: Cosmetics;
  private weather!: Weather;
  /** A portal was taken: the scene is fading out to the next map. */
  private travelling = false;
  /** Made with scene.make (not on the display list): must be destroyed by hand on shutdown. */
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private sim!: SimState;
  /** My actor id: "p1" solo / host, the seat the host gave me as a client. */
  private localId = HOST_ID;
  /** Multiplayer: host or client side of the session (null in solo). */
  private hostLink: HostLink | null = null;
  private clientLink: ClientLink | null = null;
  /** Client: visual offset left by a reconciliation, faded out so corrections don't snap. */
  private correction = { x: 0, y: 0 };
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
  private partyAt = 0;
  private partyKey = "";
  private pvpKey = "";
  private musicState = "";
  /** Solo: a menu is open, the simulation is frozen. */
  private paused = false;
  /** Menu commands waiting for the next local Intent. */
  private commands: Command[] = [];
  private inventoryKey = "";
  private promptKey = "";
  private disposers: (() => void)[] = [];
  private objectImages: Phaser.GameObjects.Image[] = [];
  /** Set on a generated Rift floor. */
  private rift: ReturnType<typeof parseRiftMapId> = null;
  private markersAt = 0;
  private arenaWalls!: ArenaWalls;
  private seals!: SealBarriers;
  private sealKey = "";
  private bossKey = "";
  /** Seconds played in this save (counts only unpaused frames). */
  private playtime = 0;
  private lastSave = 0;
  /** Something worth keeping happened (level-up, talent, quest): save at the end of this frame. */
  private saveSoon = false;
  /** Rules written into my save: the world's, except as a client (my slot keeps its own difficulty and NG+ cycle). */
  private ownRules: WorldRules | null = null;

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
    this.partyKey = "";
    this.pvpKey = "";
    this.partyAt = 0;
    this.paused = false;
    this.commands = [];
    this.inventoryKey = "";
    this.promptKey = "";
    this.bossKey = "";
    this.playtime = data.playtime ?? 0;
    this.saveSoon = false;
    this.ownRules = data.mode === "client" ? (data.slot !== undefined ? readSave(data.slot)?.rules : undefined) ?? defaultRules() : null;
    this.localId = data.localId ?? HOST_ID;
    this.correction = { x: 0, y: 0 };
    const session = useNet.getState().session;
    this.hostLink = data.mode === "host" && session ? HostLink.of(session) : null;
    this.clientLink = data.mode === "client" && session ? ClientLink.of(session) : null;

    // Authored map, or a generated Rift floor; anything unknown (a stale id) falls back to the hub.
    const mapContent = findMapContent(data.init?.map ?? data.map ?? START_MAP) ?? content.maps.get(START_MAP);
    this.map = toGameMap(mapContent);
    this.rift = parseRiftMapId(this.map.id);
    this.zone = content.zones.get(this.map.zone);
    this.tilemap = renderMap(this, this.map);
    this.objectImages = renderObjects(this, this.map);

    if (this.hostLink && data.resume) {
      // I took over as host: the world goes on from my copy; the old host's character leaves with them.
      this.sim = structuredClone(data.resume);
      this.sim.events = [];
      for (const a of Object.values(this.sim.actors)) if (a.id === data.dropSeat || (a.owner && a.owner === data.dropSeat)) delete this.sim.actors[a.id];
    } else if (this.clientLink && data.init) {
      // Client: the world is the host's; it arrives whole and is kept in sync by snapshots.
      this.sim = structuredClone(data.init.sim);
      this.sim.events = [];
    } else {
      const danger = Math.max(data.carry?.riftDanger ?? 0, ...Object.values(data.party ?? {}).map((p) => p.riftDanger ?? 0));
      this.sim = createSim(this.map.id, (Math.random() * 2 ** 32) >>> 0, data.time ?? START_TIME, data.rules, this.riftDepthMods(danger));
      this.sim.day = dailySeed(Date.now());
      const spawn = this.arrivalPoint(data.arrive, data.at);
      const me = spawnPlayer(this.sim, this.localId, SEAT_LOOKS[this.localId] ?? SEAT_LOOKS.p1!, spawn.x, spawn.y, data.carry ?? STARTER_GEAR);
      if (data.carry) restorePlayer(me, data.carry);
      if (this.hostLink) for (const [seat, player] of Object.entries(data.party ?? {})) this.hostLink.arrivals.set(seat, player);
      // Nothing comes back inside a Rift run: a floor is cleared once.
      populateMap(this.sim, this.map, new Set(me.progress?.cleared ?? []), this.rift ? null : this.zone.respawn);
      if (this.zone.pvp) enablePvp(this.sim, this.map);
    }
    this.arenaWalls = new ArenaWalls(this);
    this.seals = new SealBarriers(this, this.map);
    this.sealKey = "";
    for (const c of this.sim.chests) if (c.opened) this.markChestOpened(c.key);

    this.fx = new CombatFx({
      scene: this,
      localId: this.localId,
      actor: (id) => this.sim.actors[id],
      flash: (id) => this.views.get(id)?.flash(),
      hitStop: (ms) => (this.freezeMs = Math.max(this.freezeMs, ms)),
      slowMo: (scale, ms) => (this.slowMo = { scale, ms }),
      light: (x, y, radius, color) => this.lighting.flash(x, y, radius, color),
    });
    this.lighting = new Lighting(this, this.map.lights, this.zone.lighting.playerLight);
    this.weather = new Weather(this, this.zone.weather);
    this.cosmetics = new Cosmetics(this);
    this.syncViews();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.width * this.map.tileSize, this.map.height * this.map.tileSize);
    cam.startFollow(this.views.get(this.localId)!.sprite, true, 0.12, 0.12);
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
        if (this.start.mode !== "solo") useNet.getState().leave();
        this.scene.start("title");
      })
    );
    this.disposers.push(bridge.on("ui:save", () => this.save(true)));
    this.disposers.push(
      bridge.on("ui:rules", (rules) => {
        // The host owns the world's rules (clients get them with the next full sync).
        if (this.start.mode === "client") return;
        applyRules(this.sim, { ...rules, ngPlus: this.sim.rules.ngPlus });
        this.hostLink?.session.setRules(this.sim.rules);
        this.inventoryKey = "";
        this.updateInventory(this.sim.actors[this.localId]);
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
        // Online the world keeps going while a menu is open (others are still playing).
        this.paused = paused && this.start.mode === "solo";
        audio.duck(paused ? 0.55 : 0, 250);
        if (!paused) this.input2.flush();
        // Commands from the menu (equip, drink) apply right away even while paused.
        if (paused) this.applyMenuCommands();
      })
    );
    if (session && this.clientLink) {
      // Reconnect hellos carry my character as it is now.
      session.playerProvider = () => {
        const me = this.sim.actors[this.localId];
        return me?.progress ? capturePlayer(me) : null;
      };
      this.disposers.push(
        session.on("migrating", () => bridge.emit("game:net", { status: "migrating" })),
        session.on("reconnected", () => bridge.emit("game:net", { status: "reconnected" })),
        session.on("promoted", (oldHost) => {
          // The host left and I take over: resume the world from my copy, as host.
          bridge.emit("game:net", { status: "promoted" });
          this.travelling = true;
          this.scene.restart({ mode: "host", localId: this.localId, map: this.map.id, resume: { ...this.sim, events: [] }, dropSeat: oldHost, slot: this.start.slot, playtime: this.playtime, rules: this.sim.rules } satisfies WorldStart);
        })
      );
    }
    if (this.start.mode !== "solo")
      this.disposers.push(
        useNet.subscribe((n) => {
          if (n.session || this.travelling) return;
          this.save();
          bridge.emit("game:ended", { reason: n.error ?? null });
          this.scene.start("title");
        })
      );
    this.events.once("shutdown", () => this.cleanup());
    this.cameras.main.fadeIn(400, 7, 6, 11);
    bridge.emit("game:world-ready", { mapId: this.map.id });
    bridge.emit("game:zone", { zone: this.zone.id, map: this.map.id, rift: this.rift ? { rift: this.rift.rift, floor: this.rift.floor, floors: content.rifts.find(this.rift.rift)?.floors ?? 1 } : undefined });
    bridge.emit("game:minimap", minimapLayout(this.map, this.zone.id));
    this.markersAt = 0;
    this.hostRoster();
    // Arriving somewhere (new game, map change, loaded save) is a checkpoint.
    this.save();
  }

  /**
   * Writes the local player to the run's save slot. Skipped without a slot (multiplayer client),
   * while dead, or mid-transition. Returns whether a save was written.
   */
  private save(manual = false): boolean {
    const me = this.sim?.actors[this.localId];
    if (this.start.slot === undefined || !me || me.action.kind === "dead" || this.travelling) return false;
    this.lastSave = this.time.now;
    this.saveSoon = false;
    const ok = writeSave(this.start.slot, captureSave(me, this.map.id, this.sim.time, this.playtime, Date.now(), this.ownRules ?? this.sim.rules));
    bridge.emit("game:saved", { ok, manual });
    return ok;
  }

  /** Where players appear: the named arrival spawn (or the saved spot when still walkable). */
  private arrivalPoint(arrive?: string, at?: { x: number; y: number }): { x: number; y: number } {
    const playerSpawns = this.map.spawns.filter((s) => s.kind === "player");
    const spawn = playerSpawns.find((s) => s.id === arrive) ?? playerSpawns[0] ?? { x: 64, y: 64 };
    const ts = this.map.tileSize;
    if (at && at.x >= 0 && !isSolidCell(this.map, Math.floor(at.x / ts), Math.floor(at.y / ts))) return at;
    return { x: spawn.x, y: spawn.y };
  }

  /** Host: players who joined (or crossed a map with the party) enter beside me; leavers go. */
  private hostRoster(): void {
    const link = this.hostLink;
    if (!link) return;
    for (const seat of link.departures) {
      for (const a of Object.values(this.sim.actors)) if (a.id === seat || a.owner === seat) delete this.sim.actors[a.id];
    }
    link.departures.clear();
    if (!link.arrivals.size) return;
    const me = this.sim.actors[this.localId];
    const at = me ?? this.arrivalPoint(this.start.arrive);
    let i = 0;
    for (const [seat, player] of link.arrivals) {
      if (this.sim.actors[seat]) continue; // back after a host migration: already in the world
      const off = [[18, 0], [-18, 0], [0, 18]][i++ % 3]!;
      const a = spawnPlayer(this.sim, seat, SEAT_LOOKS[seat] ?? SEAT_LOOKS.p2!, at.x + off[0]!, at.y + off[1]!, player);
      restorePlayer(a, player);
    }
    link.arrivals.clear();
    // Everyone (new or not) gets the world as it is now, with the newcomers in it.
    for (const p of link.session.room.players) if (p.id !== this.localId && p.connected) link.sendWorld(p.id, { map: this.map.id, arrive: this.start.arrive ?? "", rules: this.sim.rules, sim: { ...this.sim, events: [] } });
    link.session.markStarted();
  }

  /** An opened chest is drawn dimmed (no open-lid frame in the art yet). */
  private markChestOpened(key: string): void {
    const i = this.map.objects.findIndex((o) => o.chest?.key === key);
    this.objectImages[i]?.setTint(hex(COMBAT_COLORS.chestOpened));
  }

  /** Checkpoint events and the periodic out-of-combat autosave. */
  private autosave(events: readonly { type: string; id?: string; change?: string; chest?: string; sealed?: boolean; portal?: string }[]): void {
    for (const ev of events) {
      if (ev.type === "arena" && ev.id) this.arenaWalls.toggle(ev.id, !!ev.sealed);
      if (ev.type === "portal-open" && ev.portal) this.seals.open(ev.portal);
      // Any party member's chest is empty for everyone (and recorded in every player's progress).
      if (ev.type === "chest" && ev.chest) {
        this.markChestOpened(ev.chest);
        this.saveSoon = true;
      }
      if (ev.id !== this.localId) continue;
      if (ev.type === "pet-adopted" || ev.type === "level-up" || ev.type === "mastery-up" || ev.type === "talent" || ev.type === "loadout" || (ev.type === "quest" && ev.change === "done")) this.saveSoon = true;
    }
  }

  override update(_time: number, delta: number): void {
    if (this.travelling) return;
    if (this.clientLink) return this.updateClient(delta);
    if (this.paused) {
      this.applyMenuCommands();
      this.updateVitals(this.sim.actors[this.localId]);
      return;
    }
    // Hit-stop freezes the sim (the frame holds); slow-mo scales sim time after a perfect parry.
    let simDelta = delta;
    // Online, hit-stop and slow-mo are presentation only: the shared world never pauses.
    const solo = this.start.mode === "solo";
    if (this.freezeMs > 0) {
      const frozen = Math.min(this.freezeMs, delta);
      this.freezeMs -= frozen;
      if (solo) simDelta -= frozen;
    }
    if (this.slowMo.ms > 0) {
      this.slowMo.ms -= delta;
      if (solo) simDelta *= this.slowMo.scale;
    }
    this.hostRoster();
    this.anims.globalTimeScale = this.freezeMs > 0 ? 0 : this.slowMo.ms > 0 ? this.slowMo.scale : 1;

    this.accumulator = Math.min(this.accumulator + simDelta / 1000, SIM_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= SIM_DT) {
      for (const a of Object.values(this.sim.actors)) this.prev.set(a.id, { x: a.x, y: a.y });
      const local = this.localIntent();
      const lagMs = this.hostLink && this.sim.pvp ? this.hostLink.lagMs() : undefined;
      stepSim(this.sim, this.map, this.hostLink ? this.hostLink.intents(this.localId, local, this.sim) : { [this.localId]: local }, { lagMs });
      this.hostLink?.afterStep(this.sim, this.time.now);
      this.accumulator -= SIM_DT;
      // The host moves the whole party through whichever portal one of them took.
      const portal = this.sim.events.find((e) => e.type === "portal" && (e.id === this.localId || (this.hostLink && this.sim.actors[e.id]?.kind === "player")));
      this.handleEvents(this.sim.events);
      if (portal?.type === "portal") return this.travel(portal.to, portal.arrive);
    }
    this.syncViews();

    // Render between the last two sim states so motion is smooth at any refresh rate.
    const alpha = this.freezeMs > 0 ? 1 : this.accumulator / SIM_DT;
    for (const a of Object.values(this.sim.actors)) {
      const prev = this.prev.get(a.id) ?? a;
      this.views.get(a.id)?.update(prev.x + (a.x - prev.x) * alpha, prev.y + (a.y - prev.y) * alpha, a);
    }
    this.renderCommon(delta);
  }

  /** Everything drawn or published from the world state each frame (both sides of a session). */
  private renderCommon(delta: number): void {
    this.fx.syncProjectiles(this.sim.projectiles);
    this.fx.syncPickups(this.sim.pickups);
    this.fx.syncCharges();
    this.arenaWalls.update(this.sim.arenas);
    this.seals.update(this.sim.sealed ?? []);

    const me = this.sim.actors[this.localId];
    if (me) audio.setListener(me.x, me.y);
    const meView = this.views.get(this.localId)?.sprite;
    this.lighting.setAmbient(this.zone.lighting.ambient, darknessAt(this.sim.time, this.zone.lighting.darkness));
    this.lighting.update(meView && me && me.action.kind !== "dead" ? { x: meView.x, y: meView.y + 14 } : null, this.sim.projectiles, this.sim.pickups);
    this.weather.update();
    this.cosmetics.update(this.sim.actors, (id) => this.views.get(id)?.sprite ?? null, delta / 1000);
    this.updateAimOrigin();
    this.updateMusic(me);
    this.updateVitals(me);
    this.updateParty();
    this.updateInventory(me);
    this.updatePrompt(me);
    this.updateBoss();
    this.updateDebug();
    if (this.time.now >= this.markersAt) {
      this.markersAt = this.time.now + MARKERS_INTERVAL;
      bridge.emit("game:markers", mapMarkers(this.sim, this.map, this.localId));
      this.updateSeal();
    }

    this.playtime += delta / 1000;
    const calm = this.musicState === "explore";
    if (this.saveSoon || (calm && this.time.now - this.lastSave > AUTOSAVE_MS)) this.save();
  }

  /** What a step's events mean for this player: fx, saves, HUD toasts, dialogue. */
  private handleEvents(events: SimEvent[]): void {
    this.fx.handle(events);
    this.autosave(events);
    for (const ev of events) {
      if (ev.type === "pickup" && ev.actor === this.localId) bridge.emit("game:loot", { item: ev.item, count: ev.count });
      if (ev.type === "quest" && ev.id === this.localId) bridge.emit("game:quest", { quest: ev.quest, change: ev.change });
      if (ev.type === "skill-unlocked" && ev.id === this.localId) bridge.emit("game:skill-unlocked", { skill: ev.skill });
      if (ev.type === "trade" && (ev.trade.from === this.localId || ev.trade.to === this.localId))
        bridge.emit("game:trade", { change: ev.change, trade: ev.trade, me: this.localId, partnerName: this.nameOf(tradePartner(ev.trade, this.localId)), by: ev.by });
      if (ev.type === "pvp-kill") bridge.emit("game:pvp-kill", { killer: ev.killer && this.nameOf(ev.killer), victim: this.nameOf(ev.victim), streak: ev.streak, mine: ev.killer === this.localId, me: ev.victim === this.localId });
      if ((ev.type === "trade-shop" || ev.type === "forged" || ev.type === "built" || ev.type === "danger" || ev.type === "cosmetic" || ev.type === "rest") && ev.id === this.localId) {
        // Spending is worth a save; the menus show the outcome.
        this.saveSoon = true;
        this.updateInventory(this.sim.actors[this.localId]);
        audio.sfx(ECONOMY_SFX[ev.type], { volume: 0.6 });
        bridge.emit("game:economy", ev);
      }
      if (ev.type === "service" && ev.id === this.localId) bridge.emit("game:service", { service: ev.service, ref: ev.ref });
      if (ev.type === "talk" && ev.id === this.localId) {
        // The dialogue reads progress for its conditions: publish it first (talk objectives just moved).
        this.updateInventory(this.sim.actors[this.localId]);
        this.turnToward(ev.actor);
        bridge.emit("game:dialogue", { npc: ev.npc, dialogue: ev.dialogue });
      }
    }
  }

  /**
   * Client frame: predict my own player from my inputs (sent to the host), apply the host's
   * snapshots (others are shown ~100 ms in the past, interpolated), reconcile my position, play the
   * host's events. The host's world package after a map change restarts the scene.
   */
  private updateClient(delta: number): void {
    const link = this.clientLink!;
    if (link.world && link.world.map === this.map.id) {
      // Same map (e.g. a new host after a migration): just take its world, no fade.
      this.mergeFull(link.world.sim);
      link.world = null;
    }
    if (link.world) {
      const init = link.world;
      link.world = null;
      this.travelling = true;
      this.cameras.main.fadeOut(300, 7, 6, 11);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
        this.scene.restart({ mode: "client", localId: this.localId, init, map: init.map, slot: this.start.slot, playtime: this.playtime } satisfies WorldStart)
      );
      return;
    }
    if (link.full) {
      this.mergeFull(link.full);
      link.full = null;
    }
    if (this.freezeMs > 0) this.freezeMs = Math.max(0, this.freezeMs - delta);
    this.anims.globalTimeScale = this.freezeMs > 0 ? 0 : 1;

    // 60 Hz: sample, send, predict.
    this.accumulator = Math.min(this.accumulator + delta / 1000, SIM_DT * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= SIM_DT) {
      const me = this.sim.actors[this.localId];
      if (me) this.prev.set(me.id, { x: me.x, y: me.y });
      const intent = this.localIntent();
      link.send(intent);
      if (me && me.action.kind !== "dead") predictStep(this.sim, this.map, me, intent);
      this.accumulator -= SIM_DT;
    }

    // Host state.
    const now = this.time.now;
    for (const snap of link.snaps.splice(0)) {
      const me = this.sim.actors[this.localId];
      applySnapshot(this.sim, snap, this.localId);
      for (const a of Object.values(this.sim.actors)) if (a.id !== this.localId) link.interp.push(a.id, now, a.x, a.y);
      const mine = actorTuple(snap, this.localId);
      if (me && mine) {
        const before = { x: me.x, y: me.y };
        reconcile(this.sim, this.map, me, mine, link.pending.ack(snap.acks[this.localId] ?? 0));
        // Small corrections are eased in over ~100 ms; big ones (teleport, knockback) snap.
        const dx = before.x - me.x;
        const dy = before.y - me.y;
        if (Math.hypot(dx, dy) < 48) this.correction = { x: this.correction.x + dx, y: this.correction.y + dy };
        else this.correction = { x: 0, y: 0 };
      }
    }
    link.interp.retain(new Set(Object.keys(this.sim.actors)));
    for (const events of link.events.splice(0)) this.handleEvents(events);
    this.syncViews();

    const k = Math.min(1, delta / 100);
    this.correction = { x: this.correction.x * (1 - k), y: this.correction.y * (1 - k) };
    const alpha = this.accumulator / SIM_DT;
    for (const a of Object.values(this.sim.actors)) {
      if (a.id === this.localId) {
        const prev = this.prev.get(a.id) ?? a;
        this.views.get(a.id)?.update(prev.x + (a.x - prev.x) * alpha + this.correction.x, prev.y + (a.y - prev.y) * alpha + this.correction.y, a);
      } else {
        const p = link.interp.at(a.id, now) ?? a;
        this.views.get(a.id)?.update(p.x, p.y, a);
      }
    }
    this.renderCommon(delta);
  }

  /**
   * A full world state from the host replaces my mirror, except my own player's moment-to-moment
   * state, which my prediction owns (the next snapshot reconciles it).
   */
  private mergeFull(full: SimState): void {
    const mine = this.sim.actors[this.localId];
    const next = full;
    next.events = [];
    const theirs = next.actors[this.localId];
    if (mine && theirs) {
      const { x, y, vx, vy, action, facing, aim, moving, stamina, iframes, blockSince, buffered } = mine;
      Object.assign(theirs, { x, y, vx, vy, action, facing, aim, moving, stamina, iframes, blockSince, buffered });
      theirs.cooldowns.dodge = mine.cooldowns.dodge ?? 0;
    }
    this.sim = next;
  }

  /** Fade out and restart the scene on the target map, carrying the local player state and the clock. */
  /** A Rift floor's extra multipliers: `perFloor` × floors below the first, plus the danger the party lit. */
  private riftDepthMods(danger: number): Partial<Modifiers> {
    const r = this.rift && content.rifts.find(this.rift.rift);
    if (!r || !this.rift) return {};
    const depth = this.rift.floor - 1;
    const lit = dangerMods(r.id, danger);
    const keys = new Set([...Object.keys(r.perFloor), ...Object.keys(lit)]) as Set<keyof Modifiers>;
    return Object.fromEntries([...keys].map((k) => [k, 1 + (r.perFloor[k] ?? 0) * depth + (lit[k] ?? 0)]));
  }

  private travel(target: string, arriveAt: string): void {
    if (this.travelling) return;
    // A portal to a Rift starts today's run (host clock decides the day).
    const { map: to, arrive } = resolvePortal(target, arriveAt, dailySeed(Date.now()));
    this.travelling = true;
    const me = this.sim.actors[this.localId];
    const carry = me?.progress ? capturePlayer(me) : undefined;
    // The other players come along (placed beside me on arrival, then sent the new world).
    const party = this.hostLink
      ? Object.fromEntries(Object.values(this.sim.actors).filter((a) => a.kind === "player" && a.id !== this.localId && a.progress).map((a) => [a.id, capturePlayer(a)]))
      : undefined;
    audio.sfx("portal", { volume: 0.5 });
    this.cameras.main.fadeOut(350, 7, 6, 11);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.restart({ mode: this.start.mode, map: to, arrive, carry, time: this.sim.time, slot: this.start.slot, playtime: this.playtime, rules: this.sim.rules, localId: this.localId, party } satisfies WorldStart)
    );
  }

  /**
   * While paused the sim doesn't step, but equip/use must still feel instant: run one zero-input
   * step that carries only the commands. (Online, commands just ride the next Intent.)
   */
  private applyMenuCommands(): void {
    if (!this.commands.length) return;
    const commands = this.commands.splice(0);
    const me = this.sim.actors[this.localId];
    if (!me) return;
    stepSim(this.sim, this.map, { [this.localId]: { move: { x: 0, y: 0 }, aim: null, held: [], pressed: [], commands } });
    this.handleEvents(this.sim.events);
    if (this.saveSoon) this.save();
    this.updateInventory(me);
  }

  /** NPCs face the player who talks to them. */
  private turnToward(npcId: string): void {
    const npc = this.sim.actors[npcId];
    const me = this.sim.actors[this.localId];
    if (npc && me) npc.aim = { x: me.x - npc.x, y: me.y - npc.y };
  }

  /** "Talk" prompt near an NPC (HUD shows the key, or a tappable button on touch). */
  private updatePrompt(me: Actor | undefined): void {
    const alive = me && me.action.kind !== "dead";
    const npc = alive ? talkTarget(this.sim, me) : null;
    const chest = alive && !npc ? chestTarget(this.sim, me) : null;
    const spot = alive && !npc && !chest ? objectTarget(this.map, me, OBJECT_REACH)?.interact : undefined;
    const mate = alive && !npc && !chest && !spot && !this.sim.pvp && !this.sim.trades?.length ? tradeTarget(this.sim, me) : null;
    const prompt = npc
      ? ({ kind: "talk", npc: npc.type } as const)
      : chest
        ? ({ kind: "chest" } as const)
        : spot
          ? spot.kind === "rest"
            ? ({ kind: "rest" } as const)
            : ({ kind: "service", service: spot.service } as const)
          : mate
            ? ({ kind: "trade", name: this.nameOf(mate.id) } as const)
            : null;
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
      cosmetics: structuredClone(me.cosmetics),
      riftDanger: me.riftDanger,
      day: this.sim.day ?? 0,
    };
    const key = JSON.stringify(view);
    if (key === this.inventoryKey) return;
    this.inventoryKey = key;
    // Village projects appear (objects + their lights) and the worn lantern colours my light.
    this.objectImages.forEach((img, i) => {
      const flag = this.map.objects[i]?.ifFlag;
      if (flag) img.setVisible(me.progress!.flags.includes(flag));
    });
    this.lighting.setFlags(me.progress.flags);
    this.lighting.setLantern(me.cosmetics.lantern ? (findCosmetic(me.cosmetics.lantern)?.color ?? null) : null);
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
    const me = this.sim.actors[this.localId];
    const device = useInputDevice.getState().device;
    // Aim assist for touch and stick-less gamepad aiming: snap attacks onto the nearest foe in front.
    if (me && !intent.aim && device !== "keyboard" && useSettings.getState().aimAssist && intent.pressed.some((p) => p === "attack" || p === "heavy")) {
      const aim = assistAim({ ...me, aim: intent.move.x || intent.move.y ? intent.move : me.aim }, Object.values(this.sim.actors), (o) => hostile(this.sim.pvp, me, o));
      if (aim) intent.aim = aim;
    }
    return intent;
  }

  /** Creates views for new actors, removes views of despawned ones. */
  private syncViews(): void {
    for (const a of Object.values(this.sim.actors)) {
      if (this.views.has(a.id)) continue;
      const big = a.look.startsWith("bosses/");
      const bar = (a.kind === "enemy" || a.kind === "pet" || (a.kind === "player" && a.id !== this.localId)) && !big;
      this.views.set(a.id, new ActorView(this, a.look, a.x, a.y, bar, big));
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
    const hunted = Object.values(this.sim.actors).some((a) => a.ai?.target === this.localId);
    const state = this.bossFight() ? "boss" : me.hp > 0 && me.hp < me.stats.maxHp * 0.25 ? "danger-low-hp" : hunted ? "combat" : "explore";
    if (state === this.musicState) return;
    this.musicState = state;
    audio.music.setState(state);
  }

  /** The living boss engaged with the local player, if any. */
  private bossFight(): Actor | undefined {
    return Object.values(this.sim.actors).find((a) => a.kind === "enemy" && a.action.kind !== "dead" && a.ai?.target === this.localId && !!getEnemy(a.type).boss);
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

  /** Online: name tags over the other players and the HUD party panel (4 Hz, sent on change). */
  private updateParty(): void {
    if (this.time.now < this.partyAt) return;
    this.partyAt = this.time.now + PARTY_INTERVAL;
    const { session, room } = useNet.getState();
    const role = !session ? "solo" : this.hostLink ? "host" : "client";
    const others = (room?.players ?? [])
      .filter((p) => p.id !== this.localId)
      .map((p) => {
        const a = this.sim.actors[p.id];
        return { id: p.id, name: p.name, level: a?.level ?? p.level, hp: a?.hp ?? 0, maxHp: a?.stats.maxHp ?? 1, dead: a?.action.kind === "dead", here: !!a && p.connected, connected: p.connected, ping: session?.pingOf(p.id) ?? null };
      });
    for (const p of others) this.views.get(p.id)?.setName(p.name);
    this.updatePvp();
    const party = { role, ping: session ? session.pingOf(this.localId) : null, others } as const;
    const key = JSON.stringify(party);
    if (key === this.partyKey) return;
    this.partyKey = key;
    bridge.emit("game:party", party);
  }

  /** HUD counter of the wardens keeping this map's exit sealed (left 0 once it opens). */
  private updateSeal(): void {
    const p = this.map.portals.find((x) => x.requires.length);
    const view = p ? { left: this.sim.sealed?.includes(p.id) ? portalWardens(this.sim, this.map, p).length : 0, total: p.requires.length } : null;
    const key = JSON.stringify(view);
    if (key === this.sealKey) return;
    this.sealKey = key;
    bridge.emit("game:seal", view);
  }

  /** A player's display name (lobby name online, else "you" / the seat). */
  private nameOf(id: string): string {
    return useNet.getState().room?.players.find((p) => p.id === id)?.name ?? (id === this.localId ? t("pvp.you") : id);
  }

  /** PvP arena scoreboard (sent on change). */
  private updatePvp(): void {
    const pvp = this.sim.pvp;
    const view = pvp
      ? {
          rows: Object.values(this.sim.actors)
            .filter((a) => a.kind === "player")
            .map((a) => ({ id: a.id, name: this.nameOf(a.id), kills: pvp.score[a.id]?.kills ?? 0, deaths: pvp.score[a.id]?.deaths ?? 0, me: a.id === this.localId }))
            .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id.localeCompare(b.id)),
        }
      : null;
    const key = JSON.stringify(view);
    if (key === this.pvpKey) return;
    this.pvpKey = key;
    bridge.emit("game:pvp", view);
  }

  private updateAimOrigin(): void {
    const sprite = this.views.get(this.localId)?.sprite;
    if (!sprite) return;
    const cam = this.cameras.main;
    // World → screen (CSS px): Phaser RESIZE mode keeps canvas CSS size = game size.
    this.input2.setAimOrigin((sprite.x - cam.worldView.x) * cam.zoom, (sprite.y - cam.worldView.y) * cam.zoom);
  }

  /** Debug info goes to the HTML HUD (crisp, not affected by camera zoom), at 4 Hz. */
  private updateDebug(): void {
    if (!useSettings.getState().showFps || this.time.now - this.lastDebug < 250) return;
    this.lastDebug = this.time.now;
    const p = this.sim.actors[this.localId];
    if (!p) return;
    const session = useNet.getState().session;
    bridge.emit(
      "game:debug",
      `fps ${this.game.loop.actualFps.toFixed(0)} · tick ${this.sim.tick} · actors ${Object.keys(this.sim.actors).length}
` +
        `pos ${p.x.toFixed(1)},${p.y.toFixed(1)} · ${p.action.kind} · hp ${p.hp} · st ${p.stamina.toFixed(0)}` +
        (session ? `
net ${session.role} ${this.localId} · rtt ${session.pingOf(this.localId) ?? "?"} ms` + (netSimActive() ? ` · sim lag ${netSim.lag}±${netSim.jitter} loss ${netSim.loss}%` : "") : "")
    );
  }

  private cleanup(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.fx.destroy();
    this.lighting.destroy();
    this.cosmetics.destroy();
    this.weather.destroy();
    this.tilemap?.destroy();
    this.tilemap = null;
    this.views.forEach((v) => v.destroy());
    this.views.clear();
    this.seals.destroy();
    this.anims.globalTimeScale = 1;
    audio.music.setState("explore");
    audio.ambience.set(null);
  }
}

/** What a shop deal, forge strike, finished project… sounds like. */
const ECONOMY_SFX = { "trade-shop": "pickup-coin", forged: "hit-armor", built: "quest-complete", danger: "hollow-pulse", cosmetic: "ui-confirm", rest: "lantern-hum" } as const;

/** HUD view of the skill slots: equipped skill, cooldown left / total, usable now. */
function skillViews(me: Actor) {
  return SKILL_SLOTS.map((slot) => {
    const id = me.loadout[slot];
    const def = id ? findSkill(id) : undefined;
    return { slot, id: def?.id ?? null, cd: def ? skillCooldown(me, def.id) : 0, cdMax: def?.cooldown ?? 0, ready: skillBlocker(me, slot) === null };
  });
}
