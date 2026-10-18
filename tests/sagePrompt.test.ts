import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { HINTS } from '@domain/hints'
import { buildStateMessage, buildSystemPrompt } from '../src/main/sage/prompt'

const word = HINTS.find((h) => h.id === 'word-of-passage')!

describe('buildSystemPrompt spoiler gating', () => {
  it('includes no hint text at all with spoilers off', () => {
    const p = buildSystemPrompt('hawkwind', 'off')
    for (const h of HINTS) for (const t of h.tiers) expect(p).not.toContain(t)
    expect(p).not.toContain('VERAMOCOR')
    expect(p).toContain('Spoilers are OFF')
  })

  it('includes only nudges at the nudges level', () => {
    const p = buildSystemPrompt('hawkwind', 'nudges')
    for (const h of HINTS) {
      expect(p).toContain(h.tiers[0])
      expect(p).not.toContain(h.tiers[1])
      expect(p).not.toContain(h.tiers[2])
    }
    expect(p).not.toContain('VERAMOCOR')
  })

  it('includes answers only at full', () => {
    const p = buildSystemPrompt('lordbritish', 'full')
    expect(p).toContain(word.tiers[2])
    expect(p).toContain('Lord British')
  })

  it('is deterministic, so the prompt cache can hit', () => {
    expect(buildSystemPrompt('hawkwind', 'nudges')).toBe(buildSystemPrompt('hawkwind', 'nudges'))
  })
})

describe('buildStateMessage', () => {
  it('summarises the party, virtues, moons and timers', () => {
    const s = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
    s.memberCount = 1
    s.allRecords[0] = { ...s.allRecords[0]!, name: 'Danny', hp: 150, hpMax: 200, status: 'G', classIndex: 0 }
    s.karma = [50, 0, 50, 50, 50, 50, 50, 99]
    s.runes = 0b10
    s.x = 231
    s.y = 133
    const m = buildStateMessage(s, 'memory', 'nudges')
    expect(m).toContain('live from the running game')
    expect(m).toContain('Danny (Mage, level 2, HP 150/200')
    expect(m).toContain('Compassion 0')
    expect(m).toContain('Partial Avatarhoods: 1/8')
    expect(m).toContain('Runes: Compassion')
    expect(m).toContain('Britannia surface at 231,133')
    expect(m).toContain('Open moongate near Moonglow')
  })

  it('handles a missing save', () => {
    expect(buildStateMessage(null, null, 'off')).toMatch(/unavailable/)
  })
})
