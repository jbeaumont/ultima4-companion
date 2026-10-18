import { describe, expect, it } from 'vitest'
import { LEVEL_CHANGED_NOTE, addQuestion, applyDelta, applyDone, bindRequest, failPending, isAnswering, mentionsApiKey } from '../src/renderer/src/sageTranscript'

describe('sage transcript', () => {
  it('streams deltas into the matching reply', () => {
    let m = bindRequest(addQuestion([], 'hi', false), 'r1')
    m = applyDelta(m, 'r1', 'Hel')
    m = applyDelta(m, 'r1', 'lo')
    m = applyDelta(m, 'other', 'zzz')
    expect(m.map((x) => [x.role, x.text])).toEqual([['user', 'hi'], ['sage', 'Hello']])
    expect(isAnswering(m)).toBe(true)
    m = applyDone(m, { id: 'r1', ok: true })
    expect(isAnswering(m)).toBe(false)
  })

  it('adds a level-change line before the question', () => {
    const m = addQuestion([], 'q', true)
    expect(m[0]).toMatchObject({ role: 'system', text: LEVEL_CHANGED_NOTE })
    expect(m).toHaveLength(3)
  })

  it('shows an error as a system line and drops an empty reply', () => {
    const m = applyDone(bindRequest(addQuestion([], 'q', false), 'r1'), { id: 'r1', ok: false, message: 'No API key' })
    expect(m.map((x) => x.role)).toEqual(['user', 'system'])
    expect(mentionsApiKey(m[1]!.text)).toBe(true)
  })

  it('keeps a partial reply when stopped', () => {
    let m = applyDelta(bindRequest(addQuestion([], 'q', false), 'r1'), 'r1', 'Part')
    m = applyDone(m, { id: 'r1', ok: false, message: 'Stopped.' })
    expect(m.map((x) => [x.role, x.text])).toEqual([['user', 'q'], ['sage', 'Part'], ['system', 'Stopped.']])
    expect(isAnswering(m)).toBe(false)
  })

  it('ignores done for unknown ids and fails an unbound reply', () => {
    const m = addQuestion([], 'q', false)
    expect(applyDone(m, { id: 'x', ok: true })).toBe(m)
    expect(failPending(m, 'boom').map((x) => x.role)).toEqual(['user', 'system'])
  })
})
