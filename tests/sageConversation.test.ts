import { describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { SageConversation, TRUNCATED_NOTE, describeError } from '../src/main/sage/conversation'
import type { SageStream } from '../src/main/sage/conversation'
import { SAGE_HISTORY_CHARS, SAGE_MAX_TOKENS, buildRequest, trimHistory } from '../src/main/sage/request'
import type { SageRequest } from '../src/main/sage/request'
import { buildSystemPrompt } from '../src/main/sage/prompt'

type Reply = { text: string; stop?: string; thinking?: boolean; hang?: boolean; fail?: unknown }

/** A fake client: records each request and answers from a script, without any network. */
function fake(replies: Reply[]) {
  const requests: SageRequest[] = []
  const start = async (request: SageRequest): Promise<SageStream> => {
    requests.push(request)
    const r = replies.shift() ?? { text: 'Hmm.' }
    let listener: (d: string) => void = () => {}
    let abort: () => void = () => {}
    const aborted = new Promise<never>((_, reject) => (abort = () => reject(new Anthropic.APIUserAbortError())))
    return {
      on: (_e, l) => (listener = l),
      abort: () => abort(),
      finalMessage: async () => {
        if (r.fail) throw r.fail
        if (r.hang) await aborted
        listener(r.text)
        const content = [
          ...(r.thinking ? [{ type: 'thinking', thinking: 'pondering', signature: 'sig' }] : []),
          { type: 'text', text: r.text, citations: null }
        ] as Anthropic.Beta.BetaContentBlock[]
        return { content, stop_reason: r.stop ?? 'end_turn', model: 'claude-opus-5-5' }
      }
    }
  }
  return { requests, start }
}

const events = () => {
  const out: { deltas: string[]; done: unknown[] } = { deltas: [], done: [] }
  return { out, on: { delta: (_id: string, t: string) => out.deltas.push(t), done: (_id: string, r: unknown) => out.done.push(r) } }
}

describe('sage requests', () => {
  it('cap the answer at a few-sentences budget, not 64k', () => {
    const r = buildRequest('hawkwind', 'nudges', [], [{ role: 'user', content: 'hi' }])
    expect(r.max_tokens).toBe(SAGE_MAX_TOKENS)
    expect(SAGE_MAX_TOKENS).toBeLessThanOrEqual(8000)
  })

  it('tell the model to trust the current game state over the conversation', () => {
    expect(buildSystemPrompt('hawkwind', 'off')).toMatch(/Trust it over anything said earlier/)
  })
})

describe('sage history', () => {
  const exchange = (q: string, a: string, thinking = false) => [
    { role: 'user', content: q },
    { role: 'system', content: 'state' },
    { role: 'assistant', content: [...(thinking ? [{ type: 'thinking', thinking: 't', signature: 's' }] : []), { type: 'text', text: a }] }
  ] as Anthropic.Beta.BetaMessageParam[]

  it('drops the oldest whole exchanges past the budget and strips thinking from what it keeps', () => {
    const long = 'x'.repeat(SAGE_HISTORY_CHARS / 2)
    const h = [...exchange('one', long, true), ...exchange('two', long, true), ...exchange('three', 'short', true)]
    const t = trimHistory(h)
    expect(t[0]).toEqual({ role: 'user', content: 'two' })
    expect(t.length).toBe(6)
    expect(JSON.stringify(t)).not.toContain('"thinking"')
  })

  it('leaves a history under budget untouched, thinking included', () => {
    const h = exchange('one', 'a', true)
    expect(trimHistory(h)).toEqual(h)
    expect(JSON.stringify(trimHistory(h))).toContain('"thinking"')
  })

  it('stays bounded over a long session', async () => {
    const answer = 'y'.repeat(4000)
    const f = fake(Array.from({ length: 30 }, () => ({ text: answer })))
    const c = new SageConversation(f.start)
    for (let i = 0; i < 30; i++) await c.ask(`q${i}`, `question ${i}`, 'hawkwind', 'nudges', null, events().on)
    const size = JSON.stringify(f.requests.at(-1)!.messages).length
    expect(size).toBeLessThan(SAGE_HISTORY_CHARS * 1.5)
  })

  it('starts afresh when the spoiler level changes, so nothing said under other rules carries over', async () => {
    const f = fake([{ text: 'The mantra is AHM.' }, { text: 'Seek within.' }])
    const c = new SageConversation(f.start)
    await c.ask('1', 'mantra?', 'hawkwind', 'full', null, events().on)
    await c.ask('2', 'and now?', 'hawkwind', 'off', null, events().on)
    expect(JSON.stringify(f.requests[1]!.messages)).not.toContain('AHM')
  })
})

describe('sage answers', () => {
  it('say when an answer was cut off by the budget', async () => {
    const f = fake([{ text: 'Thou must', stop: 'max_tokens' }])
    const e = events()
    await new SageConversation(f.start).ask('1', 'tell me', 'hawkwind', 'nudges', null, e.on)
    expect(e.out.deltas.join('')).toBe(`Thou must${TRUNCATED_NOTE}`)
  })

  it('can be cancelled mid-answer, and the next question still works', async () => {
    const f = fake([{ text: 'never', hang: true }, { text: 'Fine.' }])
    const c = new SageConversation(f.start)
    const e = events()
    const first = c.ask('1', 'slow', 'hawkwind', 'nudges', null, e.on)
    await new Promise((r) => setTimeout(r, 10))
    c.cancel()
    await first
    expect(e.out.done[0]).toEqual({ ok: false, message: 'Stopped.' })
    const e2 = events()
    await c.ask('2', 'again', 'hawkwind', 'nudges', null, e2.on)
    expect(e2.out.done[0]).toMatchObject({ ok: true })
  })

  it('turn provider errors into plain words and keep the conversation usable', async () => {
    const f = fake([{ text: '', fail: new Anthropic.APIConnectionError({ message: 'down' }) }, { text: 'Back.' }])
    const c = new SageConversation(f.start)
    const e = events()
    await c.ask('1', 'hello', 'hawkwind', 'nudges', null, e.on)
    expect(e.out.done[0]).toEqual({ ok: false, message: describeError(new Anthropic.APIConnectionError({ message: 'down' })) })
    expect(c.kept.length).toBe(0)
    await c.ask('2', 'hello', 'hawkwind', 'nudges', null, events().on)
    expect(c.kept.length).toBe(3)
  })
})
