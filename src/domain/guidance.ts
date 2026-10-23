// What the Dashboard suggests doing next, as data: the same list the "Suggested
// next" panel shows, so replay tests check production guidance without a UI.
import type { PartySave } from '../parsers/party'
import { elevationSteps } from './elevation'
import { suggestedTopics } from './hints'
import type { SpoilerLevel } from './hints'
import { progress } from './progress'

export interface NextStep {
  /** Hint topic id, or "elevation-<virtue>". */
  id: string
  title: string
  /** Shown under the title; hint text only when the spoiler level allows nudges. */
  detail?: string
  elevation?: boolean
}

/** Up to three next steps: virtues ready for Elevation first, then suggested hint topics. */
export function nextSteps(p: PartySave, level: SpoilerLevel): NextStep[] {
  // a virtue at 99 is the most valuable thing to do next: lead with it
  const ready = elevationSteps(p)
  const topics = suggestedTopics(progress(p), p.location)
    .filter((t) => !(ready.length && t.id === 'avatarhood'))
    .slice(0, Math.max(1, 3 - ready.length))
  return [
    ...ready.map((e) => ({
      id: `elevation-${e.virtue.toLowerCase()}`,
      title: `Elevation in ${e.virtue}`,
      detail: [
        `Meditate 3 cycles at the Shrine of ${e.virtue}.`,
        e.hasRune ? 'You hold its rune.' : `You need the Rune of ${e.virtue} to enter.`,
        e.note ?? ''
      ].filter(Boolean).join(' '),
      elevation: true
    })),
    ...topics.map((t) => ({ id: t.id, title: t.title, ...(level !== 'off' ? { detail: t.tiers[0] } : {}) }))
  ]
}
