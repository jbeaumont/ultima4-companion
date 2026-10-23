import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE } from '@parsers/party'
import { BATTLE_DS } from '@parsers/battle'
import { ObservationTracker, RETRYING_AFTER, takeSample } from '../src/main/memory/observation'
import { STALE_MS, sourceLabel } from '@shared/observationLabel'
import type { GameState } from '@shared/types'

/** A valid one-member party block with the given move count (as the memory scanner expects). */
function party(moves: number): Uint8Array {
  const b = new Uint8Array(PARTY_SAV_SIZE)
  const u16 = (o: number, v: number) => { b[o] = v & 0xff; b[o + 1] = v >> 8 }
  u16(0x004, moves)
  u16(0x08, 150); u16(0x0a, 200)
  b.set([...'Danny'].map((c) => c.charCodeAt(0)), 0x08 + 0x14)
  b[0x08 + 0x24] = 0x0b; b[0x08 + 0x26] = 'G'.charCodeAt(0)
  u16(0x1d8, 1)
  u16(0x1f4, 6)
  return b
}

/** Fake game memory: a data segment with the party block at DS:9144; `onRead` can change it mid-sample. */
function memory(initialMoves: number) {
  const DS = 0x10000n
  const seg = new Uint8Array(0x10000)
  seg.set(party(initialMoves), BATTLE_DS.party)
  let reads = 0
  let onRead: ((n: number) => void) | null = null
  const read = (address: bigint, size: number) => {
    onRead?.(reads++)
    const off = Number(address - DS)
    return off >= 0 && off + size <= seg.length ? seg.slice(off, off + size) : null
  }
  return {
    read,
    address: DS + BigInt(BATTLE_DS.party),
    setMoves: (m: number) => seg.set(party(m), BATTLE_DS.party),
    wipe: () => seg.fill(0, BATTLE_DS.party, BATTLE_DS.party + PARTY_SAV_SIZE),
    onRead: (f: (n: number) => void) => (onRead = f)
  }
}

describe('consistent samples', () => {
  it('reads party, battle and conversation as one sample', () => {
    const m = memory(42)
    const r = takeSample(m.read, m.address)
    expect(r.kind).toBe('ok')
  })

  it('retries when the party changes mid-sample, and accepts the settled read', () => {
    const m = memory(42)
    m.onRead((n) => { if (n === 2) m.setMoves(43) }) // a move lands during the first attempt only
    const r = takeSample(m.read, m.address)
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.sample.party[4]).toBe(43)
  })

  it('reports a sample inconsistent when every attempt is torn', () => {
    const m = memory(42)
    let moves = 42
    m.onRead(() => m.setMoves(++moves)) // changes on every read
    expect(takeSample(m.read, m.address).kind).toBe('inconsistent')
  })

  it('reports the party gone when the block no longer looks like one', () => {
    const m = memory(42)
    m.wipe()
    expect(takeSample(m.read, m.address).kind).toBe('gone')
  })
})

describe('observation tracking', () => {
  it('keeps a stationary party healthy: every good read counts, changed or not', () => {
    const t = new ObservationTracker()
    t.attach(100, 1000)
    t.ok(1250)
    const o = t.ok(1500)
    expect(o).toMatchObject({ status: 'live', sequence: 2, observedAt: 1500 })
  })

  it('marks the view unreliable only after repeated inconsistent samples, and recovers', () => {
    const t = new ObservationTracker()
    t.attach(100, 1000)
    expect(t.inconsistent().status).toBe(RETRYING_AFTER > 1 ? 'live' : 'retrying')
    for (let i = 1; i < RETRYING_AFTER; i++) t.inconsistent()
    expect(t.current()).toMatchObject({ status: 'retrying', failures: RETRYING_AFTER })
    expect(t.ok(2000)).toMatchObject({ status: 'live' })
    expect(t.current()!.failures).toBeUndefined()
  })

  it('starts a new session on reattach', () => {
    const t = new ObservationTracker()
    const first = t.attach(100, 1000)
    t.ok(1200)
    t.detach()
    expect(t.current()).toBeNull()
    const second = t.attach(200, 5000)
    expect(second.session).not.toBe(first.session)
    expect(second.sequence).toBe(0)
  })
})

describe('source labels', () => {
  const state = (source: GameState['source'], observation?: GameState['observation']): GameState =>
    ({ status: 'ok', source, gameDir: null, savePath: null, updatedAt: null, party: null, observation }) as GameState

  it('calls a fresh live view live, however long the party stands still', () => {
    expect(sourceLabel(state('memory', { session: 's', sequence: 9, observedAt: 1000, status: 'live' }), 1000 + STALE_MS - 1).level).toBe('live')
  })
  it('calls out a live view with no recent read, and one failing checks', () => {
    expect(sourceLabel(state('memory', { session: 's', sequence: 9, observedAt: 1000, status: 'live' }), 1000 + STALE_MS + 1000).text).toMatch(/no update/)
    expect(sourceLabel(state('memory', { session: 's', sequence: 9, observedAt: 1000, status: 'retrying' }), 1000).text).toMatch(/checking/)
  })
  it('tells a fallback after the game closed from a plain save file', () => {
    expect(sourceLabel(state('saveFile', { session: 'save', sequence: 0, observedAt: 0, status: 'detached' }), 0).text).toMatch(/Game closed/)
    expect(sourceLabel(state('saveFile', { session: 'save', sequence: 0, observedAt: 0, status: 'saveFile' }), 0).text).toBe('Save file')
  })
})
