// Opening steps in Suggested next (#71).
import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import type { PartySave } from '@parsers/party'
import { nextSteps } from '@domain/guidance'
import { openingSteps } from '@domain/opening'
import { LOCATIONS } from '@domain/constants'

// a new game as PARTY.NEW makes it: a lone level 2 Mage with a staff, cloth, 200 gold and 300 food, in Britannia
function fixture(): PartySave {
  const blank = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
  const me = { ...blank.allRecords[0]!, name: 'Avatar', classIndex: 0, hp: 200, hpMax: 200, xp: 0, status: 'G', weapon: 1, armor: 1 }
  const allRecords = [me, ...blank.allRecords.slice(1)]
  return { ...blank, allRecords, members: [me], memberCount: 1, gold: 200, food: 30000, location: 0, karma: [65, 50, 50, 55, 60, 55, 50, 50] }
}
const fresh = { visited: [], met: [] }

describe('opening steps', () => {
  it('a new Avatar is told to visit Lord British and find companions before the quest topics', () => {
    const p = fixture()
    p.memberCount = 1
    p.location = 0
    const steps = nextSteps(p, 'nudges', fresh)
    expect(steps.slice(0, 2).map((s) => s.id)).toEqual(['opening-lord-british', 'opening-companions'])
    expect(steps.length).toBe(4)
    expect(steps.slice(2).every((s) => !s.opening)).toBe(true)
  })

  it('each step drops away once done', () => {
    const p = fixture()
    p.memberCount = 3
    p.mixtures = p.mixtures.map(() => 1)
    const ids = openingSteps(p, 'nudges', { visited: [1], met: ['5|A', '5|B', '5|C'] }).map((s) => s.id)
    expect(ids).not.toContain('opening-lord-british')
    expect(ids).not.toContain('opening-companions')
    expect(ids).not.toContain('opening-spells')
    expect(ids).not.toContain('opening-talk')
  })

  it('without the journal (or once done) the panel is the quest topics as before', () => {
    const p = fixture()
    expect(nextSteps(p, 'nudges').some((s) => s.opening)).toBe(false)
    expect(nextSteps(p, 'nudges').length).toBeLessThanOrEqual(3)
  })

  it('names companion towns only where the spoiler level allows, and no detail at Off', () => {
    const p = fixture()
    p.memberCount = 1
    const towns = Object.values(LOCATIONS).map((l) => l.name)
    const off = nextSteps(p, 'off', fresh).filter((s) => s.opening)
    expect(off.every((s) => s.detail === undefined)).toBe(true)
    const companions = openingSteps(p, 'off', fresh).find((s) => s.id === 'opening-companions')!
    expect(towns.some((t) => companions.detail.includes(t))).toBe(false)
  })
})
