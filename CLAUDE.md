# Ultima IV Companion

Electron + Vite + React + TypeScript desktop companion for the GOG release of Ultima IV.
Full roadmap: see the "Milestones" section of README.md.

## Commands
- `npm run dev` — launch the app (electron-vite)
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

## Game data facts
- Install: `C:\Program Files\GOG Galaxy\Games\Ultima 4` (override with `U4_DIR`)
- GOG mounts `cloud_saves\` as a DOSBox overlay: live saves are `cloud_saves\PARTY.SAV`, falling back to the root copy
- The game writes PARTY.SAV on Q (Quit & Save), which only works outdoors ("Not Here!" in towns); entering a town or dungeon writes OUTMONST.SAV
- Format spec: xu4 `doc/FileFormats.md`. Correction: WORLD.MAP chunks are row-major (8 per row), verified against known town tiles
- Lord British's castle has two floors: `LCB_1.ULT` and `LCB_2.ULT`
- PARTY.SAV x,y is the position on the current map (surface, town or dungeon 0-7); 0x1EE/0x1EF are the surface return position (u4-decompiled `out_x/out_y`), not dungeon coords as xu4 FileFormats.md says
- In memory the game keeps PARTY.SAV byte-for-byte as `struct tParty Party` (0x1F6 bytes, u4-decompiled U4.H)

## Rules
- Any write to a game file: DOSBox must not be running, snapshot first, explicit user confirmation
- Parsers get a test; prefer checking against the real install plus a synthetic fixture for CI
- Play-test only in a test instance; never kill a DOSBox the player launched without asking

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
- Dungeon facts seen live: `E` enters a dungeon from its entrance; inside, x,y are 0-7 with `orientation` 0-3 = W,N,E,S; walking into a room cell (R#) starts a room battle, during which movement keys don't change the dungeon position (presses time out), but `space` passes turns and HP changes show live.
- Not supported yet: combat tactics (attacking or fleeing), dungeon route-finding, and conversations (typed keywords; the game draws text as graphics).
- Confirmed live: in towns x,y are town coordinates and out_x/out_y the surface return point; DOSBox restarts are reattached automatically; Quit & Save answers "Not Here!" off the surface; the Rune of Honesty hint (town 8,6) works.
