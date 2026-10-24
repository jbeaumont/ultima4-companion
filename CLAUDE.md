# Ultima IV Companion

Electron + Vite + React + TypeScript desktop companion for the GOG release of Ultima IV.
Full roadmap: see the "Milestones" section of README.md.

## Commands
- `npm run dev` — launch the app (electron-vite). Its companion data lives in `%APPDATA%\ultima4-companion-dev` (`src/main/devData.ts`), apart from the installed app's `ultima4-companion`; the first dev run copies the companion's files from there. It plays the real saves.
- `npm test` — Vitest; tests in `tests/` against the real install are skipped when it is absent
- `npm run typecheck` — TypeScript 7 (`tsc --noEmit`)
- `npm run extract` — regenerate `data/` (tile atlas, dialogue JSON) from the install
- `npm run dev:test` — a separate **test instance** (see Play-testing below), remote debugging on port 9241
- `npm run dist` — Windows installer in `release/`

## Layout
- `src/parsers/` — pure byte parsers for every game file; no Node/Electron imports so main and renderer can share them
- `src/domain/` — game constants and derived logic (progress, cooldowns, moongates)
- `src/main/`, `src/preload/`, `src/renderer/` — Electron processes; renderer reaches main only via the typed `window.u4` bridge
- `data/` — derived data committed to the repo; raw game files are gitignored and must never be committed
- `src/renderer/src/styles/` — one CSS file per area (imported in `main.tsx`); `base.css` holds the theme and shared rules. Put new rules in the area's file with selectors unique to it, not in `base.css`, so parallel work doesn't collide

## Game data facts
- Install: `C:\Program Files\GOG Galaxy\Games\Ultima 4` (override with `U4_DIR`)
- GOG mounts `cloud_saves\` as a DOSBox overlay: live saves are `cloud_saves\PARTY.SAV`, falling back to the root copy
- The game writes PARTY.SAV on Q (Quit & Save), which only works outdoors ("Not Here!" in towns); entering a town or dungeon writes OUTMONST.SAV
- Format spec: xu4 `doc/FileFormats.md`. Correction: WORLD.MAP chunks are row-major (8 per row), verified against known town tiles
- Lord British's castle has two floors: `LCB_1.ULT` and `LCB_2.ULT`
- PARTY.SAV x,y is the position on the current map (surface, town or dungeon 0-7); 0x1EE/0x1EF are the surface return position (u4-decompiled `out_x/out_y`), not dungeon coords as xu4 FileFormats.md says
- In memory the game keeps PARTY.SAV byte-for-byte as `struct tParty Party` (0x1F6 bytes, u4-decompiled U4.H)

## Spoilers
- One policy decides what each hint level shows: `src/domain/spoilers.ts` (`disclosure(level)`, `shownTiers`, `townShown`, `cellShown`). Views and the Sage ask it; never compare spoiler levels in a view. `tests/spoilers.test.ts` checks every surface against it.
- Off is strict: no hint text, leads, hidden places or deed guide, and the Sage gives fixed counsel without calling the model. Nudges and Full are best effort for the Sage (instructions plus filtered hints), and the UI says so.
- Sage budget: `npx tsx scripts/sage-budget.ts [outDir] [--yes]` asks seven fixed questions per persona and model-backed level through the app's conversation code and records output and thinking tokens, cache use and cost. Without `--yes` it only prints the plan and an estimate. It spends money (the 2026-10-24 run cost $0.53), so run it only with the owner's OK. A key saved in the companion's Settings is encrypted for Electron; `npx electron scripts/with-sage-key.cjs [--test] -- scripts/sage-budget.ts out --yes` passes it to the script's environment only. That run set `SAGE_MAX_TOKENS` to 2000 (max seen 654, no answer near the cap); rerun after changing the prompts, model or effort.
- Sage model: Claude Haiku 5.5 by default (lowest cost, about 0.05 cents an answer; `SAGE_MODEL` in `prompt.ts`). `SAGE_MODELS` in `request.ts` lists what each model takes: Haiku has no server-side fallback and no mid-conversation system messages, so the game state goes in the user message; Opus 5.5 uses `fallbacks: 'default'` and a turn-scoped system message. `sage-budget.ts --model` measures either.
- Explicit reveals are capped by the level; discovered knowledge (solved topics, visited towns, seen cells) shows at any level that shows hints.

## Playthroughs
- The journal and explored-map files belong to the active playthrough profile: `<userData>/profiles/<id>/` (`src/main/profiles.ts`, `profileSession.ts`); `profiles.json` lists them. The first run moved the old files there and kept `*.pre-profiles` copies. Settings and the Sage key stay global.
- Snapshots stay in one store, because the game has one save slot and restoring another playthrough's snapshot is how you swap characters. Each records the active playthrough (`playthrough` in its meta); the Snapshots view shows this playthrough's by default, auto snapshots are pruned per playthrough, and restoring another playthrough's (or another Avatar's) save gets a warning in the confirmation (`restoreWarning`).
- Switching (Settings → Playthroughs) writes out the fog, loads the other profile's journal and fog, and reloads the window. Each profile records its Avatar's name; the Dashboard flags a save for a different character.
- A new playthrough doesn't adopt the character in the save when it is created (`waitingFor`), nor (for older profiles) one another playthrough owns (`adoption()` in `src/shared/profiles.ts`). Until a new game appears (another name, or moves below the noted count) or the player clicks Follow, the Dashboard, Tracker and HUD show a "new playthrough" state, and nothing is recorded in its journal or map. Driving `switchProfile` from CDP skips the window reload the Settings screen does; reload the page yourself.

## Rules
- Any write to a game file: DOSBox must not be running, snapshot first, explicit user confirmation
- Parsers get a test; prefer checking against the real install plus a synthetic fixture for CI
- Play-test only in a test instance; never kill a DOSBox the player launched without asking

## Working with others
Several people and their agents work on this repo; the full workflow is in CONTRIBUTING.md.
- Branch from `main` as `<handle>/<topic>`, one topic per PR, PRs target `main` (stacked PRs merge into their parent branch, not `main`). Never push to `main`.
- Claim an issue before starting; open one for new work.
- Before a PR: `npm run typecheck`, `npm test`, and the hill-climb journey for anything the companion shows. Say in the PR what you could not verify.
- Install paths differ: use `U4_DIR`, never hard-code a personal path. Tests that need the install must skip without it (and must not read it at collection time).
- One play-test per machine at a time: the driver takes window focus and the test companion is always on port 9241.

## Play-testing (computer use)
A test instance can never touch the player's saves or companion data.
- `npm run dev:test` starts the companion in test mode (env `U4C_TEST=1`; `--test` also works when Electron is started directly): its own userData (`%APPDATA%\ultima4-companion-test`), so journal, fog, snapshots and settings are separate. The game it launches uses the test save overlay `game-saves\` inside that folder.
- Launch: sidebar "Launch test game (turbo)", or `node scripts/cdp.mjs 9241 eval "window.u4.launchGame()"`. The `test` profile runs DOSBox at `cycles=max`, windowed 960x600 at screen 0,0 (fixed, so computer-use coordinates are stable). Configs are generated into userData; the game folder is never modified.
- Seed (DOSBox closed): `window.u4.seedTestSaves('real')` copies the player's current save in (read-only on the real save); `'empty'` gives a fresh folder for Initiate New Game.
- At turbo speed keystrokes need no waits, so batch whole walks in one computer_batch. Title menu: any key, then `J` (Journey Onward). Arrows move; `E` enters a town or dungeon; `S` searches; `Q` saves (surface only).
- Inspect: `node scripts/cdp.mjs 9241 state` (position, location, unsaved moves, visited, snapshots); `... view Map`; `... shot out.png`; `... hud out.png`. Keep screenshots in the session scratchpad, not the repo.
- Set up later-game states quickly with the guarded Editor in the test instance (DOSBox must be closed to write).

### Scripted play (preferred: no computer use)
`scripts/driver/` drives the turbo test DOSBox headlessly: keys go in by posting window messages, and every step is checked against live memory (the party block). A scenario is just a script:
- `npx tsx scripts/driver/scenarios/moonglow-rune.ts`: prepares a test save, launches, walks to Moonglow, enters, path-finds to 8,6, searches, and asserts the Rune of Honesty bit. Runs in about 5 s.
- `GameDriver` API: `attach`, `journeyOnward`, `state()`, `press(key)` (waits until the turn is processed), `walkTo(x, y)` (Dijkstra over the current world or town map using `src/domain/walkable.ts` costs from xu4's tile rules; re-routes around NPCs that block), `enter()`, `search()`.
- SDL 1.2 only reads keys while DOSBox is the foreground window, so the driver brings it forward with one real click (cursor restored). The test profile sets `autolock=false` so that click can't capture the mouse. Expect DOSBox to take focus while a scenario runs.
- DOSBox recreates its window when it switches video mode, so look windows up by process each time (`findDosboxWindow`), never cache the handle.
- `npx tsx scripts/driver/scenarios/dungeon-party.ts [--close]`: a two-member test party (Iolo from the template save) is placed on Despise's entrance, enters with `E`, explores, then passes turns while monsters engage. It leaves the test game open for inspecting the companion (dungeon follow, fog, facing arrow, HP in the Dashboard and HUD).
- Test and play games can run side by side: every DOSBox is classified by its command line (`dosbox-test.conf` means test). Normal instances attach only to non-test DOSBox, test instances only to test DOSBox, and the driver drives only the test one.
- Dungeon facts seen live: `E` enters a dungeon from its entrance; inside, x,y are 0-7 with `orientation` 0-3 = W,N,E,S; walking into a room cell (R#) starts a room battle (CurMode 6).
- `npx tsx scripts/driver/scenarios/dungeon-battle.ts [--close]`: the same party enters Despise, walks into the level 1 room, fights the battle to the end, leaves east, routes to the ladder and descends to level 2. Runs in about 16 s.
- Battles: `fightBattle({ goal, exitToward })` plays every member's turn from memory (`src/domain/combatPlan.ts`): attack a monster in reach (ranged weapons along a line, halberd at 2), else close in by BFS; once no monsters remain, or with `goal: 'flee'`, walk off the map edge. A dungeon room battle only ends when everyone has left by the side the first member used, so `exitToward` picks the side. `battle()` gives a snapshot; `mode()` is the game's CurMode (4 combat, 5 camp, 6 room).
- Dungeons: `dungeonWalkTo(x, y)` turns and advances along a route over the live level in memory (`src/domain/dungeonRoute.ts`; levels wrap, rooms only when there is no other way, and battles on the way are fought, leaving rooms on the onward side). `ladder('up'|'down')`, `dungeonLevel()`, `dungeonCell()`.
- Memory map: globals are read at fixed data-segment offsets from u4-decompiled `U4.H` (DS base = party block address - 0x9144): CurMode 946A, Combat 9470 (monster x/y, member x/y, 11x11 map at 94B0), Fighters 9530 (monster tile/HP, member `_chtile`), activeChara 959A, activeCharaX 080A (not -1 while a member's command is awaited), room exit 96EE/96F4, dungeon map 8742, current conversation record 95CE (the TLK block of the last person talked to; a change means a new conversation, recorded in the journal's `met` list).
- Battle spells: with the party's health, MP and mixtures (`support` in the combat view) the planner heals a member below a third of their HP, cures a poisoned one, and fires Magic Missile at a foe in line when nothing is in weapon reach (C, spell letter, then the member's number or a direction). It never casts without the MP, since a failed cast still uses the mixture. `npx tsx scripts/driver/scenarios/battle-spells.ts [--close]` checks it.
- Conversations: `talkTo(talkIndex)` walks up to a person (they wander) and starts talking; `ask(keyword)` types it and returns the reply from the person's record in memory (D_95CE, the record the game prints from), pressing a key when a question follows; `answer(yes)`, `bye()`, `conversation()`. Replies come from `src/domain/talkSim.ts` (the game's rules); the screen text itself is not read.
- Spells outside battle: `castSpell(letter, { caster, who | dir })` (C, caster number, letter, then a member or direction). `npx tsx scripts/hillclimb/conversation.ts <outDir>` checks Cure and a conversation with Cromwell (his question sets the virtue-conversation timer).
- Not supported yet: Use in battle (quest items only).
- Confirmed live: in towns x,y are town coordinates and out_x/out_y the surface return point; DOSBox restarts are reattached automatically; Quit & Save answers "Not Here!" off the surface; the Rune of Honesty hint (town 8,6) works.

### Hill-climbing the companion
Verified checkpoints also live as replay fixtures in `tests/replay/` (run anywhere by `npm test`, no game needed); `scripts/replay/capture.ts` turns a live checkpoint into a fixture skeleton. See `tests/replay/README.md`.
`scripts/hillclimb/` runs a journey with the driver and, at each checkpoint, captures what the test companion shows (view text + screenshots via CDP, `companion.ts` starts `npm run dev:test` if needed), then checks expectations. Review the captures, fix gaps, rerun.
- `npx tsx scripts/hillclimb/first-rune.ts <outDir>`: outside Moonglow, inside, and after finding the Rune of Honesty (Dashboard, Map, Journal, Hints, Dialogue). About 25 s.
- `npx tsx scripts/hillclimb/dungeon.ts <outDir>`: Despise on entry, at the start and middle of the room battle, and on level 2 (Dashboard, Map); asserts the companion's battle view matches the game and clears afterwards. About 35 s.
- `npx tsx scripts/hillclimb/shrine.ts <outDir>`: meditates at the Shrine of Honesty (E, type the virtue, 3 cycles, mantra after each 16-second count; keys typed before the prompt are dropped). About 75 s.
- `npx tsx scripts/hillclimb/moongate.ts <outDir>`: waits beside the Moonglow gate and steps through when Trammel opens it. Moons advance on the game's animation timer, so at turbo they cycle every few seconds and companion readings can trail by a phase.
- `npx tsx scripts/hillclimb/lord-british.ts <outDir>`: castle, ladder at 3,3, Lord British at 19,7 on LCB_2; level-up on audience, "health" + N heals. About 60 s.
- `npx tsx scripts/hillclimb/reagents.ts <outDir>`: buys Ginseng and Garlic at Moonglow's Magical Herbs (talk north across the counter letters to the merchant on row 25; `d.npcs()` finds the merchant) and mixes Cure (M, spell letter, reagent letters, Enter). About 25 s.
- `npx tsx scripts/hillclimb/recruit.ts <outDir>`: recruits Iolo (28,29 in Britain: T, then type "join"). Join rules (TLK_join): not the Avatar's class, the town's virtue at least 40 (or 0), the Avatar's max HP at least 100 x (party size + 1); `joinReadiness` in `src/domain/companions.ts` shows them on the companion cards.
- `npx tsx scripts/hillclimb/hawkwind.ts <outDir>`: consults Hawkwind in Lord British's castle (west room: door 6,19, then four rows of sleep fields; talk south across the counter on row 25). Leaving him gives +3 Spirituality and uses the meditation timer. Fields (poison, fire, sleep) are walkable at a high route cost.
- Driver: town walking reads the live 32x32 map from memory (any floor, doors as they are); doors are opened with `O` (east or west only, per CMD_Open) and routed around when they would be entered from north or south; slow terrain is retried before being routed around; walking stops with an error if the Avatar dies; `type(text)` and `waitFor(test)` help with prompts; `d.trace = true` logs refused steps.
- Poison costs 2 HP every turn, including idle turns (U4_MAIN.C), so give a poisoned test party enough HP for the whole journey: a dead Avatar is resurrected at Lord British's after a long sequence, which looks like a slow or stuck walk.
- `npx tsx scripts/hillclimb/stone.ts <outDir> [dungeon]`: follows a stone hint end to end (Despise by default; Deceit, Destard, Wrong, Covetous, Shame) with `dungeonTravel`. All six pass (2 to 5 minutes each). The test party has maxed stats, a Magic Wand and Mystic Armour: the journey checks the route and the hint, not the fighting.
- Dungeon access facts (from the files, checked by tests/hints.test.ts): Deceit, Despise and Wrong altars are sealed by energy fields (need Dispel: C, member, D facing the field); Covetous and Shame need a room trigger (a pressure plate) to open the way; Destard is fights only. Rooms are left only by their open sides; triggers change room tiles when a member steps on them (U4_COMBB.C C_7A15), and can chain. In battle the planner waits for a party member on a one-wide way out rather than leaving by another side (the first member out fixes the side for everyone), recomputes the exit side for each room when rooms open into rooms, casts Dispel at energy fields between it and a trigger or exit, and leaves a room after 40 turns with no monster falling (some sit in walled pockets).
- Live battle view: in memory mode `GameState.battle` (`src/parsers/battle.ts`, shared with the driver) carries the combat map, monsters (name, HP, HP when first seen) and party positions; `BattlePanel` shows it on the Dashboard and above the Map. After changing main-process code, restart the test companion: it does not reload main on its own.
- Write captures to the session scratchpad, not the repo. A freshly started companion can lag a few seconds before going live; the journeys wait for it.
- `npx tsx scripts/hillclimb/rune.ts <outDir> <virtue>`: follows a rune hint from the town gate (all eight pass). The town walker routes around the people on the map, opens doors, unlocks locked doors with J and a key (`unlock`), casts Dispel at energy fields (`dispel`), and walks through secret doors (tile 73, walkable in the game).
- `npx tsx scripts/hillclimb/item.ts <outDir> <bell|wheel|horn|skull|black|white|book|candle|armour|weapons|abyss>`: the test save puts the party on the hinted spot (aboard ship for bell, wheel and skull), searches, and checks the game and the companion. Skull and black stone first check that a search under other moons finds nothing, then wait for new moons. The Mystic Arms need an eight-part Avatar. `abyss` uses the bell, book and candle at 233,233. Sailing and flying there are not played. All eleven pass.
- Altar rooms, the Abyss altars, the Word of Passage and the Codex are not played; `tests/hintFacts.test.ts` checks those hints against u4-decompiled (U4_USE.C, U4_END.C) and the dialogue.
- `tests/hintFacts.test.ts` checks hints against the game's search table (U4_SRCH.C), mantra table (U4_SHRIN.C) and what the named people say (data/dialogue.json).
