// Virtues ready for Elevation (karma 99): meditate 3 cycles at the virtue's
// shrine with its rune and mantra (u4-decompiled U4_SHRIN.C). The Shrine of
// Spirituality has no map entrance: a moongate leads there when both moons are full.
import type { PartySave } from '../parsers/party'
import { VIRTUES } from './constants'

export interface ElevationStep {
  virtue: string
  index: number
  hasRune: boolean
  /** How to reach the shrine, when it is not a plain walk. */
  note?: string
}

export function elevationSteps(p: PartySave): ElevationStep[] {
  return VIRTUES.flatMap((virtue, index) =>
    (p.karma[index] ?? 0) >= 99
      ? [{
          virtue,
          index,
          hasRune: (p.runes & (1 << index)) !== 0,
          ...(virtue === 'Spirituality' ? { note: 'Its shrine is reached through a moongate when both moons are full.' } : {})
        }]
      : []
  )
}
