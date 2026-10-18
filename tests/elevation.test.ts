import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { elevationSteps } from '../src/domain/elevation'

const base = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))

describe('elevationSteps', () => {
  it('lists virtues at 99, with whether the rune is held', () => {
    const p = { ...base, karma: [99, 50, 0, 99, 50, 50, 99, 50], runes: 0b1 }
    expect(elevationSteps(p).map((e) => [e.virtue, e.hasRune])).toEqual([['Honesty', true], ['Justice', false], ['Spirituality', false]])
    expect(elevationSteps(p)[2]!.note).toMatch(/moongate/)
  })
  it('is empty when nothing is ready (0 is already an Avatar)', () => {
    expect(elevationSteps({ ...base, karma: [0, 98, 50, 50, 50, 50, 50, 50] })).toEqual([])
  })
})
