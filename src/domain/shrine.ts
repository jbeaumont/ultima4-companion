// What to do inside a shrine, from u4-decompiled U4_SHRIN.C: type the shrine's
// virtue, choose 1-3 cycles, and after each count of dots enter the mantra.
// One meditation per hundred moves. Each good cycle adds 3 Spirituality; three
// cycles with the virtue at 99 grant partial Avatarhood (karma resets to 0).
import type { PartySave } from '../parsers/party'
import { VIRTUES } from './constants'
import { cooldowns } from './cooldowns'

export const FIRST_SHRINE = 25

export interface ShrineAdvice {
  virtue: string
  index: number
  karma: number
  /** 'avatar': already a partial Avatar; 'elevate': at 99, three cycles grant Avatarhood; 'grow': not there yet. */
  stage: 'avatar' | 'elevate' | 'grow'
  /** Whether the mind is rested (the game refuses a second meditation in the same hundred moves). */
  rested: boolean
  movesLeft: number
}

/** Advice for the shrine the party is in, or null outside the shrines. */
export function shrineAdvice(p: PartySave): ShrineAdvice | null {
  const index = p.location - FIRST_SHRINE
  if (index < 0 || index > 7) return null
  const karma = p.karma[index] ?? 0
  const m = cooldowns(p).meditation
  return {
    virtue: VIRTUES[index]!,
    index,
    karma,
    stage: karma === 0 ? 'avatar' : karma >= 99 ? 'elevate' : 'grow',
    rested: m.ready,
    movesLeft: m.movesLeft
  }
}
