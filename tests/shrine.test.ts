import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { shrineAdvice } from '../src/domain/shrine'

const base = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
const at = (location: number, karma: number, over = {}) => ({ ...base, location, karma: base.karma.map((_, i) => (i === location - 25 ? karma : 50)), ...over })

describe('shrineAdvice', () => {
  it('is null outside the shrines', () => {
    expect(shrineAdvice(at(0, 50))).toBeNull()
    expect(shrineAdvice(at(5, 50))).toBeNull()
  })

  it('names the virtue and the stage', () => {
    expect(shrineAdvice(at(25, 65))).toMatchObject({ virtue: 'Honesty', stage: 'grow', karma: 65 })
    expect(shrineAdvice(at(32, 99))).toMatchObject({ virtue: 'Humility', stage: 'elevate' })
    expect(shrineAdvice(at(31, 0))).toMatchObject({ virtue: 'Spirituality', stage: 'avatar' })
  })

  it('knows when the mind is still weary', () => {
    expect(shrineAdvice(at(25, 65, { moves: 150, lastMeditation: 1 }))).toMatchObject({ rested: false, movesLeft: 50 })
    expect(shrineAdvice(at(25, 65, { moves: 150, lastMeditation: 0 }))).toMatchObject({ rested: true })
  })
})
