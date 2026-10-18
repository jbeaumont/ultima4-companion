import { describe, expect, it } from 'vitest'
import type { PartySave } from '@parsers/party'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { encodePartySav, validateParty } from '@parsers/partyWriter'
import { ITEM_FLAGS } from '@domain/constants'
import { cheats, foodToText, hasBit, isEdited, issueFor, patchMember, setBit, textToFood, textToInt } from '@shared/editorForm'

function sample(): PartySave {
  const b = new Uint8Array(PARTY_SAV_SIZE)
  const p = parsePartySav(b)
  const rec = { hp: 50, hpMax: 150, xp: 10, str: 15, dex: 15, int: 15, mp: 5, weapon: 0, armor: 0, name: 'Avatar', sex: 'male' as const, classIndex: 2, status: 'G' }
  const allRecords = p.allRecords.map((m, i) => (i < 3 ? { ...rec, name: `P${i}` } : m))
  allRecords[1] = { ...allRecords[1]!, status: 'P' }
  allRecords[2] = { ...allRecords[2]!, status: 'D' }
  return { ...p, memberCount: 3, allRecords, members: allRecords.slice(0, 3), gold: 5, food: 20000 }
}

describe('editor form helpers', () => {
  it('toggles bits', () => {
    const w = setBit(0, ITEM_FLAGS.bell, true)
    expect(hasBit(w, ITEM_FLAGS.bell)).toBe(true)
    expect(hasBit(w, ITEM_FLAGS.book)).toBe(false)
    expect(setBit(w | ITEM_FLAGS.book, ITEM_FLAGS.bell, false)).toBe(ITEM_FLAGS.book)
  })

  it('converts food hundredths', () => {
    expect(foodToText(20050)).toBe('200.5')
    expect(textToFood('200.5')).toBe(20050)
    expect(textToFood('0.07')).toBe(7)
    expect(textToFood('')).toBeNaN()
    expect(textToFood('abc')).toBeNaN()
    expect(textToInt('')).toBeNaN()
    expect(textToInt('12')).toBe(12)
  })

  it('patches a member and keeps members in sync', () => {
    const p = patchMember(sample(), 0, { hp: 99 })
    expect(p.allRecords[0]!.hp).toBe(99)
    expect(p.members[0]!.hp).toBe(99)
    expect(p.members).toHaveLength(3)
  })

  it('detects edits', () => {
    const p = sample()
    expect(isEdited(p, p)).toBe(false)
    expect(isEdited(p, patchMember(p, 0, { name: 'X' }))).toBe(true)
    expect(isEdited(p, { ...p, karma: p.karma.map((k, i) => (i === 2 ? 5 : k)) })).toBe(true)
  })

  it('quick cheats stay valid and only change what they say', () => {
    const p = sample()
    const healed = cheats.heal(p)
    expect(healed.allRecords[0]!.hp).toBe(150)
    expect(healed.allRecords[2]!.hp).toBe(50) // dead stay as they were
    expect(healed.allRecords[2]!.status).toBe('D')
    expect(cheats.cure(p).allRecords[1]!.status).toBe('G')
    expect(cheats.cure(p).allRecords[2]!.status).toBe('D')
    expect(cheats.maxGold(p).gold).toBe(9999)
    expect(cheats.allReagents(p).reagents.every((r) => r === 99)).toBe(true)
    expect(cheats.allRunes(p).runes).toBe(0xff)
    expect(cheats.allStones(p).stones).toBe(0xff)
    for (const f of Object.values(cheats)) expect(validateParty(f(p))).toEqual([])
    // a cheat must round-trip through the encoder
    expect(parsePartySav(encodePartySav(cheats.heal(p))).allRecords[0]!.hp).toBe(150)
  })

  it('finds issues by field', () => {
    const issues = validateParty({ ...sample(), gold: 99999 })
    expect(issueFor(issues, 'gold')).toMatch(/0 to 9999/)
    expect(issueFor(issues, 'food')).toBeUndefined()
  })
})
