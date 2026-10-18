import { describe, expect, it } from 'vitest'
import { FOG_BYTES, FOG_SIZE, emptyFog, exploredCount, exploredPercent, isExplored, reveal, validFog } from '@domain/fog'
import { parseHudBounds } from '@shared/hudBounds'

describe('fog of war', () => {
  it('starts empty and sized for 256x256', () => {
    const f = emptyFog()
    expect(f.length).toBe(FOG_BYTES)
    expect(FOG_BYTES).toBe(8192)
    expect(exploredCount(f)).toBe(0)
    expect(exploredPercent(f)).toBe(0)
  })

  it('reveals an 11x11 square', () => {
    const f = emptyFog()
    expect(reveal(f, 100, 100)).toBe(true)
    expect(exploredCount(f)).toBe(121)
    expect(isExplored(f, 95, 95)).toBe(true)
    expect(isExplored(f, 105, 105)).toBe(true)
    expect(isExplored(f, 94, 100)).toBe(false)
    expect(isExplored(f, 100, 106)).toBe(false)
  })

  it('wraps at the world edges', () => {
    const f = emptyFog()
    reveal(f, 0, 0)
    expect(exploredCount(f)).toBe(121)
    expect(isExplored(f, 251, 251)).toBe(true)
    expect(isExplored(f, 5, 5)).toBe(true)
    expect(isExplored(f, 250, 0)).toBe(false)
    const g = emptyFog()
    reveal(g, 255, 255, 1)
    expect([isExplored(g, 0, 0), isExplored(g, 254, 254), isExplored(g, 1, 1)]).toEqual([true, true, false])
  })

  it('is idempotent and reports changes', () => {
    const f = emptyFog()
    reveal(f, 40, 60)
    const copy = f.slice()
    expect(reveal(f, 40, 60)).toBe(false)
    expect(f).toEqual(copy)
    expect(reveal(f, 41, 60)).toBe(true)
    expect(exploredCount(f)).toBe(121 + 11)
  })

  it('computes percent', () => {
    const f = emptyFog()
    f.fill(0xff)
    expect(exploredCount(f)).toBe(FOG_SIZE * FOG_SIZE)
    expect(exploredPercent(f)).toBe(100)
  })

  it('accepts only exact-size blobs', () => {
    expect(validFog(emptyFog())).toBe(true)
    expect(validFog(new Uint8Array(10))).toBe(false)
    expect(validFog(null)).toBe(false)
  })
})

describe('hud bounds validation', () => {
  it('accepts a full rectangle', () => {
    expect(parseHudBounds({ x: 10, y: 20, width: 380, height: 190 })).toEqual({ x: 10, y: 20, width: 380, height: 190 })
  })
  it('allows negative positions (second monitor)', () => {
    expect(parseHudBounds({ x: -1500, y: 40, width: 400, height: 200 })?.x).toBe(-1500)
  })
  it('keeps size when position is missing or bad', () => {
    expect(parseHudBounds({ width: 380, height: 190 })).toEqual({ width: 380, height: 190 })
    expect(parseHudBounds({ x: 'a', y: 1, width: 380, height: 190 })).toEqual({ width: 380, height: 190 })
    expect(parseHudBounds({ x: 1e9, y: 1, width: 380, height: 190 })).toEqual({ width: 380, height: 190 })
  })
  it('clamps tiny or huge sizes', () => {
    expect(parseHudBounds({ width: 5, height: 5 })).toEqual({ width: 240, height: 120 })
    expect(parseHudBounds({ width: 99999, height: 99999 })).toEqual({ width: 4000, height: 4000 })
  })
  it('rejects junk', () => {
    for (const v of [null, undefined, 3, 'x', {}, { width: NaN, height: 100 }, { width: 300 }]) expect(parseHudBounds(v)).toBeUndefined()
  })
})
