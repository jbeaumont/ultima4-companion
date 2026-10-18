import { describe, expect, it } from 'vitest'
import { emptyDungeonFog, revealDungeon } from '@domain/dungeonFog'
import { cellVisible, seenCount, townVisible } from '@domain/mapGating'
import { unsavedChip } from '@domain/unsavedChip'

describe('townVisible', () => {
  it('needs a visit, full spoilers, or the session override', () => {
    expect(townVisible(5, [], 'nudges', false)).toBe(false)
    expect(townVisible(5, [5], 'nudges', false)).toBe(true)
    expect(townVisible(5, [4], 'hints', false)).toBe(false)
    expect(townVisible(5, [], 'full', false)).toBe(true)
    expect(townVisible(5, [], undefined, true)).toBe(true)
    expect(townVisible(5, [], null, false)).toBe(false)
  })
})

describe('cellVisible', () => {
  const bits = emptyDungeonFog()
  revealDungeon(bits, 18, 2, 3, 3)
  it('shows only seen cells by default', () => {
    expect(cellVisible(bits, 18, 2, 3, 3, 'nudges', false)).toBe(true)
    expect(cellVisible(bits, 18, 2, 4, 3, 'nudges', false)).toBe(true)
    expect(cellVisible(bits, 18, 2, 6, 6, 'nudges', false)).toBe(false)
    expect(cellVisible(bits, 18, 3, 3, 3, 'nudges', false)).toBe(false)
    expect(cellVisible(bits, 19, 2, 3, 3, 'nudges', false)).toBe(false)
  })
  it('reveals everything with full spoilers or the toggle', () => {
    expect(cellVisible(bits, 18, 2, 6, 6, 'full', false)).toBe(true)
    expect(cellVisible(bits, 18, 2, 6, 6, 'nudges', true)).toBe(true)
  })
  it('hides everything until the fog has loaded', () => {
    expect(cellVisible(null, 18, 2, 3, 3, 'nudges', false)).toBe(false)
    expect(cellVisible(null, 18, 2, 3, 3, 'full', false)).toBe(true)
  })
  it('counts seen cells per level', () => {
    expect(seenCount(bits, 18, 2)).toBe(5)
    expect(seenCount(bits, 18, 1)).toBe(0)
    expect(seenCount(null, 18, 2)).toBe(0)
  })
})

describe('unsavedChip', () => {
  it('is hidden when there is nothing unsaved', () => {
    expect(unsavedChip(0, true)).toBeNull()
    expect(unsavedChip(null, true)).toBeNull()
    expect(unsavedChip(undefined, false)).toBeNull()
  })
  it('escalates at 50 and 200', () => {
    expect(unsavedChip(49, true)!.level).toBe('ok')
    expect(unsavedChip(50, true)!.level).toBe('warn')
    expect(unsavedChip(199, true)!.level).toBe('warn')
    expect(unsavedChip(200, true)!.level).toBe('bad')
  })
  it('words the text and the hint', () => {
    expect(unsavedChip(1, true)!.text).toBe('Unsaved: 1 move')
    expect(unsavedChip(12, true)!.hint).toBe('Unsaved: 12 moves · press Q to save')
    expect(unsavedChip(12, false)!.hint).toBe('Unsaved: 12 moves · step outside, then press Q')
  })
})
