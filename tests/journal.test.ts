import { describe, expect, it } from 'vitest'
import { MAX_CLUES, MAX_NOTES, emptyJournal, mergeVisited, normalizeJournal, parseJournal } from '@shared/journal'
import { newClueId, routeLabel, timerLabel } from '@shared/format'

describe('journal normalize', () => {
  it('keeps good data', () => {
    const good = {
      ...emptyJournal(), notes: 'hi', visited: [5, 6], revealed: { 'rune-honesty': 2 }, spoilerLevel: 'full', dialogueMode: 'all',
      clues: [{ id: 'a', text: 'Ask about the rune', source: 'Lord British', location: 'Castle', createdAt: 5 }]
    }
    expect(normalizeJournal(good)).toEqual(good)
  })

  it('fills missing fields', () => {
    expect(normalizeJournal({})).toEqual(emptyJournal())
    expect(normalizeJournal({ notes: 3, clues: 'x' })).toEqual(emptyJournal())
    expect(normalizeJournal({ clues: [{ text: 'bare' }] })).toEqual({
      ...emptyJournal(), clues: [{ id: 'legacy-0', text: 'bare', createdAt: 0 }]
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
    expect(j).toEqual({ ...emptyJournal(), notes: 'n', clues: [{ id: 'a', text: 'ok', createdAt: 1 }] })
    expect(Object.keys(j).sort()).toEqual(['clues', 'dialogueMode', 'met', 'notes', 'revealed', 'spoilerLevel', 'visited'])
  })

  it('makes duplicate ids unique and clamps sizes', () => {
    const j = normalizeJournal({ clues: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] })
    expect(new Set(j.clues.map((c) => c.id)).size).toBe(2)
    expect(normalizeJournal({ notes: 'x'.repeat(MAX_NOTES + 10) }).notes).toHaveLength(MAX_NOTES)
    expect(normalizeJournal({ clues: Array.from({ length: MAX_CLUES + 5 }, (_, i) => ({ id: `${i}`, text: 't' })) }).clues).toHaveLength(MAX_CLUES)
  })

  it('round-trips through JSON', () => {
    const j = { ...emptyJournal(), notes: 'a', visited: [1], clues: [{ id: '1', text: 't', createdAt: 9 }] }
    expect(parseJournal(JSON.stringify(j))).toEqual(j)
  })
})

describe('journal hint and dialogue state', () => {
  it('accepts old journal files without the new fields', () => {
    const old = JSON.stringify({ notes: 'old', clues: [{ id: 'a', text: 'x', createdAt: 1 }] })
    expect(parseJournal(old)).toEqual({
      notes: 'old', clues: [{ id: 'a', text: 'x', createdAt: 1 }],
      visited: [], met: [], revealed: {}, spoilerLevel: 'nudges', dialogueMode: 'visited'
    })
  })

  it('cleans visited: range 1-16, integers, deduped, sorted', () => {
    expect(normalizeJournal({ visited: [9, 5, 5, 0, 17, 2.5, '3', null, 16, 1] }).visited).toEqual([1, 5, 9, 16])
    expect(normalizeJournal({ visited: 'x' }).visited).toEqual([])
    expect(mergeVisited([1, 5], [5, 3, 99])).toEqual([1, 3, 5])
  })

  it('cleans revealed: known topics only, clamped to 0-3', () => {
    const j = normalizeJournal({ revealed: { 'rune-honesty': 2, avatarhood: 9, 'meditation-cycles': -4, nope: 1, 'rune-valor': 'x' } })
    expect(j.revealed).toEqual({ 'rune-honesty': 2, avatarhood: 3, 'meditation-cycles': 0 })
    expect(normalizeJournal({ revealed: [1, 2] }).revealed).toEqual({})
  })

  it('defaults bad spoiler level and dialogue mode', () => {
    expect(normalizeJournal({ spoilerLevel: 'everything', dialogueMode: 3 })).toMatchObject({ spoilerLevel: 'nudges', dialogueMode: 'visited' })
    expect(normalizeJournal({ spoilerLevel: 'off', dialogueMode: 'all' })).toMatchObject({ spoilerLevel: 'off', dialogueMode: 'all' })
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

describe('people met', () => {
  it('keeps valid, unique, sorted keys and merges without dropping any', async () => {
    const { normalizeJournal, mergeMet, metKey } = await import('@shared/journal')
    const j = normalizeJournal({ met: ['6|Iolo', '5|Mariah', '6|Iolo', 'bad', 7, '99999|x'] })
    expect(j.met).toEqual(['5|Mariah', '6|Iolo'])
    expect(mergeMet(['6|Iolo'], [metKey(5, 'Cromwell')])).toEqual(['5|Cromwell', '6|Iolo'])
  })
})
