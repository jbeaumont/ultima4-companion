// The eight companions, in PARTY.SAV template order (name, class).
import type { CharacterRecord } from '@parsers/party'

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
