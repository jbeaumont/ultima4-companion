// The eight companions, in PARTY.SAV template order (name, class).
import type { CharacterRecord, PartySave } from '@parsers/party'
import { LOCATIONS, VIRTUES } from './constants'

export const COMPANIONS = [
  { name: 'Mariah', classIndex: 0 },
  { name: 'Iolo', classIndex: 1 },
  { name: 'Geoffrey', classIndex: 2 },
  { name: 'Jaana', classIndex: 3 },
  { name: 'Julia', classIndex: 4 },
  { name: 'Dupre', classIndex: 5 },
  { name: 'Shamino', classIndex: 6 },
  { name: 'Katrina', classIndex: 7 }
] as const

export type CompanionStatus = 'party' | 'sameClass' | 'unmet'

export const STATUS_TEXT: Record<CompanionStatus, string> = {
  party: 'In your party', sameClass: 'Shares your class', unmet: 'Not yet met'
}

/** Joined if in the party; otherwise a same-class companion can't join; else not yet met. */
export function companionStatus(
  c: { name: string; classIndex: number }, members: readonly CharacterRecord[], avatarClass: number
): CompanionStatus {
  if (members.some((m) => m.name === c.name)) return 'party'
  return c.classIndex === avatarClass ? 'sameClass' : 'unmet'
}

/** Town where a companion waits: Moonglow (5) for the mage through Magincia (12) for the shepherd. */
export const companionTown = (classIndex: number): number => classIndex + 5

export type JoinReadiness =
  | { kind: 'party' }
  | { kind: 'sameClass' }
  | { kind: 'ready'; town: string }
  | { kind: 'needs'; town: string; reasons: string[] }

/**
 * Whether a companion would join now, per u4-decompiled U4_TALK.C TLK_join: not
 * if they share the Avatar's class; the town's virtue must be at least 40 (or 0,
 * a partial Avatar); and the Avatar's max HP at least 100 x (party size + 1).
 */
export function joinReadiness(c: { name: string; classIndex: number }, p: PartySave): JoinReadiness {
  if (p.members.some((m) => m.name === c.name)) return { kind: 'party' }
  const avatar = p.allRecords[0]
  if (c.classIndex === avatar?.classIndex) return { kind: 'sameClass' }
  const town = LOCATIONS[companionTown(c.classIndex)]?.name ?? '?'
  const reasons: string[] = []
  const karma = p.karma[c.classIndex] ?? 0
  if (karma !== 0 && karma < 40) reasons.push(`${VIRTUES[c.classIndex]} 40 (now ${karma})`)
  const needHp = 100 * (Math.max(1, p.memberCount) + 1)
  if ((avatar?.hpMax ?? 0) < needHp) reasons.push(`level ${needHp / 100} (${needHp} max HP)`)
  return reasons.length ? { kind: 'needs', town, reasons } : { kind: 'ready', town }
}
