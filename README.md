# Ultima IV Companion 1.0

A desktop companion for **Ultima IV: Quest of the Avatar**, the DRM-free GOG release that runs in DOSBox. Keep it open beside the game. It follows your Avatar move by move, reading the game's memory live (or your save file), and gives you the quest log, maps, spellbook and hints a modern player expects, without changing the game.

**[Download the Windows installer from the latest release](https://github.com/jbeaumont/ultima4-companion/releases/latest)**

## What's in 1.0

### Follows your game live
- **Dashboard:** your Avatar at a glance, with the eight virtues and how close each is to Elevation, runes, stones and quest items, companions and who would join you now, timers (meditation, camping, virtue conversations), the moons and today's moongate, and health and level-up alerts.
- **Suggested next:** what to do now. A new Avatar gets the opening steps (visit Lord British, find companions, mix spells, upgrade gear, talk to people). After that it suggests the next quest goals. When a goal needs preparation it says so: grow stronger before a deep stone, stock up before a dungeon, or get a ship for places you can't walk to.
- **Live battle view:** the battlefield, every foe's health, and your party while you fight.
- **Pop-out HUD:** a slim always-on-top strip with the party's health.
- **Tracker:** every number in your save.

### Find your way
- **Map:** Britannia, every town and castle, and every dungeon level, drawn from the game's own tiles. The party marker follows you and the map reveals as you explore.
- **Journal:** an automatic checklist of the whole quest, plus your own notes and the clues you save.
- **Hints:** a hint for every quest step, revealed one tier at a time (nudge, clue, answer) within the spoiler level you choose, and marked solved from your save.
- **Dialogue:** what everyone in Britannia says, unlocked as you visit their town, with a "talk to" simulator. The game's slur for the fortune teller is reworded.

### Magic and keys
- **Spellbook:** all 26 spells with what each does, its MP cost, where it works, its reagents, how many more you can mix, and who can cast it now. The three recipes the manual keeps secret stay hidden until you find them or choose full spoilers.
- **Controls:** every key, including the game's A–Z commands (and where each works), talking, the title screen, DOSBox's own hotkeys and the companion's.

### Starting a new game
- **Welcome:** a first-run guide to what the companion does, the save it found, and your spoiler level.
- **Fortune teller:** at character creation, pick the class you want and the companion tells you which card to choose, reading the cards live, or answers for you. You can also answer honestly with no help.
- **Playthroughs:** each character gets its own journal and map, and Snapshots shows each playthrough's saves (warning before you restore another's). A new playthrough waits for your new game instead of taking over the old character.

### Playing comfortably
- **Game speed:** Original (GOG's 500 cycles), Faster (the default) or Fast, set before launch or changed live while you play.
- **Play Ultima IV** launches the game beside the companion.
- **Snapshots:** Ultima IV has one save slot, so the companion keeps a copy every time it changes and can restore any of them.
- **Save editor:** off by default.
- **AI sage (optional, off by default):** ask Hawkwind or Lord British for advice in character, within your spoiler level. It uses your own Anthropic API key, runs on Claude Haiku 5.5 by default, and costs about 0.05 cents an answer.

## Spoilers your way
One setting decides how much help you see: **Off** (no hint text at all), **Nudges** (gentle first hints) or **Full** (clues and answers, one click at a time). Every view follows it, including the Sage, Suggested next, the Spellbook and the map of unvisited places.

## Install
1. Install Ultima IV from GOG. The companion expects `C:\Program Files\GOG Galaxy\Games\Ultima 4`; you can choose another folder in Settings.
2. Download and run the installer from [Releases](https://github.com/jbeaumont/ultima4-companion/releases/latest). It isn't code-signed, so Windows SmartScreen may ask you to confirm ("More info", then "Run anyway").
3. Open the companion. The welcome walks you through the rest; press **Play Ultima IV** to start.

Requires Windows 10 or 11. Upgrading installs over the previous version and keeps your data.

## Safe by design
- **The game folder is never changed.** The companion reads the game's files and memory.
- **It writes your save only when you ask:** a snapshot restore or a save-editor change. Both need DOSBox closed, take a backup first, and ask you to confirm.
- **Keys go to the game only when you ask:** the Game speed buttons and the fortune teller's "Answer for me". They press keys only while the game window is in front.
- **The Sage is the only part that talks to the internet:** only when you turn it on, with your own key, sending your question and a summary of your game state.

## Built from the game itself
The companion's facts come from the game, not from memory or wikis:
- **Formats:** every file is parsed with a test against the real install.
- **Rules:** taken from [u4-decompiled](https://github.com/ergonomy-joe/u4-decompiled). That covers spell costs and recipes, the fortune teller's rules, which commands work where, monster scaling, and the memory layout the live view reads.
- **Checked in play:** a headless play-test driver plays the real game in a separate test copy, and journeys check what the companion shows:
  - every rune, stone and quest item found where its hint says;
  - every class created through the fortune teller;
  - spells mixed and cast;
  - dungeons cleared with realistic parties to set the recommended levels.

## Build from source
```bash
npm install
npm test
npm run dev
```
- `npm run dev:test` starts a separate test instance with its own data and saves, for play-testing without touching your real game.
- `npm run dist` builds the Windows installer into `release/`.

You need Node.js 24 and your own copy of the game; game files are never committed. Contributors (people and AI agents) should read [CONTRIBUTING.md](CONTRIBUTING.md); agents also follow [CLAUDE.md](CLAUDE.md).

```
src/parsers/        byte parsers for every game file and the battle state in memory
src/domain/         game rules: progress, hints, spells, routes, battle planning, guidance
src/shared/         rules shared by both processes: spoilers, fortune teller, controls, speed
src/main/           Electron main: save watcher, DOSBox memory reader, launcher, snapshots
src/renderer/       the React interface
scripts/driver/     the headless play-test driver
scripts/hillclimb/  journeys that play the game and check the companion
tests/              Vitest; tests that need the install skip without it
```

## Credits
Ultima IV is © Origin Systems / Electronic Arts; this is an unofficial fan project. File formats from the [xu4](https://github.com/xu4-engine/u4) project's `FileFormats.md`. Game logic and memory layout from [u4-decompiled](https://github.com/ergonomy-joe/u4-decompiled) by Ergonomy Joe.

Feedback and bugs: [GitHub issues](https://github.com/jbeaumont/ultima4-companion/issues).
