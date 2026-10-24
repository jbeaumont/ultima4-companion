import type { SpoilerLevel } from '@domain/hints'

/** The spoiler levels as the Hints view and the welcome describe them. */
export const LEVELS: { id: SpoilerLevel; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'No hint text at all: just topic titles and whether you have solved them.' },
  { id: 'nudges', label: 'Nudges only', blurb: 'You may reveal the gentle first nudge for each topic, never the clue or the answer.' },
  { id: 'full', label: 'Full', blurb: 'You may reveal nudge, then clue, then the full answer, one click at a time.' }
]
