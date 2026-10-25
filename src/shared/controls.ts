// Every control in one place for the Controls view: the game's commands (from the
// manual, checked against u4-decompiled's key handlers: U4_MAIN.C on the surface
// and in towns, U4_DNG.C in dungeons, U4_COMBA.C in combat), talking, the title
// screen, DOSBox's own keys (the DOSBox 0.74 manual; GOG ships no key remapping)
// and the companion's window menu (Electron's standard one).

export interface GameCommand {
  key: string
  name: string
  what: string
  /** Where the game accepts it; elsewhere it answers "Not here!" (or "Bad command!"). */
  surface: boolean
  dungeon: boolean
  combat: boolean
}

const c = (key: string, name: string, what: string, where: 'all' | 'notCombat' | 'surface' | 'surfaceCombat'): GameCommand => ({
  key, name, what,
  surface: true,
  dungeon: where === 'all' || where === 'notCombat',
  combat: where === 'all' || where === 'surfaceCombat'
})

export const GAME_COMMANDS: GameCommand[] = [
  c('A', 'Attack', 'Attack with the readied weapon; then a direction.', 'surfaceCombat'),
  c('B', 'Board', 'Board a ship or balloon, or mount a horse.', 'surface'),
  c('C', 'Cast', 'Cast a spell: the party member (not in combat), then the spell letter, then a target or direction. Needs a mixture and MP.', 'all'),
  c('D', 'Descend', 'Climb down a ladder (in dungeons, to the next level).', 'notCombat'),
  c('E', 'Enter', 'Enter a town, castle, dungeon or shrine you are standing on.', 'surface'),
  c('F', 'Fire', "Fire a ship's cannons; broadsides only, then a direction.", 'surface'),
  c('G', 'Get chest', 'Open a chest (the party member, except in combat). A high Dexterity avoids traps.', 'all'),
  c('H', 'Hole up', 'Camp to rest and heal; works only so often.', 'notCombat'),
  c('I', 'Ignite torch', 'Light a torch for the dungeon.', 'notCombat'),
  c('J', 'Jimmy lock', 'Unlock a locked door with a key; then the direction (east or west).', 'surface'),
  c('K', 'Klimb', 'Climb up a ladder; from a dungeon\'s top level, back to the surface.', 'notCombat'),
  c('L', 'Locate', 'Show your position (needs the sextant).', 'surface'),
  c('M', 'Mix', 'Mix reagents into a spell: the spell letter, the reagent letters, then Enter.', 'notCombat'),
  c('N', 'New order', 'Swap two party members (the Avatar always leads).', 'notCombat'),
  c('O', 'Open door', 'Open a door; then the direction (east or west).', 'surface'),
  c('P', 'Peer at gem', 'Look at the map from above (uses a gem).', 'notCombat'),
  c('Q', 'Quit & save', 'Save the game. Only works outdoors: towns and dungeons answer "Not Here!".', 'surface'),
  c('R', 'Ready weapon', 'Arm a party member with a weapon you own.', 'all'),
  c('S', 'Search', 'Search the spot you stand on for hidden things.', 'notCombat'),
  c('T', 'Talk', 'Talk to someone; then the direction (see Talking).', 'surface'),
  c('U', 'Use', 'Use a quest item; type its name.', 'all'),
  c('V', 'Volume', 'Sound effects on or off.', 'all'),
  c('W', 'Wear armour', 'Dress a party member in armour you own.', 'notCombat'),
  c('X', 'Xit', 'Leave your ship, horse or balloon and continue on foot.', 'surface'),
  c('Y', 'Yell', 'Speed up or slow down your horse.', 'surface'),
  c('Z', 'Ztats', 'A party member\'s status; 0 for weapons, armour, items, reagents and mixtures.', 'all')
]

export interface KeyRow {
  keys: string
  what: string
}

export const MOVING: KeyRow[] = [
  { keys: 'Arrow keys', what: 'Move north, south, east or west (surface, towns and combat).' },
  { keys: '↑ / ↓', what: 'In dungeons: forward and backward.' },
  { keys: '← / →', what: 'In dungeons: turn left and right.' },
  { keys: 'Space', what: 'Pass a turn. If you press nothing for a moment the game passes one by itself.' }
]

export const TALKING: KeyRow[] = [
  { keys: 'NAME, JOB, HEALTH', what: 'What everyone answers. Their replies hint at other words to ask about.' },
  { keys: 'LOOK', what: 'Look at the person again.' },
  { keys: 'JOIN', what: 'Ask a would-be companion to join the party.' },
  { keys: 'GIVE', what: 'Give to the poor (a beggar, for Compassion).' },
  { keys: 'Y / N', what: 'Answer a question. Answer honestly: lies are remembered.' },
  { keys: 'BYE', what: 'End the conversation politely.' },
  { keys: 'Any word', what: 'Only the first four letters count, so HONE asks about honesty.' }
]

export const TITLE_SCREEN: KeyRow[] = [
  { keys: 'Any key', what: 'Show the title menu.' },
  { keys: 'J', what: 'Journey Onward: continue your saved game.' },
  { keys: 'I', what: 'Initiate New Game: name, sex, then the fortune teller.' },
  { keys: 'A / B', what: "Choose a card in the fortune teller's questions (the companion can advise or answer)." }
]

export const DOSBOX_KEYS: KeyRow[] = [
  { keys: 'Alt+Enter', what: 'Full screen and back.' },
  { keys: 'Ctrl+F10', what: 'Release (or capture) the mouse.' },
  { keys: 'Ctrl+F11 / Ctrl+F12', what: 'Slower / faster. The companion\'s Game speed control presses these for you.' },
  { keys: 'Alt+Pause', what: 'Pause the emulation; press again to continue.' },
  { keys: 'Ctrl+F5', what: 'Save a screenshot (PNG, in DOSBox\'s capture folder).' },
  { keys: 'Ctrl+Alt+F5', what: 'Start or stop recording a video of the screen.' },
  { keys: 'Ctrl+F6', what: 'Start or stop recording the sound.' },
  { keys: 'Ctrl+F7 / Ctrl+F8', what: 'Fewer / more skipped frames.' },
  { keys: 'Ctrl+F1', what: 'Open DOSBox\'s key mapper.' },
  { keys: 'Ctrl+F9', what: 'Close DOSBox at once. Unsaved progress is lost: press Q outdoors first.' }
]

export const COMPANION_KEYS: KeyRow[] = [
  { keys: 'Ctrl+Plus / Ctrl+Minus / Ctrl+0', what: 'Zoom the companion in, out, or back to normal.' },
  { keys: 'F11', what: 'Companion window full screen.' },
  { keys: 'Ctrl+R', what: 'Reload the companion window.' },
  { keys: 'Ctrl+W', what: 'Close the window.' },
  { keys: 'Ctrl+C / Ctrl+V / Ctrl+A', what: 'Copy, paste, select all (journal notes, search boxes).' }
]
