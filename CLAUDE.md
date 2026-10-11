# Valaria: The Shattered Sun — project guide

> The display name lives in one place: `src/config/game.ts`. (The repo name `tech-rpg` is a placeholder; ignore it creatively.)
> Top-down real-time action RPG. Web (desktop + mobile browsers, GitHub Pages) and Android (Capacitor APK). Solo + peer-to-peer co-op/PvP.

## Start of every session
1. Read `.work/STATUS.md` (local only, gitignored): where we are, what's next. Keep it short and current.
2. Open only the milestone file it points to (`.work/milestones/Mxx-*.md`). Do not re-read the whole repo.
3. At the end of a session: tick tasks, update STATUS.md (≤ 40 lines), log non-obvious choices in `.work/DECISIONS.md`.

## Commands
| | |
|---|---|
| `npm run dev` | game on http://localhost:5173 (also reachable from a phone on the LAN with `--host`) |
| `npm test` | vitest (pure logic in `src/core`, content validation) |
| `npm run typecheck` / `npm run build` | strict TS, production build in `dist/` |
| `npm run assets` | copy sprites listed in `tools/assets/manifest.ts` from `ref_sprites/` + run generators → `public/assets/` |
| `npm run content:check` | validate every content JSON (schemas, unique ids, map invariants) — runs `src/content/*.test.ts` |
| `npm run admin` | local admin/showcase site (`admin/`, gitignored, never pushed) |

## Hard rules
- **`ref_sprites/` is read-only reference** (gitignored). Never edit or delete anything in it. The only allowed write is *adding new files* under `ref_sprites/generated/` (our own generated art, mirrored there for reference). The game never loads from `ref_sprites/`: assets are copied into `public/assets/` by `npm run assets` and committed.
- `.claude/`, `.work/`, `admin/`, `ref_sprites/` are local only (gitignored).
- No new dependency without a reason in `.work/DECISIONS.md`. Don't install system tools; ask.
- No hard-coded UI colours: React UI uses theme token classes (see `.claude/skills/SKILL-theme-system.md`). In-game palette (world art, elements, rarities) lives in `src/config/palette.ts`.
- Every player-visible string goes through `t()` (`src/i18n`). Content JSON stores i18n keys or `{en, fr}` objects, never raw strings in code.
- Commit messages: imperative, scoped (`combat: add perfect parry window`).
- **Push only after asking the user, every time.** Commit locally freely once typecheck + tests pass.
- Tooling pitfall (Windows Git Bash): heredocs containing apostrophes break — write files with the Write tool.
- Project skills in `.claude/skills/`: `phaser-react-hybrid`, `pixel-asset-pipeline`, `realtime-p2p-netcode`, `content-type-recipe` (+ the base `SKILL-p2p-static-game.md`, `SKILL-theme-system.md`). Load the relevant one before working in its area, and update it when you learn a new pitfall.

## Architecture (keep the boundaries)
```
src/
  config/      game constants, palette, feature flags (no logic)
  core/        PURE TypeScript: no Phaser, no DOM, no network. `sim/` = fixed-step 60 Hz simulation
               (movement/collision are ours, not Phaser physics) shared by solo, host, prediction and replays. Stats, damage, statuses, loot, progression,
               quests, dialogue, seeded RNG, save model. Deterministic (rng + `now` are inputs). Unit-tested.
  content/     schemas/ (zod = types + validation + JSON Schema for the admin), data/ (*.json), loader.ts
  game/        Phaser runtime. Thin: renders and drives `core`.
    scenes/    Boot → Preload → World (+ overlays). One scene per mode, not per map.
    entities/  Player, Enemy, Npc, Projectile, Pickup (GameObjects delegating rules to core)
    systems/   combat, ai, spawn, lighting, weather, day/night, camera-fx
    input/     InputRouter: keyboard/mouse/gamepad/touch → `Intent` (move, aim, actions). Gameplay reads Intents only.
    audio/     procedural synth: sfx presets + music sequencer + mixer (no audio files)
    fx/        particles, damage numbers, hit-stop, shake, flashes
    world/     map format, tile rendering, collisions, zone transitions
  bridge/      typed event bus between Phaser and React (the only coupling point)
  app/         React shell: screens (title, lobby, settings, codex…) + HUD overlay over the canvas
  ui/          design-system components (Button, Panel, Bar, Modal, Icon, TouchControls…)
  net/         PeerJS P2P session (host-authoritative), protocol, snapshot interpolation
  store/       zustand stores (profile, settings, saves, session UI)
  i18n/        en / fr dictionaries
  themes/      token theme system (see skill)
tools/         node scripts: asset copy + procedural sprite generators, content validation
public/assets/ runtime assets (committed)
```
Dependency direction: `app/ui → bridge ← game → core ← content`. `core` imports nothing from the others. `net` carries `core` actions/snapshots.

## Design principles
- **Data-driven**: enemies, items, swords, shields, skills, talents, quests, dialogue, maps, lore, loot tables are JSON validated by a zod schema. Adding content must not need code. New content type ⇒ schema + loader + validation test + **admin page** + codex/showcase view (the admin must evolve with the game).
- **Game logic in core, presentation in game/app.** Combat maths, status ticks, quest state machines are testable without a browser.
- **Host-authoritative networking** (see `.claude/skills/SKILL-p2p-static-game.md`): solo = local host. Clients send Intents, host simulates and broadcasts snapshots (~20 Hz), clients interpolate others and predict self. Same code path solo and multi.
- **Input abstraction**: never read keys in gameplay code. Touch controls show automatically when the last input was touch (`event.pointerType`, not media queries).
- **Rendering**: pixel art at a low internal resolution, integer-ish camera zoom, `pixelArt: true`. UI is crisp HTML on top.
- **Juice is a feature**: every hit has sound + hit-stop + flash + particles + knockback; every UI action has feedback.
- **Saves** are versioned and always normalized on load (`core/save/save.ts` → `migrateSave`).

## Game design snapshot
- **World**: Valaria, plunged into night when the Dawnblade (the sun, a god's sword) shattered into 30 Ember Blades. The last flame burns in the Lantern of Cinderhold. The player is an initiate of the Embersworn, the order that guards the Lantern. Four Heralds of the Hollow (the bosses: Pale Weaver, the Shroud, the Maw, Archfiend Vaelgor). Full bible: `src/content/data/lore/`.
- **Combat**: light/heavy combos, charged attacks, dodge-roll with i-frames, stamina, shield block/parry (perfect parry → slow-mo counter), 2 skills + ultimate, elements Ember/Frost/Storm/Hollow with reactions, telegraphed enemy attacks, multi-phase bosses, pet companion.
- **Progression**: levels + talent constellation (Blade / Ward / Arcana), gear rarities + affixes + sets, weapon mastery per sword family, codex completion, difficulty (Story/Normal/Hard/Nightmare) + Omens modifiers + NG+.
- **World**: hub Cinderhold (grows with quests), zones Whispering Wilds, Ashen Graveyard, Deep Mines, Fallen Citadel, Hollow Rift; procedural Rift dungeons (daily seed); day/night, weather, dynamic light; adaptive music.
- **Quests**: main story, side quests with choices, bounty board, daily rifts, dialogue trees.
- **Multiplayer**: co-op story (2–4), co-op rifts, PvP arena, trading. P2P only, no server.
- **Controls**: PC WASD + mouse aim / keyboard-only / gamepad. Mobile: floating left stick, right action cluster (attack, dodge, skill 1, skill 2, ultimate), aim assist, landscape.

## Definition of done (per feature)
Typecheck + tests green · works with keyboard, gamepad **and** touch · i18n keys · content in JSON (not code) · admin page updated if content changed · STATUS.md updated.

## CI/CD
- `.github/workflows/web.yml`: test → build → GitHub Pages (Settings → Pages → Source: GitHub Actions).
- `.github/workflows/android.yml`: build → `cap add/sync android` → Gradle `assembleDebug` → APK artifact; on tag `v*` attached to a GitHub Release. The `android/` folder is generated in CI (not committed).

## Credits / licences
Pipoya RPG character sets; decor sheets; SnoopethDuckDuck shields (Pack 3 is CC BY 4.0 — credit required, shown in the Credits screen). Keep `src/content/data/credits.json` up to date when copying new asset families.
