// What the Dashboard suggests doing next, as data: the same list the "Suggested
// next" panel shows, so replay tests check production guidance without a UI.
import type { PartySave } from '../parsers/party'
import { elevationSteps } from './elevation'
import { suggestedTopics } from './hints'
import type { SpoilerLevel } from './hints'
import { openingSteps } from './opening'
import type { Knowledge } from './opening'
import { progress } from './progress'
import { disclosure } from './spoilers'

export interface NextStep {
  /** Hint topic id, or "elevation-<virtue>". */
  id: string
  title: string
  /** Shown under the title; hint text only when the spoiler level allows nudges. */
  detail?: string
  elevation?: boolean
  /** An opening step (#71): general play advice, not a hint topic. */
  opening?: boolean
}

/**
 * Up to three next steps (four while opening steps show): virtues ready for
 * Elevation, then quest topics for the place the party is in, then up to two
 * opening steps (Lord British, companions, spells, gear, talking; only with the
 * playthrough's journal), then the other quest topics. While opening steps show,
 * the general "Becoming a partial Avatar" topic goes last: concrete steps help a
 * new Avatar more.
 */
export function nextSteps(p: PartySave, level: SpoilerLevel, knowledge?: Knowledge): NextStep[] {
  // a virtue at 99 is the most valuable thing to do next: lead with it
  const ready = elevationSteps(p)
  const nudges = disclosure(level).suggestionNudges
  const openers = knowledge ? openingSteps(p, level, knowledge).slice(0, 2) : []
  const all = suggestedTopics(progress(p), p.location).filter((t) => !(ready.length && t.id === 'avatarhood'))
  const here = all.filter((t) => t.relevantAt?.includes(p.location))
  const rest = all.filter((t) => !here.includes(t))
  if (openers.length) rest.sort((a, b) => Number(a.id === 'avatarhood') - Number(b.id === 'avatarhood'))
  const topic = (t: (typeof all)[number]): NextStep => ({ id: t.id, title: t.title, ...(nudges ? { detail: t.tiers[0] } : {}) })
  const steps: NextStep[] = [
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
    ...here.map(topic),
    ...openers.map((o) => ({ id: o.id, title: o.title, ...(nudges ? { detail: o.detail } : {}), opening: true })),
    ...rest.map(topic)
  ]
  return steps.slice(0, Math.max(1, openers.length ? 4 : 3))
}
