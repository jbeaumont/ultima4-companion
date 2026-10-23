// Tiered hints (nudge -> clue -> answer) in our own words. Every fact is checked
// against xu4 (module/Ultima-IV/maps.b labels, item.cpp altar rules, codex.cpp) and
// the game's own dialogue; `sources` name NPCs that give the clue in-game, and
// tests verify each one exists in data/dialogue.json.
import type { Progress } from './progress'
import { SECRET_SPOTS } from './places'
import { toSextant } from './sextant'

export type HintCategory = 'basics' | 'runes' | 'mantras' | 'stones' | 'items' | 'altars' | 'abyss'
export type SpoilerLevel = 'off' | 'nudges' | 'full'

export interface HintSource {
  location: string // LOCATIONS name, as in data/dialogue.json
  npc: string
}

export interface HintTopic {
  id: string
  title: string
  category: HintCategory
  /** [nudge, clue, answer] */
  tiers: [string, string, string]
  /** Progress checklist ids that, all done, mark this topic solved. */
  solvedBy?: string[]
  /** Topic ids worth finishing first; used to suggest what to do next. */
  after?: string[]
  /** LOCATIONS ids where this topic is most relevant. */
  relevantAt?: number[]
  sources?: HintSource[]
}

const at = (spot: keyof typeof SECRET_SPOTS) => {
  const { x, y } = SECRET_SPOTS[spot]
  return `${toSextant(x, y)} (map ${x},${y})`
}

const rune = (
  virtue: string, town: string, townId: number, nudge: string, clue: string, answer: string, sources: HintSource[]
): HintTopic => ({
  id: `rune-${virtue.toLowerCase()}`,
  title: `Rune of ${virtue}`,
  category: 'runes',
  tiers: [nudge, clue, answer],
  solvedBy: [`rune-${virtue}`],
  relevantAt: [townId],
  sources: sources.map((s) => ({ location: s.location || town, npc: s.npc }))
})

const mantra = (virtue: string, word: string, nudge: string, clue: string, sources: HintSource[], shrineId: number): HintTopic => ({
  id: `mantra-${virtue.toLowerCase()}`,
  title: `Mantra of ${virtue}`,
  category: 'mantras',
  tiers: [nudge, clue, `The mantra is ${word.toUpperCase()}.`],
  solvedBy: [`avatar-${virtue}`],
  relevantAt: [shrineId],
  sources
})

// What stands between the entrance and each altar, from the dungeon files (rooms, their exits
// and triggers, energy fields; see tests/hints.test.ts). Despise was also played through.
const DISPEL = 'Energy fields seal the way: bring a Dispel mixture (D: Sulfurous Ash, Garlic, Black Pearl) and cast it facing the field.'
const SWITCH = 'The way runs through a room with a hidden switch: after the fight, step on the odd floor tile to open a path.'
const ALTAR_WAY: Record<string, string> = {
  Deceit: DISPEL,
  Despise: `${DISPEL} The altar lies north of a room: in that room step on the plate in the east, then on the one that appears in the south-west, to raise a bridge north over the water, and leave the room northward onto the altar.`,
  Wrong: DISPEL,
  Covetous: SWITCH,
  Shame: SWITCH,
  Destard: 'Expect to fight through several rooms on the way down.'
}

const stone = (color: string, virtue: string, dungeon: string, dungeonId: number, level: number, nudge: string, sources: HintSource[]): HintTopic => ({
  id: `stone-${color.toLowerCase()}`,
  title: `${color} Stone (${virtue})`,
  category: 'stones',
  tiers: [
    nudge,
    `It rests on an altar in the dungeon ${dungeon}.`,
    `Descend to level ${level} of ${dungeon} and search the altar there. ${ALTAR_WAY[dungeon] ?? ''}`.trim()
  ],
  solvedBy: [`stone-${color}`],
  relevantAt: [dungeonId],
  sources
})

export const HINTS: HintTopic[] = [
  // --- Basics ---
  {
    id: 'avatarhood',
    title: 'Becoming a partial Avatar',
    category: 'basics',
    tiers: [
      'Each virtue needs to grow through your deeds before a shrine will reward you.',
      'Raise a virtue fully through matching good deeds, then meditate at its shrine. You need the rune to enter and the mantra to meditate.',
      'When a virtue reaches full karma (99), meditate at its shrine for 3 cycles with its mantra. Its karma resets to 0, which this app shows as a partial Avatarhood.'
    ],
    solvedBy: ['avatar-Honesty', 'avatar-Compassion', 'avatar-Valor', 'avatar-Justice', 'avatar-Sacrifice', 'avatar-Honor', 'avatar-Spirituality', 'avatar-Humility'],
    sources: [{ location: "Lord British's Castle", npc: 'Sheila' }]
  },
  {
    id: 'meditation-cycles',
    title: 'Learning from the shrines',
    category: 'basics',
    tiers: [
      'Shrines teach more the longer you meditate.',
      'Meditating for 1, 2 and 3 cycles reveals different wisdom. The shrines of Honesty, Compassion and Valor hold codex lore.',
      'Visit each shrine for 1, 2 and 3 cycles, and write down what the visions say. Wait about 100 moves between meditations (see the Journal timers).'
    ],
    sources: [{ location: 'Vesper', npc: 'Randal' }, { location: 'Cove', npc: 'Blissful' }]
  },

  // --- Runes ---
  rune('Honesty', 'Moonglow', 5, 'The rune of the town of truth is hidden in Moonglow.', 'A boy in Moonglow eating a sandwich knows where it is. His friend Christen will point you to him.',
    'In Moonglow, search "by Mariah\'s gold" at town map 8,6, in the north-west of town.', [{ location: 'Moonglow', npc: 'William' }, { location: 'Moonglow', npc: 'Christen' }]),
  rune('Compassion', 'Britain', 6, 'The rune lies within Britain.', 'Ask the fighting bard Pepper about it. The beggar Sprite will send you there if you help him.',
    'Search at the end of the hall on Britain\'s northern edge (town map 25,1).', [{ location: 'Britain', npc: 'Pepper' }, { location: 'Britain', npc: 'Sprite' }]),
  rune('Valor', 'Jhelom', 7, 'The rune is hidden in Jhelom.', 'Nostro, walled into the passages, knows. Lord Robert sends you to him.',
    'It is buried in a tower in Jhelom, in the far south-east corner (town map 30,30).', [{ location: 'Jhelom', npc: 'Nostro' }, { location: 'Jhelom', npc: 'Lord Robert' }]),
  rune('Justice', 'Yew', 8,'The rune is in Yew, the city of justice.', 'The druids of Yew send you to Talfourd, who knows where it is.',
    'Search in Yew at town map 13,6, in the north of the town.', [{ location: 'Yew', npc: 'Druid' }]),
  rune('Sacrifice', 'Minoc', 9, 'The rune is in Minoc, the town of sacrifice.', 'Azure carves runes and sends you to her sister Mischief. It is "within the fires of the forge".',
    'Search the forge fire in Minoc\'s south-east corner (town map 28,30).', [{ location: 'Minoc', npc: 'Mischief' }, { location: 'Minoc', npc: 'Azure' }]),
  rune('Honor', 'Trinsic', 10, 'The rune is hidden in Trinsic.', 'Winthrop trades in rumours and sends you to the child Terrin.',
    'It is buried in the south-west corner of Trinsic (town map 2,29).', [{ location: 'Trinsic', npc: 'Terrin' }, { location: 'Trinsic', npc: 'Winthrop' }, { location: 'Trinsic', npc: 'Kline' }]),
  rune('Spirituality', "Lord British's Castle", 1, 'Skara Brae\'s rune is missing from the town.', 'The ankh in Skara Brae knows. The rune is in the treasure chamber of Britannia.',
    'Search in Lord British\'s castle treasure room, on the ground floor (town map 17,8).', [{ location: 'Skara Brae', npc: 'the Ankh of\nSpirituality' }, { location: 'Minoc', npc: 'Mike Ward' }]),
  rune('Humility', 'Paws', 13, 'The rune of humility was banished from its city.', 'The ghost Nate in Magincia says to ask Barren in Paws.',
    'It is hidden in Paws, in the far south-east corner (town map 29,29).', [{ location: 'Magincia', npc: 'Nate' }]),

  // --- Mantras ---
  mantra('Honesty', 'ahm', 'Someone in Moonglow speaks of honesty and its chant.', 'Ask Cromwell in Moonglow about the mantra.', [{ location: 'Moonglow', npc: 'Cromwell' }], 25),
  mantra('Compassion', 'mu', 'A playing child in Britain knows the chant.', 'Ask Cricket in Britain, quietly.', [{ location: 'Britain', npc: 'Cricket' }, { location: 'Britain', npc: 'a child' }], 26),
  mantra('Valor', 'ra', 'A Jhelom warrior keeps the chant.', 'Sir Hrothgar sends you to Aesop in Jhelom.', [{ location: 'Jhelom', npc: 'Aesop' }, { location: 'Jhelom', npc: 'Sir Hrothgar' }], 27),
  mantra('Justice', 'beh', 'The druids of Yew chant it.', 'Pinrod says the druids of Yew chant the mantra.', [{ location: 'Yew', npc: 'Pinrod' }], 28),
  mantra('Sacrifice', 'cah', 'A hidden shepherd near Minoc knows it.', 'The song of Singsong the bard in Minoc contains it: listen for what the raven says.', [{ location: 'Minoc', npc: 'Singsong' }, { location: 'Minoc', npc: 'Merida' }], 29),
  mantra('Honor', 'summ', 'Someone in Trinsic seeking the shrine knows it.', 'Ask Kline in Trinsic.', [{ location: 'Trinsic', npc: 'Kline' }], 30),
  mantra('Spirituality', 'om', 'Skara Brae keeps the secret.', 'The ankh in Skara Brae and Ambule both know it.', [{ location: 'Skara Brae', npc: 'Granted' }], 31),
  mantra('Humility', 'lum', 'Humility is the opposite of pride, and so is its chant.', 'The hanged ghost Faultless in Magincia gives the mantra of pride. Reverse it.', [{ location: 'Magincia', npc: 'Faultless' }, { location: 'Vesper', npc: 'Gem' }], 32),
  {
    id: 'shrine-spirituality',
    title: 'Reaching the Shrine of Spirituality',
    category: 'mantras',
    tiers: [
      'This shrine has no road. You reach it by magic.',
      'Enter "the gate of full moons" while carrying the Rune of Spirituality.',
      'Step into the moongate near Minoc when both Trammel and Felucca are full (phase 4 and 4). The Journal\'s moongate planner shows when.'
    ],
    solvedBy: ['avatar-Spirituality'],
    after: ['rune-spirituality'],
    sources: [{ location: 'Skara Brae', npc: 'the Ankh of\nSpirituality' }]
  },
  {
    id: 'shrine-humility',
    title: 'Entering the Shrine of Humility',
    category: 'mantras',
    tiers: [
      'A daemon guards the dark island shrine.',
      'The silver horn will drive off the shrine\'s guardians.',
      'Get the Silver Horn first, then use it as you approach the Shrine of Humility.'
    ],
    solvedBy: ['avatar-Humility'],
    after: ['item-horn'],
    sources: [{ location: 'Magincia', npc: 'Banter' }, { location: 'Vesper', npc: 'Joseph' }]
  },

  // --- Stones ---
  stone('Blue', 'Honesty', 'Deceit', 17, 7, 'The stone of honesty lies in a dungeon named for honesty\'s opposite.', [{ location: 'Moonglow', npc: 'Tyrone' }]),
  stone('Yellow', 'Compassion', 'Despise', 18, 5, 'A drunk in Britain mutters about it.', [{ location: 'Britain', npc: 'Joe' }]),
  stone('Red', 'Valor', 'Destard', 19, 7, 'Dungeon delvers in Jhelom have seen it.', [{ location: 'Jhelom', npc: 'Gravnor' }, { location: 'Jhelom', npc: 'X' }]),
  stone('Green', 'Justice', 'Wrong', 20, 8, 'Yew\'s druids name the dungeon it hides in.', [{ location: 'Yew', npc: 'Druid' }]),
  stone('Orange', 'Sacrifice', 'Covetous', 21, 7, 'The orange stone of sacrifice is used in two altar rooms.', [{ location: 'Minoc', npc: 'Alkerion' }]),
  stone('Purple', 'Honor', 'Shame', 22, 2, 'Someone from a dungeon below Trinsic has seen it.', [{ location: 'Trinsic', npc: 'Skitle' }, { location: 'Trinsic', npc: 'Quix' }]),
  {
    id: 'stone-white',
    title: 'White Stone (Spirituality)',
    category: 'stones',
    tiers: [
      'It is no longer in a dungeon.',
      'It sits atop the Serpent\'s Spine mountains, reachable only by someone floating in the clouds.',
      `Fly the balloon to the mountain top at ${at('whiteStone')} and search there.`
    ],
    solvedBy: ['stone-White'],
    after: ['item-balloon'],
    sources: [{ location: 'Skara Brae', npc: 'Isaac' }, { location: 'Skara Brae', npc: 'Mitre' }]
  },
  {
    id: 'stone-black',
    title: 'Black Stone (Humility)',
    category: 'stones',
    tiers: [
      'The black stone is caught in a moongate.',
      'Stand where the gate of both dark moons appears, and search when the moons go dark.',
      `When Trammel and Felucca are both new, stand on the Moonglow moongate at ${at('blackStone')} and search.`
    ],
    solvedBy: ['stone-Black'],
    sources: [{ location: 'Cove', npc: 'Merlin' }, { location: 'Magincia', npc: 'Nate' }]
  },

  // --- Items ---
  {
    id: 'item-bell',
    title: 'The Bell of Courage',
    category: 'items',
    tiers: [
      'Courage\'s bell lies under the sea.',
      'A fighter at Serpent\'s Hold knows its coordinates. You need a ship and a sextant.',
      `Sail to ${at('bell')} and search there from the ship.`
    ],
    solvedBy: ['bell'],
    sources: [{ location: "Serpent's Hold", npc: 'Garam' }, { location: "Serpent's Hold", npc: 'Sister Antos' }]
  },
  {
    id: 'item-book',
    title: 'The Book of Truth',
    category: 'items',
    tiers: [
      'Truth\'s book is kept where other books lie.',
      'It is in the Lycaeum library, filed under "T".',
      'Search in the Lycaeum library at town map 6,6.'
    ],
    solvedBy: ['book'],
    sources: [{ location: 'The Lycaeum', npc: 'Father Antos' }, { location: 'The Lycaeum', npc: 'Lord Terence' }]
  },
  {
    id: 'item-candle',
    title: 'The Candle of Love',
    category: 'items',
    tiers: [
      'Love\'s candle is in a secret place off Lock Lake.',
      'Cove is the hidden village by Lock Lake. Look there.',
      'Search in the north of Cove (town map 22,1).'
    ],
    solvedBy: ['candle'],
    sources: [{ location: 'Empath Abbey', npc: 'Derek the Bard' }, { location: 'Empath Abbey', npc: 'Brother Antos' }]
  },
  {
    id: 'item-horn',
    title: 'The Silver Horn',
    category: 'items',
    tiers: [
      'A paladin at Empath Abbey can lead you to it.',
      'It is buried on a small isle off the tip of Spiritwood.',
      `Search on the islet at ${at('horn')}.`
    ],
    solvedBy: ['horn'],
    sources: [{ location: 'Empath Abbey', npc: 'Malchor' }, { location: 'Empath Abbey', npc: 'Suzanna' }, { location: 'Magincia', npc: 'Demitry' }]
  },
  {
    id: 'item-wheel',
    title: 'The Wheel of the H.M.S. Cape',
    category: 'items',
    tiers: [
      'A famous ship sank and took a magic wheel with it.',
      'The H.M.S. Cape went down in the deep waters of the bay at the Cape of Heroes.',
      `Sail to ${at('wheel')} and search. The wheel strengthens your ship's hull.`
    ],
    solvedBy: ['wheel'],
    sources: [{ location: "Serpent's Hold", npc: 'Lassorn' }, { location: "Serpent's Hold", npc: 'Noxum' }]
  },
  {
    id: 'item-skull',
    title: 'The Skull of Mondain',
    category: 'items',
    tiers: [
      'An evil artifact of Mondain remains in the world. Never use it except to destroy it.',
      'Ask at the pub in Buccaneer\'s Den. A penitent in Minoc confesses where it lies.',
      `Search at ${at('skull')} when both moons are new. Cast it into the Abyss to destroy it.`
    ],
    solvedBy: ['skull'],
    sources: [{ location: 'Britain', npc: 'Sebastian' }, { location: 'Minoc', npc: 'Jude' }, { location: "Buccaneer's Den", npc: 'Ragnar' }]
  },
  {
    id: 'item-mystic',
    title: 'Mystic Arms',
    category: 'items',
    tiers: [
      'The smith Zircon in Minoc forged arms that will save you in the Abyss.',
      'Only an eight-part Avatar can claim them. Their keepers are in Paws.',
      'Once you are 8 parts Avatar, search the Empath Abbey oak grove for the Mystic Robes (town map 22,4) and the Serpent\'s Hold training room for the Mystic Swords (town map 8,15).'
    ],
    after: ['avatarhood'],
    sources: [{ location: 'Minoc', npc: 'Zircon' }, { location: 'Paws', npc: 'Sir Simon' }, { location: 'Paws', npc: 'Lady Tessa' }]
  },
  {
    id: 'item-balloon',
    title: 'Flying',
    category: 'items',
    tiers: [
      'Some places can only be reached through the clouds.',
      'A balloon waits by the surface entrance of Hythloth. That dungeon can also be reached by a secret way down from Lord British\'s castle.',
      `The balloon is at ${at('balloon')}, beside Hythloth's entrance. Take the ladder down in Lord British's castle, go through Hythloth, and come out by the balloon.`
    ],
    sources: [{ location: "Buccaneer's Den", npc: 'Jeremy James\nScirlock' }]
  },
  {
    id: 'reagents-rare',
    title: 'Mandrake and Nightshade',
    category: 'items',
    tiers: [
      'The two rarest reagents can only be gathered in the dark.',
      'Mandrake grows in the Fens of the Dead and the Bloody Plains. Nightshade grows near a spot a Trinsic mage knows. Search only when both moons are new.',
      `Mandrake: ${at('mandrake1')} or ${at('mandrake2')}. Nightshade: ${at('nightshade1')} or ${at('nightshade2')}. Search when both moons are new and the Journal's reagent timer is ready.`
    ],
    sources: [{ location: 'Yew', npc: 'Calumny' }, { location: 'Trinsic', npc: 'Virgil' }]
  },

  // --- Altars and the key ---
  {
    id: 'altar-rooms',
    title: 'The three altar rooms',
    category: 'altars',
    tiers: [
      'Three altar rooms connect the bottom levels of all eight dungeons.',
      'Each altar room takes four stones, and each gives one part of a three-part key: Truth, Love and Courage.',
      'Truth: white, purple, green, blue (via Deceit, Shame, Wrong or Hythloth). Love: white, yellow, green, orange (via Despise, Wrong, Covetous or Hythloth). Courage: white, red, purple, orange (via Destard, Covetous, Shame or Hythloth). Use the stones on the altar.'
    ],
    solvedBy: ['keyT', 'keyL', 'keyC'],
    sources: [{ location: "Lord British's Castle", npc: 'Water' }, { location: "Serpent's Hold", npc: 'Shyra' }, { location: 'Jhelom', npc: 'Bengrod' }, { location: 'The Lycaeum', npc: 'Tymus' }]
  },

  // --- Abyss ---
  {
    id: 'abyss-entry',
    title: 'Entering the Abyss',
    category: 'abyss',
    tiers: [
      'The Abyss lies on an island in the far south-east, and its entrance is sealed.',
      'You need the Bell of Courage, the Book of Truth and the Candle of Love at the entrance, as the Antos of the three castles say.',
      'Stand at the Abyss entrance and use the bell, then the book, then the candle.'
    ],
    solvedBy: ['bellUsed', 'bookUsed', 'candleUsed'],
    after: ['item-bell', 'item-book', 'item-candle'],
    sources: [{ location: "Lord British's Castle", npc: 'Zorin' }, { location: 'Empath Abbey', npc: 'Brother Antos' }]
  },
  {
    id: 'abyss-altars',
    title: 'The altars of the Abyss',
    category: 'abyss',
    tiers: [
      'Each level of the Abyss has an altar that asks for a stone.',
      'The stones are asked for in virtue order, one per level.',
      'Level 1 blue, 2 yellow, 3 red, 4 green, 5 orange, 6 purple, 7 white, 8 black.'
    ],
    after: ['altar-rooms', 'abyss-entry']
  },
  {
    id: 'word-of-passage',
    title: 'The Word of Passage',
    category: 'abyss',
    tiers: [
      'A word of passage is needed at the last gate.',
      'The lords of the three castles of the principles each know one syllable.',
      'Lycaeum: VER. Empath Abbey: AMO. Serpent\'s Hold: COR. The word is VERAMOCOR.'
    ],
    sources: [{ location: 'Skara Brae', npc: 'Romasco' }, { location: 'Cove', npc: 'Brother Zair' }, { location: 'The Lycaeum', npc: 'Robert Frasier' }, { location: 'Empath Abbey', npc: 'Lord Robert' }, { location: "Serpent's Hold", npc: 'Sentri' }]
  },
  {
    id: 'codex',
    title: 'The Chamber of the Codex',
    category: 'abyss',
    tiers: [
      'Entering the chamber takes all eight Avatarhoods, the three-part key, the word of passage and the one pure axiom.',
      'The axiom combines truth, love and courage. It is "the measure of time and space", more endless than the tides.',
      'Name the eight virtues as each is asked, then Truth, Love and Courage. The final answer is INFINITY.'
    ],
    after: ['word-of-passage', 'abyss-altars'],
    sources: [{ location: 'Cove', npc: 'the ankh' }, { location: 'Cove', npc: 'Spellbind' }, { location: 'Cove', npc: 'Shaman' }]
  }
]

// --- Gating rules ---

/** Highest tier (1-based count) a spoiler level allows. */
export const maxTier = (level: SpoilerLevel): number => (level === 'off' ? 0 : level === 'nudges' ? 1 : 3)

/** Tiers that may be shown: what the user has revealed, capped by the spoiler level. */
export function visibleTiers(topic: HintTopic, level: SpoilerLevel, revealed: number): string[] {
  return topic.tiers.slice(0, Math.max(0, Math.min(revealed, maxTier(level))))
}

/** Whether another tier can be revealed with a click. */
export const canReveal = (level: SpoilerLevel, revealed: number): boolean => revealed < maxTier(level)

export function isSolved(topic: HintTopic, p: Progress | null): boolean {
  if (!p || !topic.solvedBy?.length) return false
  const done = new Set(p.checklist.filter((c) => c.done).map((c) => c.id))
  return topic.solvedBy.every((id) => done.has(id))
}

/** Unsolved topics whose prerequisites are solved, most relevant to `location` first. */
export function suggestedTopics(p: Progress | null, location = 0, hints = HINTS): HintTopic[] {
  const solved = new Set(hints.filter((h) => isSolved(h, p)).map((h) => h.id))
  return hints
    .filter((h) => h.solvedBy?.length && !solved.has(h.id) && (h.after ?? []).every((a) => solved.has(a) || !hints.find((x) => x.id === a)?.solvedBy))
    .sort((a, b) => Number(b.relevantAt?.includes(location) ?? false) - Number(a.relevantAt?.includes(location) ?? false))
}

// --- Dialogue gating ---

export type DialogueMode = 'visited' | 'all'

/** Settlements whose dialogue may be shown. */
export const dialogueUnlocked = (locationId: number, mode: DialogueMode, visited: readonly number[]): boolean =>
  mode === 'all' || visited.includes(locationId)

/** Add the party's current settlement (ids 1-16) to the visited list. */
export function recordVisit(visited: readonly number[], location: number): number[] {
  if (location < 1 || location > 16 || visited.includes(location)) return [...visited]
  return [...visited, location].sort((a, b) => a - b)
}
