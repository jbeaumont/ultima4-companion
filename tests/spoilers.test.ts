import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { DISCLOSURE, disclosure, shownTiers } from '@domain/spoilers'
import type { SpoilerLevel } from '@domain/spoilers'
import { HINTS, visibleTiers } from '@domain/hints'
import { nextSteps } from '@domain/guidance'
import { cellVisible, townVisible } from '@domain/mapGating'
import { deedsFor } from '@domain/virtueDeeds'
import { buildSystemPrompt } from '../src/main/sage/prompt'
import { fixedCounsel } from '../src/main/sage/fixedCounsel'

const LEVELS: SpoilerLevel[] = ['off', 'nudges', 'full']
const party = { ...parsePartySav(new Uint8Array(PARTY_SAV_SIZE)), karma: [65, 60, 55, 50, 55, 55, 50, 50], food: 30000 }

describe('the spoiler policy', () => {
  it('treats anything unknown as the strictest level', () => {
    expect(disclosure(undefined)).toBe(DISCLOSURE.off)
    expect(disclosure('everything')).toBe(DISCLOSURE.off)
  })

  it('caps explicit reveals at the level, and shows discovered (solved) topics without revealing', () => {
    const tiers = ['nudge', 'clue', 'answer']
    expect(shownTiers(tiers, 'nudges', 3)).toEqual(['nudge'])
    expect(shownTiers(tiers, 'full', 1)).toEqual(['nudge'])
    expect(shownTiers(tiers, 'full', 0, true)).toEqual(tiers) // solved in the game: no longer a spoiler
    expect(shownTiers(tiers, 'off', 3, true)).toEqual([]) // off shows no hint text at all
  })
})

describe.each(LEVELS)('every surface follows the policy at %s', (level) => {
  const d = disclosure(level)

  it('Hints: no more tiers than the policy allows', () => {
    for (const h of HINTS) expect(visibleTiers(h, level, 3).length).toBe(d.hintTiers)
  })

  it('Dashboard: suggestion nudges only where allowed, never clues or answers', () => {
    for (const s of nextSteps(party, level).filter((x) => !x.elevation)) {
      expect(!!s.detail).toBe(d.suggestionNudges)
      const topic = HINTS.find((h) => h.id === s.id)!
      expect(JSON.stringify(s)).not.toContain(topic.tiers[1])
    }
  })

  it('Map: unvisited towns and unseen cells only with the whole map allowed; visited ones always', () => {
    expect(townVisible(5, [], level, false)).toBe(d.wholeMap)
    expect(townVisible(5, [5], level, false)).toBe(true)
    expect(cellVisible(null, 18, 0, 1, 1, level, false)).toBe(d.wholeMap)
  })

  it('Journal: quest-item deeds only when the deed guide shows everything', () => {
    const skull = (all: boolean) => deedsFor(0, all).some((x) => /Skull/.test(x.deed))
    expect(skull(d.deedGuide === 'all')).toBe(d.deedGuide === 'all')
  })

  it('Sage: the system prompt carries only the allowed tiers; with hints off it is not used at all', () => {
    const prompt = buildSystemPrompt('hawkwind', level)
    for (const h of HINTS) {
      h.tiers.forEach((t, i) => expect(prompt.includes(t), `${h.id} tier ${i + 1}`).toBe(i < d.hintTiers))
    }
    expect(d.sage).toBe(level === 'off' ? 'fixed' : 'generated')
  })
})

describe('fixed counsel (hints off)', () => {
  it('contains no hint text of any tier', () => {
    for (const persona of ['hawkwind', 'lordbritish'] as const) {
      const text = fixedCounsel(party, persona)
      for (const h of HINTS) for (const t of h.tiers) expect(text).not.toContain(t)
      expect(text).toMatch(/hint level/)
    }
  })
})
