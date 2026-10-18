import { describe, expect, it } from 'vitest'
import { DEEDS, deedsFor } from '../src/domain/virtueDeeds'

describe('virtue deeds', () => {
  it('covers every virtue with at least one way up', () => {
    for (let v = 0; v < 8; v++) expect(deedsFor(v, false).some((d) => d.good), `virtue ${v}`).toBe(true)
  })
  it('lists good deeds first and hides spoilers unless allowed', () => {
    const hon = deedsFor(0, false)
    expect(hon[0]!.good).toBe(true)
    expect(hon.some((d) => /Skull/.test(d.deed))).toBe(false)
    expect(deedsFor(0, true).some((d) => /Skull/.test(d.deed))).toBe(true)
  })
  it('names a source for every deed', () => {
    expect(DEEDS.every((d) => /U4_/.test(d.source))).toBe(true)
  })
})
