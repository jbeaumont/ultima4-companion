# Ultima IV Companion

Electron + Vite + React + TypeScript desktop companion for the GOG release of Ultima IV.
Full roadmap: see the "Milestones" section of README.md.

## Commands
- `npm run dev` — launch the app (electron-vite)
- `npm test` — Vitest; tests in `tests/` against the real install are skipped when it is absent
- `npm run typecheck` — TypeScript 7 (`tsc --noEmit`)
- `npm run extract` — regenerate `data/` (tile atlas, dialogue JSON) from the install

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
