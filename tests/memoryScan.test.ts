import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { findPartyBlocks, looksLikeParty, nameKey, pickLive } from '../src/main/memory/scan'

/** A valid two-member party block with the given move count. */
function party(moves: number, names = ['Shamino', 'Iolo']): Uint8Array {
  const b = new Uint8Array(PARTY_SAV_SIZE)
  const u16 = (o: number, v: number) => { b[o] = v & 0xff; b[o + 1] = v >> 8 }
  u16(0x004, moves & 0xffff)
  u16(0x006, moves >>> 16)
  names.forEach((n, i) => {
    const r = 0x08 + i * 39
    u16(r, 150); u16(r + 2, 200)
    b.set([...n].map((c) => c.charCodeAt(0)), r + 0x14)
    b[r + 0x24] = 0x0b; b[r + 0x25] = i; b[r + 0x26] = 'G'.charCodeAt(0)
  })
  u16(0x1d8, names.length)
  u16(0x1f4, 6)
  return b
}

/** Pseudo-random noise, deterministic so failures reproduce. */
function noise(size: number, seed = 7): Uint8Array {
  const b = new Uint8Array(size)
  let s = seed
  for (let i = 0; i < size; i++) { s = (s * 1103515245 + 12345) >>> 0; b[i] = s >>> 24 }
  return b
}

describe('looksLikeParty', () => {
  it('accepts a valid block and rejects corrupt ones', () => {
    expect(looksLikeParty(party(10))).toBe(true)
    const bad = party(10); bad[0x08 + 0x24] = 0x00 // sex byte
    expect(looksLikeParty(bad)).toBe(false)
    const none = party(10); none[0x1d8] = 0 // no members
    expect(looksLikeParty(none)).toBe(false)
    expect(looksLikeParty(new Uint8Array(100))).toBe(false)
  })
})

describe('findPartyBlocks', () => {
  const buf = noise(1 << 20)
  buf.set(party(5000), 300_001)
  buf.set(party(4000), 700_003) // stale copy, e.g. a DOS file buffer

  it('finds blocks by party names', () => {
    expect(findPartyBlocks(buf, ['Shamino', 'Iolo'])).toEqual([300_001, 700_003])
    expect(findPartyBlocks(buf, ['Dupre'])).toEqual([])
  })

  it('finds blocks without a reference save', () => {
    expect(findPartyBlocks(buf)).toEqual(expect.arrayContaining([300_001, 700_003]))
  })

  it('prefers the copy that has advanced furthest', () => {
    const blocks = findPartyBlocks(buf, ['Shamino', 'Iolo']).map((o) => ({ address: BigInt(o), bytes: buf.slice(o, o + PARTY_SAV_SIZE) }))
    expect(pickLive(blocks)?.address).toBe(300_001n)
    expect(pickLive([])).toBeNull()
  })

  it('builds the name key from the save', () => {
    expect(nameKey(parsePartySav(party(1)))).toEqual(['Shamino', 'Iolo'])
  })
})
