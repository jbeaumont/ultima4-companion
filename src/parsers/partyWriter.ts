// PARTY.SAV encoder: writes a PartySave back onto the original bytes, so any
// byte we don't model (the unknown word in each record, junk after a name's
// terminator) is preserved. Mirror of parsePartySav; offsets per xu4 / u4-decompiled.
import { PARTY_SAV_SIZE } from './party'
import type { CharacterRecord, PartySave } from './party'

const RECORD = 39

/** Field limits the game itself respects (u4-decompiled AdjustValue calls / xu4 party.cpp). */
export const LIMITS = {
  hp: 800, // max level 8 = 800 HP; the memory scanner also treats >800 as invalid
  xp: 9999, stat: 50, mp: 99, gold: 9999, food: 999900, karma: 99,
  count: 99, // torches, gems, keys, sextants, reagents, mixtures, armour/weapon counts
  members: 8
} as const

export interface ValidationIssue {
  field: string
  message: string
}

const clampInt = (v: number, max: number) => Math.max(0, Math.min(max, Math.trunc(v)))

/** Problems that would make the game misbehave; an empty list means safe to write. */
export function validateParty(s: PartySave): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const check = (field: string, v: number, max: number) => {
    if (!Number.isInteger(v) || v < 0 || v > max) issues.push({ field, message: `must be a whole number from 0 to ${max}` })
  }
  check('memberCount', s.memberCount, LIMITS.members)
  if (s.memberCount < 1) issues.push({ field: 'memberCount', message: 'the party needs at least the Avatar' })
  s.allRecords.slice(0, s.memberCount).forEach((m, i) => {
    const p = `members[${i}]`
    check(`${p}.hpMax`, m.hpMax, LIMITS.hp)
    check(`${p}.hp`, m.hp, m.hpMax)
    check(`${p}.xp`, m.xp, LIMITS.xp)
    check(`${p}.str`, m.str, LIMITS.stat)
    check(`${p}.dex`, m.dex, LIMITS.stat)
    check(`${p}.int`, m.int, LIMITS.stat)
    check(`${p}.mp`, m.mp, LIMITS.mp)
    check(`${p}.weapon`, m.weapon, 15)
    check(`${p}.armor`, m.armor, 7)
    check(`${p}.classIndex`, m.classIndex, 7)
    if (!'GPSD'.includes(m.status) || m.status.length !== 1) issues.push({ field: `${p}.status`, message: 'must be G, P, S or D' })
    if (!m.name || m.name.length > 15 || /[^\x20-\x7e]/.test(m.name)) issues.push({ field: `${p}.name`, message: '1 to 15 plain characters' })
  })
  check('gold', s.gold, LIMITS.gold)
  check('food', s.food, LIMITS.food)
  s.karma.forEach((k, i) => check(`karma[${i}]`, k, LIMITS.karma))
  for (const f of ['torches', 'gems', 'keys', 'sextants'] as const) check(f, s[f], LIMITS.count)
  s.reagents.forEach((v, i) => check(`reagents[${i}]`, v, LIMITS.count))
  s.mixtures.forEach((v, i) => check(`mixtures[${i}]`, v, LIMITS.count))
  s.armorCounts.forEach((v, i) => check(`armorCounts[${i}]`, v, LIMITS.count))
  s.weaponCounts.forEach((v, i) => check(`weaponCounts[${i}]`, v, LIMITS.count))
  check('items', s.items, 0x1fff)
  check('stones', s.stones, 0xff)
  check('runes', s.runes, 0xff)
  return issues
}

export function encodePartySav(s: PartySave, base?: Uint8Array): Uint8Array {
  const b = base ? Uint8Array.from(base.subarray(0, PARTY_SAV_SIZE)) : new Uint8Array(PARTY_SAV_SIZE)
  const u8 = (o: number, v: number) => { b[o] = v & 0xff }
  const u16 = (o: number, v: number) => { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff }
  const u32 = (o: number, v: number) => { u16(o, v & 0xffff); u16(o + 2, Math.floor(v / 0x10000) & 0xffff) }
  const words = (o: number, vs: number[]) => vs.forEach((v, i) => u16(o + i * 2, v))

  u32(0x000, s.counter)
  u32(0x004, s.moves)
  s.allRecords.forEach((m, i) => writeRecord(b, 0x08 + i * RECORD, m))
  u32(0x140, s.food)
  u16(0x144, s.gold)
  words(0x146, s.karma)
  u16(0x156, s.torches)
  u16(0x158, s.gems)
  u16(0x15a, s.keys)
  u16(0x15c, s.sextants)
  words(0x15e, s.armorCounts)
  words(0x16e, s.weaponCounts)
  words(0x18e, s.reagents)
  words(0x19e, s.mixtures)
  u16(0x1d2, s.items)
  u8(0x1d4, s.x)
  u8(0x1d5, s.y)
  u8(0x1d6, s.stones)
  u8(0x1d7, s.runes)
  // the parser caps the count at 8; keep the stored word unless the count was edited
  if (Math.min(8, b[0x1d8]! | (b[0x1d9]! << 8)) !== s.memberCount) u16(0x1d8, s.memberCount)
  u16(0x1da, s.transport)
  u16(0x1dc, s.balloonOrTorch)
  u16(0x1de, s.trammel)
  u16(0x1e0, s.felucca)
  u16(0x1e2, s.hull)
  // lbIntro is a boolean in the model; keep the stored word when its truthiness is unchanged
  if ((b[0x1e4]! | b[0x1e5]!) !== 0 !== s.lbIntro) u16(0x1e4, s.lbIntro ? 1 : 0)
  u16(0x1e6, s.lastCamp)
  u16(0x1e8, s.lastReagent)
  u16(0x1ea, s.lastMeditation)
  u16(0x1ec, s.lastVirtueTalk)
  u8(0x1ee, s.outX)
  u8(0x1ef, s.outY)
  u16(0x1f0, s.orientation)
  u16(0x1f2, s.dungeonLevel)
  u16(0x1f4, s.location)
  return b
}

function writeRecord(b: Uint8Array, off: number, m: CharacterRecord): void {
  const u16 = (o: number, v: number) => { b[off + o] = v & 0xff; b[off + o + 1] = (v >>> 8) & 0xff }
  u16(0x00, m.hp)
  u16(0x02, m.hpMax)
  u16(0x04, m.xp)
  u16(0x06, m.str)
  u16(0x08, m.dex)
  u16(0x0a, m.int)
  u16(0x0c, m.mp)
  u16(0x10, m.weapon)
  u16(0x12, m.armor)
  // only rewrite the name field when the name changed, keeping the original padding bytes
  let stored = ''
  for (let i = 0; i < 16 && b[off + 0x14 + i] !== 0; i++) stored += String.fromCharCode(b[off + 0x14 + i]!)
  if (stored !== m.name) {
    for (let i = 0; i < 16; i++) b[off + 0x14 + i] = i < m.name.length ? m.name.charCodeAt(i) & 0xff : 0
  }
  if (m.sex !== 'unknown') b[off + 0x24] = m.sex === 'male' ? 0x0b : 0x0c
  b[off + 0x25] = m.classIndex & 0xff
  b[off + 0x26] = m.status.charCodeAt(0) & 0xff
}

/** Clamp an edited save into the ranges validateParty accepts (for sliders and quick cheats). */
export function clampParty(s: PartySave): PartySave {
  const allRecords = s.allRecords.map((m, i) =>
    i < s.memberCount
      ? { ...m, hpMax: clampInt(m.hpMax, LIMITS.hp), hp: clampInt(m.hp, clampInt(m.hpMax, LIMITS.hp)), xp: clampInt(m.xp, LIMITS.xp), str: clampInt(m.str, LIMITS.stat), dex: clampInt(m.dex, LIMITS.stat), int: clampInt(m.int, LIMITS.stat), mp: clampInt(m.mp, LIMITS.mp) }
      : m
  )
  const cnt = (v: number) => clampInt(v, LIMITS.count)
  return {
    ...s,
    allRecords,
    members: allRecords.slice(0, s.memberCount),
    gold: clampInt(s.gold, LIMITS.gold),
    food: clampInt(s.food, LIMITS.food),
    karma: s.karma.map((k) => clampInt(k, LIMITS.karma)),
    torches: cnt(s.torches), gems: cnt(s.gems), keys: cnt(s.keys), sextants: cnt(s.sextants),
    reagents: s.reagents.map(cnt), mixtures: s.mixtures.map(cnt),
    armorCounts: s.armorCounts.map(cnt), weaponCounts: s.weaponCounts.map(cnt)
  }
}
