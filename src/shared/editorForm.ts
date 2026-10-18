// Pure helpers for the save editor form: bitfields, food units, member edits, quick cheats.
import type { CharacterRecord, PartySave } from '@parsers/party'
import { LIMITS, clampParty } from '@parsers/partyWriter'

export const hasBit = (word: number, mask: number): boolean => (word & mask) !== 0
export const setBit = (word: number, mask: number, on: boolean): number => (on ? word | mask : word & ~mask)

/** Food is stored in hundredths; the game shows it divided by 100. */
export const foodToText = (food: number): string => (Number.isFinite(food) ? String(food / 100) : '')
/** NaN when the text is not a number; rounded to whole hundredths. */
export function textToFood(text: string): number {
  const t = text.trim()
  if (t === '' || !Number.isFinite(Number(t))) return NaN
  return Math.round(Number(t) * 100)
}

/** Input text to a number; NaN (so validation flags it) when empty or not numeric. */
export const textToInt = (text: string): number => (text.trim() === '' ? NaN : Number(text))

/** Replace one member record, keeping `members` (derived from allRecords) in step. */
export function patchMember(p: PartySave, i: number, patch: Partial<CharacterRecord>): PartySave {
  const allRecords = p.allRecords.map((m, j) => (j === i ? { ...m, ...patch } : m))
  return { ...p, allRecords, members: allRecords.slice(0, p.memberCount) }
}

export const patchList = (list: number[], i: number, v: number): number[] => list.map((x, j) => (j === i ? v : x))

/** True when the two saves differ in any field the editor can touch. */
export const isEdited = (a: PartySave, b: PartySave): boolean => JSON.stringify(a.allRecords) !== JSON.stringify(b.allRecords) ||
  (['memberCount', 'food', 'gold', 'torches', 'gems', 'keys', 'sextants', 'items', 'stones', 'runes'] as const).some((k) => a[k] !== b[k]) ||
  (['karma', 'reagents', 'mixtures'] as const).some((k) => a[k].join() !== b[k].join())

/** Quick cheats: each returns a new, clamped save and touches nothing else. */
export const cheats = {
  /** Full HP for everyone who is alive; the dead stay dead (resurrecting is a game action). */
  heal: (p: PartySave): PartySave => mapMembers(p, (m) => (m.status === 'D' ? m : { ...m, hp: m.hpMax })),
  /** Poisoned or sleeping members become Good. */
  cure: (p: PartySave): PartySave => mapMembers(p, (m) => (m.status === 'P' || m.status === 'S' ? { ...m, status: 'G' } : m)),
  maxGold: (p: PartySave): PartySave => clampParty({ ...p, gold: LIMITS.gold }),
  allReagents: (p: PartySave): PartySave => clampParty({ ...p, reagents: p.reagents.map(() => LIMITS.count) }),
  allRunes: (p: PartySave): PartySave => ({ ...p, runes: 0xff }),
  allStones: (p: PartySave): PartySave => ({ ...p, stones: 0xff })
}

function mapMembers(p: PartySave, f: (m: CharacterRecord) => CharacterRecord): PartySave {
  const allRecords = p.allRecords.map((m, i) => (i < p.memberCount ? f(m) : m))
  return clampParty({ ...p, allRecords, members: allRecords.slice(0, p.memberCount) })
}

/** Issue lookup for a field path, e.g. 'members[0].hp' or 'gold'. */
export const issueFor = (issues: { field: string; message: string }[], field: string): string | undefined =>
  issues.find((i) => i.field === field)?.message
