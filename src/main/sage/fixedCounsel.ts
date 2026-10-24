// What the sage says when hints are off: fixed, spoiler-free counsel built from
// the player's own state, with no request to a model (a model cannot be trusted
// to withhold what it already knows about the game).
import type { PartySave } from '@parsers/party'
import { VIRTUES } from '@domain/constants'
import { hawkwindBand } from '@domain/hawkwind'
import type { Persona } from './prompt'

const OPENING: Record<Persona, string> = {
  hawkwind: 'Thou hast asked me to keep my counsel, and so I shall speak only of what lies within thee.',
  lordbritish: 'Thou hast asked that I not lead thee by the hand, friend, and I shall honour that.'
}

export function fixedCounsel(p: PartySave | null, persona: Persona): string {
  const lines = [OPENING[persona]]
  if (p) {
    // closest to and furthest from Elevation, in Hawkwind's own terms (what he would tell anyone)
    const ranked = VIRTUES.map((v, i) => ({ v, k: p.karma[i] ?? 0 })).filter((x) => x.k !== 0).sort((a, b) => b.k - a.k)
    if (ranked.length) {
      const best = ranked[0]!
      const worst = ranked[ranked.length - 1]!
      lines.push(`In ${best.v}: ${hawkwindBand(best.k).label.toLowerCase()}.`)
      if (worst.v !== best.v) lines.push(`In ${worst.v}: ${hawkwindBand(worst.k).label.toLowerCase()}.`)
    } else {
      lines.push('Thou art already a partial Avatar in every virtue.')
    }
  }
  lines.push('Speak with the folk of every town, and write down what they tell thee.')
  lines.push('Should thou wish my guidance, raise the hint level in the Hints view.')
  return lines.join(' ')
}
