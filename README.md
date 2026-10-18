# ultima4-companion

A desktop companion for **Ultima IV: Quest of the Avatar** (GOG/DOS). It runs next to DOSBox, reads your game files, and shows a live tracker, maps, a quest journal and spoiler-gated hints.

## Getting started
```bash
npm install
npm run dev
```
To build a Windows installer: `npm run dist` (output in `release/`).

The app expects the GOG install at `C:\Program Files\GOG Galaxy\Games\Ultima 4`. Set `U4_DIR` to use a different path.

## Milestones
1. ✅ Scaffold (Electron + Vite + React + TS, Vitest)
2. ✅ Parsers for PARTY.SAV, MONSTERS.SAV, DNGMAP.SAV, WORLD.MAP, SHAPES.EGA, .ULT, .TLK, .DNG, .CON, plus `npm run extract`
3. ✅ Save-file watcher → live Tracker
4. ✅ Map: world, towns, dungeons
5. ✅ Journal, progress, cooldowns, moongates
6. ✅ Hints, dialogue explorer, clue capture
7. ✅ Live DOSBox memory mode, fog-of-war, compact HUD
8. ✅ Save snapshots → editor/cheats
9. ✅ Art gallery, dungeon tools, installer
10. ✅ AI sage (needs an Anthropic API key: Settings, ANTHROPIC_API_KEY, or `ant auth login`)

## Credits
File formats are from the [xu4](https://github.com/xu4-engine/u4) project's `FileFormats.md`. Game logic reference: [u4-decompiled](https://github.com/ergonomy-joe/u4-decompiled).
