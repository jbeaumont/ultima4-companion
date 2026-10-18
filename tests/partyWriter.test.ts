import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { clampParty, encodePartySav, validateParty } from '@parsers/partyWriter'
import { GAME_DIR, gameFile, hasGame } from './gameFiles'

function noisy(): Uint8Array {
  const b = new Uint8Array(PARTY_SAV_SIZE)
  let s = 99
  for (let i = 0; i < b.length; i++) { s = (s * 1103515245 + 12345) >>> 0; b[i] = s >>> 24 }
  return b
}

describe('encodePartySav', () => {
  it('round-trips arbitrary bytes exactly when nothing is edited', () => {
    const raw = noisy()
    expect(encodePartySav(parsePartySav(raw), raw)).toEqual(raw)
  })

  it('applies edits and keeps everything else', () => {
    const raw = noisy()
    const s = parsePartySav(raw)
    s.gold = 1234
    s.karma[2] = 0
    s.allRecords[0] = { ...s.allRecords[0]!, name: 'Avatar', hp: 100, hpMax: 300, status: 'G', sex: 'female' }
    const out = encodePartySav(s, raw)
    const back = parsePartySav(out)
    expect(back.gold).toBe(1234)
    expect(back.karma[2]).toBe(0)
    expect(back.allRecords[0]).toMatchObject({ name: 'Avatar', hp: 100, hpMax: 300, status: 'G', sex: 'female' })
    // untouched bytes survive: the unknown word in record 0, and record 1 entirely
    expect(out.slice(0x08 + 0x0e, 0x08 + 0x10)).toEqual(raw.slice(0x08 + 0x0e, 0x08 + 0x10))
    expect(out.slice(0x2f, 0x2f + 39)).toEqual(raw.slice(0x2f, 0x2f + 39))
  })

  it('encodes moves and food above 16 bits', () => {
    const s = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
    s.moves = 0x12345
    s.food = 999900
    const back = parsePartySav(encodePartySav(s))
    expect(back.moves).toBe(0x12345)
    expect(back.food).toBe(999900)
  })
})

describe('validateParty / clampParty', () => {
  const valid = () => {
    const s = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
    s.memberCount = 1
    s.allRecords[0] = { ...s.allRecords[0]!, name: 'Danny', hp: 200, hpMax: 200, status: 'G', classIndex: 0, sex: 'male' }
    s.members = s.allRecords.slice(0, 1)
    return s
  }
  it('accepts a sane party', () => expect(validateParty(valid())).toEqual([]))
  it('flags out-of-range values', () => {
    const s = valid()
    s.gold = 20000
    s.allRecords[0]!.hp = 300 // above hpMax
    s.allRecords[0]!.name = ''
    const fields = validateParty(s).map((i) => i.field)
    expect(fields).toEqual(expect.arrayContaining(['gold', 'members[0].hp', 'members[0].name']))
  })
  it('clamps into range', () => {
    const s = valid()
    s.gold = 20000
    s.allRecords[0]!.hpMax = 5000
    s.allRecords[0]!.hp = 5000
    expect(validateParty(clampParty(s))).toEqual([])
  })
})

describe.skipIf(!hasGame)('real saves round-trip byte for byte', () => {
  const saves = ['PARTY.SAV', 'PARTY.NEW']
  try {
    if (readdirSync(`${GAME_DIR}\\cloud_saves`).includes('PARTY.SAV')) saves.push('cloud_saves\\PARTY.SAV')
  } catch { /* no cloud saves */ }
  it.each(saves)('%s', (name) => {
    const raw = gameFile(name)
    expect(encodePartySav(parsePartySav(raw), raw)).toEqual(raw.slice(0, PARTY_SAV_SIZE))
  })
})
