import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { CLASSES, ITEM_FLAGS, WEAPONS, describeTransport } from '@domain/constants'
import { gameFile, hasGame } from './gameFiles'

function u16(buf: Uint8Array, off: number, v: number) {
  buf[off] = v & 0xff
  buf[off + 1] = v >> 8
}

describe('parsePartySav (synthetic)', () => {
  const buf = new Uint8Array(PARTY_SAV_SIZE)
  u16(buf, 0x004, 0x2345) // moves low
  u16(buf, 0x006, 0x0001) // moves high
  u16(buf, 0x008, 150) // hp
  u16(buf, 0x00a, 200) // hpMax
  buf.set([...'Shamino'].map((c) => c.charCodeAt(0)), 0x08 + 0x14)
  buf[0x08 + 0x24] = 0x0b
  buf[0x08 + 0x25] = 6 // ranger
  buf[0x08 + 0x26] = 'P'.charCodeAt(0)
  u16(buf, 0x144, 1234) // gold
  u16(buf, 0x146 + 2 * 2, 0) // valor karma 0
  u16(buf, 0x146, 50) // honesty karma
  u16(buf, 0x1d2, ITEM_FLAGS.bell | ITEM_FLAGS.keyT | ITEM_FLAGS.horn)
  buf[0x1d4] = 86
  buf[0x1d5] = 108
  buf[0x1d6] = 0b10000001 // blue + black stones
  buf[0x1d7] = 0b00000100 // valor rune
  u16(buf, 0x1d8, 1)
  u16(buf, 0x1da, 0x14)
  u16(buf, 0x1f2, 0xffff)
  u16(buf, 0x1f4, 6)

  const s = parsePartySav(buf)

  it('reads the header and character record', () => {
    expect(s.moves).toBe(0x12345)
    expect(s.memberCount).toBe(1)
    expect(s.members).toHaveLength(1)
    expect(s.members[0]).toMatchObject({ name: 'Shamino', hp: 150, hpMax: 200, sex: 'male', status: 'P' })
    expect(CLASSES[s.members[0]!.classIndex]).toBe('Ranger')
  })

  it('reads inventory, quest flags and position', () => {
    expect(s.gold).toBe(1234)
    expect(s.karma[0]).toBe(50)
    expect(s.karma[2]).toBe(0)
    expect(s.items & ITEM_FLAGS.bell).toBeTruthy()
    expect(s.items & ITEM_FLAGS.horn).toBeTruthy()
    expect(s.items & ITEM_FLAGS.book).toBe(0)
    expect(s.stones).toBe(0x81)
    expect(s.runes).toBe(0x04)
    expect([s.x, s.y]).toEqual([86, 108])
    expect(describeTransport(s.transport)).toBe('Horse')
    expect(s.dungeonLevel).toBe(0xffff)
    expect(s.location).toBe(6)
  })

  it('rejects truncated files', () => {
    expect(() => parsePartySav(new Uint8Array(10))).toThrow(/PARTY.SAV/)
  })
})

describe.skipIf(!hasGame)('parsePartySav (real install)', () => {
  // the block body still runs when skipped, so only read the install when it exists
  const s = hasGame ? parsePartySav(gameFile('PARTY.SAV')) : parsePartySav(new Uint8Array(PARTY_SAV_SIZE))

  it('reads the default companions', () => {
    const names = s.allRecords.map((r) => r.name)
    expect(names.slice(0, 5)).toEqual(['Mariah', 'Iolo', 'Geoffrey', 'Jaana', 'Julia'])
    expect(s.allRecords[0]).toMatchObject({
      hp: 200, hpMax: 200, xp: 125, str: 9, dex: 12, int: 20, mp: 20, sex: 'female', status: 'G'
    })
    expect(CLASSES[s.allRecords[0]!.classIndex]).toBe('Mage')
    expect(WEAPONS[s.allRecords[0]!.weapon]).toBe('Staff')
    expect(s.allRecords[1]).toMatchObject({ name: 'Iolo', hp: 300, xp: 240, str: 16, dex: 19, int: 13 })
    expect(CLASSES[s.allRecords[1]!.classIndex]).toBe('Bard')
  })
})
