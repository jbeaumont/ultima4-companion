import { describe, expect, it } from 'vitest'
import { MAX_CLUES, MAX_NOTES, emptyJournal, normalizeJournal, parseJournal } from '@shared/journal'
import { newClueId, routeLabel, timerLabel } from '@shared/format'

describe('journal normalize', () => {
  it('keeps good data', () => {
    const good = { notes: 'hi', clues: [{ id: 'a', text: 'Ask about the rune', source: 'Lord British', location: 'Castle', createdAt: 5 }] }
    expect(normalizeJournal(good)).toEqual(good)
  })

  it('fills missing fields', () => {
    expect(normalizeJournal({})).toEqual(emptyJournal())
    expect(normalizeJournal({ notes: 3, clues: 'x' })).toEqual(emptyJournal())
    expect(normalizeJournal({ clues: [{ text: 'bare' }] })).toEqual({
      notes: '', clues: [{ id: 'legacy-0', text: 'bare', createdAt: 0 }]
    })
  })

  it('falls back to empty on corrupt input', () => {
    for (const bad of [null, undefined, 42, 'str', [], true]) expect(normalizeJournal(bad)).toEqual(emptyJournal())
    expect(parseJournal('{not json')).toEqual(emptyJournal())
    expect(parseJournal('')).toEqual(emptyJournal())
  })

  it('drops unknown fields and invalid clues', () => {
    const j = normalizeJournal({
      notes: 'n', evil: 1,
      clues: [{ id: 'a', text: 'ok', extra: 'x', createdAt: 1 }, { id: 'b', text: '   ' }, null, 7, { id: 'c' }]
    })
    expect(j).toEqual({ notes: 'n', clues: [{ id: 'a', text: 'ok', createdAt: 1 }] })
    expect(Object.keys(j)).toEqual(['notes', 'clues'])
  })

  it('makes duplicate ids unique and clamps sizes', () => {
    const j = normalizeJournal({ clues: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] })
    expect(new Set(j.clues.map((c) => c.id)).size).toBe(2)
    expect(normalizeJournal({ notes: 'x'.repeat(MAX_NOTES + 10) }).notes).toHaveLength(MAX_NOTES)
    expect(normalizeJournal({ clues: Array.from({ length: MAX_CLUES + 5 }, (_, i) => ({ id: `${i}`, text: 't' })) }).clues).toHaveLength(MAX_CLUES)
  })

  it('round-trips through JSON', () => {
    const j = { notes: 'a', clues: [{ id: '1', text: 't', createdAt: 9 }] }
    expect(parseJournal(JSON.stringify(j))).toEqual(j)
  })
})

describe('format helpers', () => {
  it('route labels', () => {
    expect(routeLabel(null)).toBe('never')
    expect(routeLabel(0)).toBe('now')
    expect(routeLabel(1)).toBe('in 1 phase change')
    expect(routeLabel(5)).toBe('in 5 phase changes')
  })

  it('timer labels', () => {
    expect(timerLabel({ ready: true, movesLeft: 0 })).toBe('Ready')
    expect(timerLabel({ ready: false, movesLeft: 1 })).toBe('in 1 move')
    expect(timerLabel({ ready: false, movesLeft: 40 })).toBe('in 40 moves')
  })

  it('clue ids differ', () => {
    expect(newClueId(1000, 0.1)).not.toBe(newClueId(1000, 0.2))
  })
})
