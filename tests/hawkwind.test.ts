import { describe, expect, it } from 'vitest'
import { hawkwindBand } from '../src/domain/hawkwind'

describe('hawkwindBand', () => {
  it('uses the game thresholds', () => {
    expect([0, 1, 19, 20, 39, 40, 59, 60, 98, 99].map((k) => hawkwindBand(k).step)).toEqual([5, 0, 0, 1, 1, 2, 2, 3, 3, 4])
    expect(hawkwindBand(99).label).toMatch(/meditate/)
  })
})
