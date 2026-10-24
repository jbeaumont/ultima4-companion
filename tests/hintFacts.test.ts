// Hint facts checked against the game: the search table (u4-decompiled U4_SRCH.C
// D_2920, every place where Search finds something), the mantra table (U4_SHRIN.C
// D_8322) and what the named people actually say (data/dialogue.json).
import { describe, expect, it } from 'vitest'
import dialogue from '../data/dialogue.json'
import { HINTS } from '@domain/hints'
import { SECRET_SPOTS } from '@domain/places'
import { flat } from '@domain/talkSim'

// [location (0 = surface), x, y, what is found]
const SEARCH_TABLE: [number, number, number, string][] = [
  [0, 0xb6, 0x36, 'mandrake'], [0, 0x64, 0xa5, 'mandrake'], [0, 0x2e, 0x95, 'nightshade'], [0, 0xcd, 0x2c, 'nightshade'],
  [0, 0xb0, 0xd0, 'bell'], [0, 0x2d, 0xad, 'horn'], [0, 0x60, 0xd7, 'wheel'], [0, 0xc5, 0xf5, 'skull'],
  [0, 0xe0, 0x85, 'blackStone'], [0, 0x40, 0x50, 'whiteStone'],
  [2, 6, 6, 'book'], [16, 22, 1, 'candle'], [3, 22, 4, 'mystic armour'], [4, 8, 15, 'mystic weapons'],
  [5, 8, 6, 'rune-honesty'], [6, 25, 1, 'rune-compassion'], [7, 30, 30, 'rune-valor'], [8, 13, 6, 'rune-justice'],
  [9, 28, 30, 'rune-sacrifice'], [10, 2, 29, 'rune-honor'], [1, 17, 8, 'rune-spirituality'], [13, 29, 29, 'rune-humility']
]
const MANTRAS = ['ahm', 'mu', 'ra', 'beh', 'cah', 'summ', 'om', 'lum']
const VIRTUES = ['honesty', 'compassion', 'valor', 'justice', 'sacrifice', 'honor', 'spirituality', 'humility']

const towns = (Array.isArray(dialogue) ? dialogue : (dialogue as { towns: unknown[] }).towns) as {
  location: string
  npcs: Record<string, string>[]
}[]
const says = (location: string, name: string): string => {
  const n = towns.find((t) => t.location === location)?.npcs.find((x) => flat(x['name'] ?? '') === flat(name))
  return n ? ['job', 'health', 'keyword1Response', 'keyword2Response', 'question', 'yesResponse', 'noResponse'].map((k) => flat(n[k] ?? '')).join(' | ') : ''
}

describe('hints match the game', () => {
  it('surface search spots are where the game finds things', () => {
    for (const [loc, x, y, what] of SEARCH_TABLE.filter((r) => r[0] === 0)) {
      const spot = (SECRET_SPOTS as Record<string, { x: number; y: number }>)[what === 'mandrake' || what === 'nightshade' ? `${what}${SEARCH_TABLE.filter((r) => r[3] === what).findIndex((r) => r[1] === x) + 1}` : what]
      expect(spot, `${what} at ${x},${y}`).toEqual({ x, y })
      void loc
    }
  })

  it('each rune answer names the town spot where the game finds the rune', () => {
    for (const [, x, y, what] of SEARCH_TABLE.filter((r) => r[3].startsWith('rune-'))) {
      const h = HINTS.find((t) => t.id === what)!
      expect(h.tiers[2], what).toContain(`town map ${x},${y}`)
    }
  })

  it('the book, candle and mystic arms answers name the right spots', () => {
    const answer = (id: string) => HINTS.find((h) => h.id === id)!.tiers[2]
    expect(answer('item-book')).toContain('6,6')
    expect(answer('item-candle')).toContain('22,1')
    expect(answer('item-mystic')).toMatch(/22,4[^]*8,15/)
  })

  it('mantra answers are the game\'s mantras, and the first person named says it', () => {
    VIRTUES.forEach((v, i) => {
      const h = HINTS.find((t) => t.id === `mantra-${v}`)!
      expect(h.tiers[2].toLowerCase(), v).toContain(MANTRAS[i])
      const s = h.sources![0]!
      const word = MANTRAS[i]!.toUpperCase()
      const spoken = says(s.location, s.npc)
      // humility's mantra is learned reversed, from the mantra of pride
      const heard = new RegExp(`\\b(${word}|${[...word].reverse().join('')})\\b`, 'i').test(spoken)
      expect(heard, `${v}: ${s.npc} in ${s.location} says "${spoken.slice(0, 80)}"`).toBe(true)
    })
  })
})

// U4_USE.C D_010E (stone bits per altar room), D_261A (the dungeons each room joins), the
// Abyss altars (level z asks for virtue z and stone z), the entrance at 233,233 (bell, book,
// candle in order) and U4_END.C (the word, the eight virtues, truth/love/courage, infinity)
const STONES = ['blue', 'yellow', 'red', 'green', 'orange', 'purple', 'white', 'black']
const ALTAR_ROOMS: [string, number[], string[]][] = [
  ['Truth', [6, 5, 3, 0], ['Deceit', 'Shame', 'Hythloth', 'Wrong']],
  ['Love', [6, 4, 3, 1], ['Despise', 'Wrong', 'Hythloth', 'Covetous']],
  ['Courage', [6, 5, 4, 2], ['Destard', 'Covetous', 'Hythloth', 'Shame']]
]

describe('quest endgame hints match the game', () => {
  const answer = (id: string) => HINTS.find((h) => h.id === id)!.tiers[2]

  it('each altar room takes the right four stones and joins the right dungeons', () => {
    const text = answer('altar-rooms')
    for (const [key, stones, dungeons] of ALTAR_ROOMS) {
      const part = new RegExp(`${key}: ([^(]*)\\(via ([^)]*)\\)`).exec(text)!
      expect(part, key).toBeTruthy()
      expect(part[1]!.split(/[ ,]+/).filter(Boolean).sort(), key).toEqual(stones.map((i) => STONES[i]).sort())
      expect(part[2]!.split(/, | or /).sort(), key).toEqual([...dungeons].sort())
    }
    expect(text).toMatch(/middle of the room/)
  })

  it("the Abyss altars ask for each level's virtue, then its stone", () => {
    const text = answer('abyss-altars')
    VIRTUES.forEach((v, z) => {
      expect(text.toLowerCase(), `level ${z + 1}`).toContain(`${z + 1} ${v}, ${STONES[z]}`)
    })
  })

  it('the entrance takes the bell, book and candle in that order; the word and the axiom', () => {
    expect(answer('abyss-entry')).toMatch(/bell, then the book, then the candle/)
    expect(answer('word-of-passage')).toContain('VERAMOCOR')
    expect(answer('codex')).toMatch(/INFINITY/)
    // the three lords say the three syllables
    expect(says('The Lycaeum', 'Robert Frasier')).toMatch(/'ver'/i)
    expect(says('Empath Abbey', 'Lord Robert')).toMatch(/'amo'/i)
    expect(says("Serpent's Hold", 'Sentri')).toMatch(/'cor'/i)
  })
})
