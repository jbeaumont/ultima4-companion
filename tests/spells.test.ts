// The spellbook against the game: costs (U4_SPELL.C D_208C), recipes (U4_MIX.C
// D_277E, bit 0x80 >> reagent letter A-H) and the manual's withheld recipes.
import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { SPELLS } from '@domain/constants'
import { SPELLBOOK, canMix, castersOf, recipeShown, reagentsOf, worksIn } from '@domain/spells'

const D_208C = [5, 15, 5, 20, 10, 15, 40, 10, 20, 30, 25, 5, 5, 20, 5, 15, 20, 45, 15, 30, 15, 15, 10, 15, 10, 5]
// RG_ash 0x80, ginseng 0x40, garlic 0x20, spider silk 0x10, blood moss 0x08, black pearl 0x04, nightshade 0x02, mandrake 0x01
const D_277E = [0x60, 0x18, 0x60, 0xa4, 0x94, 0x84, 0x85, 0x50, 0x05, 0x07, 0x06, 0x80, 0x84, 0xa1, 0x88, 0xe0, 0xc8, 0xf9, 0x50, 0x89, 0xa0, 0x03, 0x88, 0x98, 0x18, 0x18]

describe('spellbook', () => {
  it("matches the game's spell table, costs and recipes", () => {
    expect(SPELLBOOK.map((s) => s.name)).toEqual([...SPELLS])
    expect(SPELLBOOK.map((s) => s.letter).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    expect(SPELLBOOK.map((s) => s.mp)).toEqual(D_208C)
    expect(SPELLBOOK.map((s) => s.mask)).toEqual(D_277E)
  })

  it('only Gate, Resurrect and Undead are left out of the manual', () => {
    expect(SPELLBOOK.filter((s) => !s.inManual).map((s) => s.letter)).toEqual(['G', 'R', 'U'])
  })

  it('withheld recipes show at Full or once mixed; manual ones always', () => {
    const p = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
    const gate = SPELLBOOK[6]!
    expect(recipeShown(gate, 'nudges', p)).toBe(false)
    expect(recipeShown(gate, 'full', p)).toBe(true)
    p.mixtures[6] = 1
    expect(recipeShown(gate, 'off', p)).toBe(true)
    expect(recipeShown(SPELLBOOK[2]!, 'off', null)).toBe(true)
  })

  it('counts what the reagents can make and who can cast', () => {
    const blank = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
    const me = { ...blank.allRecords[0]!, name: 'Avatar', mp: 12, status: 'G' }
    const p = { ...blank, members: [me], memberCount: 1, reagents: [3, 5, 2, 0, 0, 0, 0, 0] }
    const cure = SPELLBOOK[2]!
    expect(reagentsOf(cure.mask)).toEqual([1, 2]) // ginseng, garlic
    expect(canMix(p, cure)).toBe(2)
    expect(canMix(p, SPELLBOOK[7]!)).toBe(0) // heal needs spider silk
    expect(castersOf(p, cure)).toEqual(['Avatar'])
    expect(castersOf(p, SPELLBOOK[3]!)).toEqual([]) // dispel costs 20
  })

  it('knows where each spell works', () => {
    const by = (l: string) => SPELLBOOK.find((s) => s.letter === l)!
    expect(worksIn(by('L'), 'dungeon')).toBe(true)
    expect(worksIn(by('L'), 'outdoors')).toBe(false)
    expect(worksIn(by('M'), 'combat')).toBe(true)
    expect(worksIn(by('G'), 'outdoors')).toBe(true)
    expect(worksIn(by('R'), 'combat')).toBe(false)
    expect(worksIn(by('E'), 'town')).toBe(false)
  })
})
