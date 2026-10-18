# ultima4-companion

A desktop companion for **Ultima IV: Quest of the Avatar** (the DRM-free GOG release, running in DOSBox). Keep it open beside the game: it reads the game live from DOSBox's memory (or from your save files) and shows:

- **Dashboard**: the eight virtues with progress, runes, stones and quest items, companions (greyed until they join), timers, moongates, health and level-up alerts, and a **live battle view** (the field, every foe's HP, your party) while you fight.
- **Map**: world, towns and dungeons from the game's own tiles, following the party, with fog of war.
- **Journal**: an automatic checklist of the quest, cooldown timers, moongate tables, and your notes and clues.
- **Hints**: tiered, spoiler-gated (off / nudges / full), marked solved from your save.
- **Dialogue**: every NPC's conversation, unlocked as you visit towns, with a "talk to" simulator.
- **Snapshots and Editor**: automatic save backups with restore, and a guarded save editor (off by default).
- **Sage** (optional, off by default): a spoiler-aware Claude advisor; needs your own Anthropic API key.

## Requirements
- Windows 10 or 11 (live memory mode, the launcher and the play-test driver are Windows only; parsers and tests run anywhere).
- Node.js 24 and Git.
- **Your own copy of Ultima IV from GOG.** Game files are never committed to this repo. Default path: `C:\Program Files\GOG Galaxy\Games\Ultima 4`; set `U4_DIR` if yours is elsewhere.

## Getting started
```bash
npm install
npm test
npm run dev
```
- `npm run dev:test`: a separate **test instance** with its own data and save overlay, for play-testing without touching your real game.
- `npm run dist`: Windows installer in `release/`.

New here, or bringing an AI agent? Read [CONTRIBUTING.md](CONTRIBUTING.md); agents also follow [CLAUDE.md](CLAUDE.md).

## How it fits together
```
src/parsers/   pure byte parsers for every game file (and battle state in memory)
src/domain/    game rules: progress, cooldowns, moongates, hints, route-finding, battle planning
src/main/      Electron main: save watcher, DOSBox memory reader, launcher, snapshots, IPC
src/renderer/  React UI (Dashboard, Map, Journal, Hints, Dialogue, ...)
scripts/driver/     headless play-test driver (keys in, live memory out) and scenarios
scripts/hillclimb/  journeys that play the game and check what the companion shows
tests/              Vitest; tests that need the real install skip without it
```

## Milestones
1. ✅ Scaffold (Electron + Vite + React + TS, Vitest)
2. ✅ Parsers for PARTY.SAV, MONSTERS.SAV, DNGMAP.SAV, WORLD.MAP, SHAPES.EGA, .ULT, .TLK, .DNG, .CON, plus `npm run extract`
3. ✅ Save-file watcher → live Tracker
4. ✅ Map: world, towns, dungeons
5. ✅ Journal, progress, cooldowns, moongates
6. ✅ Hints, dialogue explorer, clue capture
7. ✅ Live DOSBox memory mode, fog-of-war, compact HUD
8. ✅ Save snapshots → editor/cheats
9. ✅ Dungeon tools, installer (the art gallery was later removed; its image decoders power the Dashboard)
10. ✅ AI sage, optional and off by default
11. ✅ Launcher with a turbo test profile, Dashboard, headless play-test driver, hill-climb journeys, live battle view

Open work is tracked in [GitHub issues](https://github.com/jbeaumont/ultima4-companion/issues).

## Credits
File formats are from the [xu4](https://github.com/xu4-engine/u4) project's `FileFormats.md`. Game logic and memory layout: [u4-decompiled](https://github.com/ergonomy-joe/u4-decompiled).
